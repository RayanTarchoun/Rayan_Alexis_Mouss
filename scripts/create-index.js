// Phase 2-3 : Chunking + Batch Embedding + Indexation Pinecone
import { Pinecone } from '@pinecone-database/pinecone';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

export const CONFIG = {
  chunkSize: 400,
  overlap: 50,
  batchSize: 50,
  embedConcurrency: 20, // textes envoyés par appel Mistral (max ~32)
};

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Phase 3 — Appel API Mistral avec retry + backoff exponentiel sur 429
async function embedBatch(texts, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch('https://api.mistral.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'mistral-embed', input: texts }),
    });

    if (response.ok) {
      const data = await response.json();
      return data.data.map(d => d.embedding);
    }

    if (response.status === 429 && attempt < retries) {
      const waitMs = Math.min(2000 * 2 ** attempt, 60_000);
      console.log(`  Rate limit hit, attente ${waitMs / 1000}s (tentative ${attempt + 1}/${retries})...`);
      await sleep(waitMs);
      continue;
    }

    const err = await response.text();
    throw new Error(`Mistral embeddings error ${response.status}: ${err}`);
  }
}

// Phase 3 — Embed tous les chunks par groupes, upsert dans Pinecone par lots
async function embedAndIndex(chunks, indexName) {
  const index = pinecone.index(indexName);
  const vectors = [];

  for (let i = 0; i < chunks.length; i += CONFIG.embedConcurrency) {
    const batch = chunks.slice(i, i + CONFIG.embedConcurrency);
    const embeddings = await embedBatch(batch.map(c => c.text));
    batch.forEach((chunk, j) => {
      vectors.push({
        id: `${chunk.filename}-chunk-${chunk.chunkIndex}`,
        values: embeddings[j],
        metadata: {
          text: chunk.text,
          source: chunk.filename,
          chunkIndex: chunk.chunkIndex,
        },
      });
    });
    // Pause entre chaque batch d'embedding pour respecter le rate limit Mistral (free tier ~1 req/s)
    if (i + CONFIG.embedConcurrency < chunks.length) await sleep(1500);
  }

  let upserted = 0;
  for (let i = 0; i < vectors.length; i += CONFIG.batchSize) {
    const batch = vectors.slice(i, i + CONFIG.batchSize);
    await index.upsert(batch);
    upserted += batch.length;
    console.log(`  Upsert ${upserted}/${vectors.length} vecteurs...`);
  }

  return vectors.length;
}

async function main() {
  const INDEX_NAME = process.env.PINECONE_INDEX_NAME;
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
  console.log(`\nIndexation dans l'index "${INDEX_NAME}"...`);

  let total = 0;
  try {
    total = await embedAndIndex(allChunks, INDEX_NAME);
  } catch (err) {
    console.error('Erreur indexation:', err.message);
    process.exit(1);
  }

  console.log(`\nIndexation terminée : ${total} vecteurs dans l'index "${INDEX_NAME}"`);
}

main().catch(console.error);
