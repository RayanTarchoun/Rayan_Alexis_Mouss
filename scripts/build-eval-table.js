import { readFileSync, readdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const RESULTS_DIR = './audit-results';
const OUTPUT_FILE = './eval-table.md';
const MARKER_START = '<!-- AUDIT_PHASE_11_START -->';
const MARKER_END   = '<!-- AUDIT_PHASE_11_END -->';

if (!existsSync(RESULTS_DIR)) {
  console.error(`Dossier ${RESULTS_DIR} introuvable. Lancez d'abord audit-retrieval.js.`);
  process.exit(1);
}

const files = readdirSync(RESULTS_DIR)
  .filter(f => f.endsWith('.json'))
  .sort((a, b) => {
    if (a.startsWith('baseline')) return -1;
    if (b.startsWith('baseline')) return 1;
    return a.localeCompare(b);
  });

if (!files.length) {
  console.error(`Aucun fichier .json trouvé dans ${RESULTS_DIR}.`);
  process.exit(1);
}

console.log(`📊 Agrégation de ${files.length} variante(s)...`);

const variants = files.map(f => JSON.parse(readFileSync(join(RESULTS_DIR, f), 'utf-8')));
const baseline = variants.find(v => v.variant === 'baseline');

// === Génération de la section AUDIT (entre marqueurs) ===

const lines = [];
lines.push(MARKER_START);
lines.push(``);
lines.push(`# Audit Phase 11 — Variantes du pipeline`);
lines.push(``);
lines.push(`> Section auto-générée par \`scripts/build-eval-table.js\` à partir de \`audit-results/*.json\`.`);
lines.push(`> La section "Baseline" en haut de ce fichier (avec notes humaines) est conservée et n'est pas écrasée.`);
lines.push(`>`);
lines.push(`> **Généré le** : ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`);
lines.push(`> **Variantes auditées** : ${variants.length}`);
lines.push(``);

// === Tableau comparatif (en premier, vue d'ensemble) ===

lines.push(`## Tableau comparatif des variantes`);
lines.push(``);
lines.push(`| Variante | Top-1 moy. | Avg-3 moy. | Latence (ms) | Coût ($) | "JNSP" | Δ vs baseline |`);
lines.push(`|----------|-----------|-----------|--------------|----------|--------|---------------|`);

for (const v of variants) {
  const a = v.aggregates;
  const isBaseline = v.variant === 'baseline';
  let delta = '—';
  if (!isBaseline && baseline) {
    const d = (a.avgTopScore || 0) - (baseline.aggregates.avgTopScore || 0);
    const sign = d >= 0 ? '+' : '';
    delta = `${sign}${fmt(d, 3)}`;
  }
  const name = isBaseline ? `**\`${v.variant}\`**` : `\`${v.variant}\``;
  lines.push(`| ${name} | ${fmt(a.avgTopScore, 3)} | ${fmt(a.avgScore, 3)} | ${Math.round(a.avgTotalMs || 0)} | ${fmt(a.totalCostUSD, 4)} | ${a.noAnswerCount}/${a.successful} | ${delta} |`);
}
lines.push(``);

// === Détail par variante ===

for (const variant of variants) {
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Variante : \`${variant.variant}\``);
  lines.push(``);
  const cfg = variant.config;
  lines.push(`**Config** : topK=${cfg.topK}, threshold=${cfg.threshold}, temperature=${cfg.temperature}`);
  if (cfg.chunkSize) {
    lines.push(`**Chunking** : chunkSize=${cfg.chunkSize}, overlap=${cfg.overlap} *(ré-indexation requise)*`);
  }
  lines.push(``);

  lines.push(`| # | Cat. | Question | Top-1 | Avg-3 | Tokens | Coût ($) | Notes |`);
  lines.push(`|---|------|----------|-------|-------|--------|----------|-------|`);

  for (const r of variant.results) {
    if (r.error) {
      lines.push(`| ${r.questionId} | ${r.category} | ${escapeMd(r.question)} | N/A | N/A | N/A | N/A| Erreur : ${escapeMd(r.error)} |`);
      continue;
    }
    const m = r.metrics || {};
    const tokens = `${m.promptTokens ?? '?'}/${m.completionTokens ?? '?'}`;
    const note = r.isNoAnswer
      ? '"Je ne sais pas"'
      : `${r.sources?.length || 0} src, ${r.chunksUsed || 0} chunks`;
    const orphan = (m.orphanCitations || []).length > 0
      ? ` ⚠️ ${m.orphanCitations.length} orph.`
      : '';

    lines.push(`| ${r.questionId} | ${r.category} | ${escapeMd(r.question)} | ${fmt(m.topScore, 2)} | ${fmt(m.avgScore, 2)} | ${tokens} | ${fmt(m.costUSD, 4)} | ${note}${orphan} |`);
  }

  const a = variant.aggregates;
  lines.push(``);
  lines.push(`**Agrégats** : top-1 moy. = ${fmt(a.avgTopScore, 3)} · latence moy. = ${Math.round(a.avgTotalMs || 0)} ms · coût total = $${fmt(a.totalCostUSD, 4)} · "JNSP" = ${a.noAnswerCount}/${a.successful}`);
  if (a.byCategory) {
    const parts = [];
    for (const [cat, stats] of Object.entries(a.byCategory)) {
      parts.push(`${cat} : top-1=${fmt(stats.avgTopScore, 2)} (${stats.count} q., ${stats.noAnswerCount} JNSP)`);
    }
    if (parts.length) lines.push(`**Par catégorie** : ${parts.join(' · ')}`);
  }
  lines.push(``);
}

// === Section régressions (template à remplir) ===

lines.push(`---`);
lines.push(``);
lines.push(`## Régressions identifiées`);
lines.push(``);
lines.push(`> Voir \`PHASE11.md\` pour les hypothèses pré-écrites à valider/ajuster avec les chiffres ci-dessus.`);
lines.push(``);
lines.push(`### Régression #1 — \\<variante\\> sur question \\<id\\>`);
lines.push(``);
lines.push(`*À remplir après lecture des résultats.*`);
lines.push(``);
lines.push(`### Régression #2 — \\<variante\\> sur question \\<id\\>`);
lines.push(``);
lines.push(`*À remplir après lecture des résultats.*`);
lines.push(``);

lines.push(`---`);
lines.push(``);
lines.push(`## Conclusions de l'audit`);
lines.push(``);
lines.push(`*À remplir : config recommandée pour la démo, et pourquoi.*`);
lines.push(``);
lines.push(MARKER_END);

const newAuditSection = lines.join('\n');

// === Écriture : préservation de la zone hors-marqueurs ===

let existing = '';
if (existsSync(OUTPUT_FILE)) {
  existing = readFileSync(OUTPUT_FILE, 'utf-8');
}

let output;
if (existing.includes(MARKER_START) && existing.includes(MARKER_END)) {
  // Remplace uniquement la zone entre marqueurs
  const before = existing.split(MARKER_START)[0];
  const after  = existing.split(MARKER_END)[1] || '';
  output = before + newAuditSection + after;
  console.log(`Section AUDIT mise à jour dans ${OUTPUT_FILE} (baseline préservée)`);
} else if (existing.trim()) {
  // Pas de marqueurs : on ajoute après la baseline existante
  output = existing.trimEnd() + '\n\n' + newAuditSection + '\n';
  console.log(`Section AUDIT ajoutée à ${OUTPUT_FILE} (baseline préservée)`);
} else {
  // Pas de baseline : on écrit juste la section audit
  output = newAuditSection + '\n';
  console.log(`${OUTPUT_FILE} créé (pas de baseline préexistante)`);
}

writeFileSync(OUTPUT_FILE, output);

console.log(`\nProchaines étapes :`);
console.log(`   1. Ouvrez ${OUTPUT_FILE}, vérifiez la section AUDIT en bas`);
console.log(`   2. Rédigez les 2 régressions (voir PHASE11.md pour des hypothèses)`);
console.log(`   3. git add ${OUTPUT_FILE} audit-results/`);

// === Helpers ===

function fmt(n, digits = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'n/a';
  return n.toFixed(digits);
}
function escapeMd(s) {
  if (!s) return '';
  return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
