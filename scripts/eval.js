// Phase 8 : Évaluation et baseline mesurée
// Lance les 10 questions de questions-test.txt et génère eval-table.md
import { ragQuery } from '../rag-pipeline.js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const questionsFile = join(process.cwd(), 'questions-test.txt');
const questions = readFileSync(questionsFile, 'utf-8')
  .split('\n')
  .filter(line => /^\d+\./.test(line.trim()))
  .map(line => line.replace(/^\d+\.\s*/, '').trim())
  .filter(Boolean);

async function runEval() {
  console.log(`Évaluation de ${questions.length} questions sur le corpus Pydantic AI...\n`);

  const results = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    process.stdout.write(`[${i + 1}/${questions.length}] ${q.slice(0, 60)}... `);

    try {
      const r = await ragQuery(q, { topK: 5, verbose: false });
      results.push({ question: q, ...r });
      console.log(
        `✓ top=${r.metrics.topScore.toFixed(2)} avg=${r.metrics.avgScore.toFixed(2)} ` +
        `${r.metrics.promptTokens}/${r.metrics.completionTokens} tok $${r.metrics.costUSD.toFixed(6)}`
      );
      console.log(`   → ${r.answer}\n`);
    } catch (err) {
      console.log(`✗ ${err.message}`);
      results.push({ question: q, error: err.message });
    }
  }

  const totalCost = results.reduce((s, r) => s + (r.metrics?.costUSD ?? 0), 0);
  const avgLatency = results.reduce(
    (s, r) => s + ((r.metrics?.retrievalMs ?? 0) + (r.metrics?.generationMs ?? 0)),
    0
  ) / results.length;

  // Génération du tableau Markdown
  let md = `# Tableau d'évaluation — Baseline\n\n`;
  md += `_Colonne Pertinence et Fidélité : notes humaines à remplir (1-5)_\n\n`;
  md += `| # | Question | Réponse | Top-1 score | Avg top-3 | Tokens (in/out) | Coût ($) | Pertinence (1-5) | Fidélité (1-5) | Notes |\n`;
  md += `|---|----------|---------|-------------|-----------|-----------------|----------|------------------|----------------|-------|\n`;

  results.forEach((r, i) => {
    if (r.error) {
      md += `| ${i + 1} | ${r.question} | ERR | ERR | ERR | ERR | ERR | - | - | ${r.error} |\n`;
    } else {
      const shortAnswer = r.answer.replace(/\n/g, ' ').replace(/\|/g, '\\|').slice(0, 200);
      md += `| ${i + 1} | ${r.question} | ${shortAnswer} | ${r.metrics.topScore.toFixed(2)} | ${r.metrics.avgScore.toFixed(2)} | ${r.metrics.promptTokens}/${r.metrics.completionTokens} | ${r.metrics.costUSD.toFixed(6)} | _/5_ | _/5_ | |\n`;
    }
  });

  md += `\n## Agrégats\n\n`;
  md += `| Métrique | Valeur |\n|---|---|\n`;
  md += `| Coût total (10 questions) | $${totalCost.toFixed(6)} |\n`;
  md += `| Latence moyenne | ${Math.round(avgLatency)} ms |\n`;
  md += `| Moyenne pertinence | _à compléter_ |\n`;
  md += `| Moyenne fidélité | _à compléter_ |\n`;

  const outPath = join(process.cwd(), 'eval-table.md');
  writeFileSync(outPath, md, 'utf-8');
  console.log(`\neval-table.md généré. Remplissez les colonnes Pertinence et Fidélité manuellement.`);
  console.log(`Coût total : $${totalCost.toFixed(6)} | Latence moyenne : ${Math.round(avgLatency)} ms`);
}

runEval().catch(console.error);
