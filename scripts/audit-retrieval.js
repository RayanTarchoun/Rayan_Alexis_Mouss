import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { ragQuery } from '../rag-pipeline.js';

// === CONFIG : les variantes à tester ===
//
// "online"  = tourne sur l'index courant (chunk=400, overlap=50), pas de re-indexation
// "offline" = nécessite re-indexation avec un autre chunkSize/overlap (voir PHASE11.md)
const VARIANTS = {
  // --- BASELINE (référence pour toutes les comparaisons) ---
  baseline:        { mode: 'online',  topK: 5,  threshold: 0.5, temperature: 0.1 },

  // --- AXE topK ---
  topK_1:          { mode: 'online',  topK: 1,  threshold: 0.5, temperature: 0.1 },
  topK_10:         { mode: 'online',  topK: 10, threshold: 0.5, temperature: 0.1 },

  // --- AXE threshold ---
  threshold_0_3:   { mode: 'online',  topK: 5,  threshold: 0.3, temperature: 0.1 },
  threshold_0_7:   { mode: 'online',  topK: 5,  threshold: 0.7, temperature: 0.1 },
  threshold_0_8:   { mode: 'online',  topK: 5,  threshold: 0.8, temperature: 0.1 }, // bonus

  // --- AXE temperature (bonus) ---
  temperature_0:   { mode: 'online',  topK: 5,  threshold: 0.5, temperature: 0.0 },
  temperature_0_3: { mode: 'online',  topK: 5,  threshold: 0.5, temperature: 0.3 },

  // --- AXE chunk_size (offline : re-indexation requise) ---
  chunk_200:       { mode: 'offline', topK: 5,  threshold: 0.5, temperature: 0.1, chunkSize: 200,  overlap: 50  },
  chunk_1000:      { mode: 'offline', topK: 5,  threshold: 0.5, temperature: 0.1, chunkSize: 1000, overlap: 200 },
};

const QUESTIONS_FILE = './questions-test.txt';
const RESULTS_DIR = './audit-results';

// === Parsing de questions-test.txt avec catégories ===

function parseQuestions(filePath) {
  const text = readFileSync(filePath, 'utf-8');
  const lines = text.split('\n');
  const questions = [];
  let currentCategory = 'unknown';

  for (const line of lines) {
    const trimmed = line.trim();
    // Détection de section : "## Happy paths", "## Ambiguës", "## Adversariales"
    if (/^##\s*happy/i.test(trimmed))        currentCategory = 'happy';
    else if (/^##\s*ambig/i.test(trimmed))   currentCategory = 'ambiguous';
    else if (/^##\s*adversari/i.test(trimmed)) currentCategory = 'adversarial';
    // Détection de question : "1. ...", "10. ..."
    const match = trimmed.match(/^(\d+)\.\s*(.+)$/);
    if (match) {
      questions.push({
        id: parseInt(match[1], 10),
        category: currentCategory,
        text: match[2].trim(),
      });
    }
  }

  return questions;
}

// === Exécution d'une variante ===

async function runVariant(variantName) {
  const variant = VARIANTS[variantName];
  if (!variant) {
    console.error(`Variante inconnue : "${variantName}"`);
    console.error(`Variantes disponibles : ${Object.keys(VARIANTS).join(', ')}`);
    process.exit(1);
  }

  const questions = parseQuestions(QUESTIONS_FILE);

  console.log(`\n🔍 Audit variant "${variantName}"`);
  console.log(`   Config : topK=${variant.topK}, threshold=${variant.threshold}, temperature=${variant.temperature}`);
  if (variant.mode === 'offline') {
    console.log(`Mode offline : assurez-vous d'avoir ré-indexé avec chunkSize=${variant.chunkSize}, overlap=${variant.overlap}`);
  }
  console.log(`Questions : ${questions.length}\n`);

  const results = [];
  const startTotal = Date.now();

  for (const q of questions) {
    process.stdout.write(`   [${q.id}/${questions.length}] (${q.category}) ${q.text.slice(0, 60)}... `);
    const t0 = Date.now();

    try {
      const result = await ragQuery(q.text, {
        topK: variant.topK,
        threshold: variant.threshold,
        temperature: variant.temperature,
        verbose: false,
      });

      const totalMs = Date.now() - t0;
      const isNoAnswer = /je ne trouve pas/i.test(result.answer || '');

      results.push({
        questionId: q.id,
        category: q.category,
        question: q.text,
        answer: result.answer,
        sources: result.sources || [],
        chunksUsed: result.chunksUsed || 0,
        isNoAnswer,
        metrics: {
          ...(result.metrics || {}),
          totalMs,
        },
      });

      const m = result.metrics || {};
      console.log(`top=${(m.topScore ?? 0).toFixed(2)} ${m.promptTokens ?? 0}/${m.completionTokens ?? 0} tok ${totalMs}ms`);
    } catch (err) {
      console.log(`${err.message}`);
      results.push({
        questionId: q.id,
        category: q.category,
        question: q.text,
        error: err.message,
      });
    }
  }

  const totalDurationMs = Date.now() - startTotal;
  const successful = results.filter(r => !r.error);

  // Agrégats globaux + par catégorie
  const aggregates = {
    totalQuestions: results.length,
    successful: successful.length,
    failed: results.length - successful.length,
    avgTopScore: avg(successful.map(r => r.metrics?.topScore).filter(Number.isFinite)),
    avgScore: avg(successful.map(r => r.metrics?.avgScore).filter(Number.isFinite)),
    avgRetrievalMs: avg(successful.map(r => r.metrics?.retrievalMs).filter(Number.isFinite)),
    avgGenerationMs: avg(successful.map(r => r.metrics?.generationMs).filter(Number.isFinite)),
    avgTotalMs: avg(successful.map(r => r.metrics?.totalMs).filter(Number.isFinite)),
    totalPromptTokens: sum(successful.map(r => r.metrics?.promptTokens).filter(Number.isFinite)),
    totalCompletionTokens: sum(successful.map(r => r.metrics?.completionTokens).filter(Number.isFinite)),
    totalCostUSD: sum(successful.map(r => r.metrics?.costUSD).filter(Number.isFinite)),
    noAnswerCount: successful.filter(r => r.isNoAnswer).length,
    orphanCitationsCount: sum(successful.map(r => (r.metrics?.orphanCitations || []).length)),
    runDurationMs: totalDurationMs,
    byCategory: {},
  };

  for (const cat of ['happy', 'ambiguous', 'adversarial']) {
    const subset = successful.filter(r => r.category === cat);
    if (!subset.length) continue;
    aggregates.byCategory[cat] = {
      count: subset.length,
      avgTopScore: avg(subset.map(r => r.metrics?.topScore).filter(Number.isFinite)),
      noAnswerCount: subset.filter(r => r.isNoAnswer).length,
    };
  }

  // Sauvegarde
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });
  const outputPath = join(RESULTS_DIR, `${variantName}.json`);
  writeFileSync(outputPath, JSON.stringify({
    variant: variantName,
    config: variant,
    timestamp: new Date().toISOString(),
    results,
    aggregates,
  }, null, 2));

  // Récap console
  console.log(`\nRésultats sauvés dans ${outputPath}`);
  console.log(`   Top-1 score moyen : ${fmt(aggregates.avgTopScore, 3)}`);
  console.log(`   Avg score moyen   : ${fmt(aggregates.avgScore, 3)}`);
  console.log(`   Latence moyenne   : ${Math.round(aggregates.avgTotalMs)} ms`);
  console.log(`   Coût total        : $${fmt(aggregates.totalCostUSD, 4)}`);
  console.log(`   "Je ne sais pas"  : ${aggregates.noAnswerCount}/${aggregates.successful} (attendu : 2 sur les adversariales)`);
  if (aggregates.orphanCitationsCount > 0) {
    console.log(` Citations orphelines : ${aggregates.orphanCitationsCount}`);
  }
}

// === Helpers ===

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}
function fmt(n, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'n/a';
  return n.toFixed(digits);
}

// === Entry point ===

const variantName = process.argv[2];
if (!variantName) {
  console.log('Usage : node scripts/audit-retrieval.js <variantName>');
  console.log(`Variantes disponibles : ${Object.keys(VARIANTS).join(', ')}`);
  console.log('\nExemples :');
  console.log('  node scripts/audit-retrieval.js baseline');
  console.log('  node scripts/audit-retrieval.js topK_10');
  console.log('  node scripts/audit-retrieval.js threshold_0_7');
  process.exit(0);
}

runVariant(variantName).catch(err => {
  console.error('\n Erreur fatale :', err);
  process.exit(1);
});
