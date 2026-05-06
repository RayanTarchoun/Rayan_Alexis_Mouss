// Phase 2 : Chunking avec overlap
// Lecture du corpus, découpage en chunks de 400 mots avec recouvrement de 50.
// L'embedding et l'indexation Pinecone arriveront en Phase 3.
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export const CONFIG = {
  chunkSize: 400,
  overlap: 50,
};

// Phase 2 — Chunking avec overlap
export function chunkWithOverlap(text, chunkSize, overlap) {
  if (overlap >= chunkSize) {
    throw new Error(`overlap (${overlap}) doit être inférieur à chunkSize (${chunkSize})`);
  }
  if (!text || text.trim() === '') return [];

  const words = text.split(' ');
  if (words.length <= chunkSize) return [text.trim()];

  const chunks = [];
  let i = 0;
  while (i < words.length) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
    i += chunkSize - overlap;
  }
  return chunks.filter(c => c.trim().length > 0);
}

// Phase 2 — Chargement du corpus
export function loadCorpus(dir) {
  return readdirSync(dir)
    .filter(f => f.endsWith('.txt') || f.endsWith('.md'))
    .map(filename => ({
      filename,
      text: readFileSync(join(dir, filename), 'utf-8'),
    }));
}

async function main() {
  const CORPUS_DIR = join(process.cwd(), 'corpus');

  console.log('Chargement du corpus...');
  const docs = loadCorpus(CORPUS_DIR);

  const allChunks = [];
  for (const doc of docs) {
    const raw = chunkWithOverlap(doc.text, CONFIG.chunkSize, CONFIG.overlap);
    raw.forEach((text, i) =>
      allChunks.push({ text, filename: doc.filename, chunkIndex: i })
    );
    console.log(`  ${doc.filename}: ${raw.length} chunks`);
  }

  console.log(`\n${docs.length} fichiers trouvés, ${allChunks.length} chunks créés`);
  console.log('\nPhase 2 OK — chunking validé. Phase 3 ajoutera embedding + Pinecone.');
}

main().catch(console.error);
