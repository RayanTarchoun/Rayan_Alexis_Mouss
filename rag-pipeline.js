// Phase 4 : Retrieval vectoriel (top-5, filtre score >= 0.5)
// Embedde la question avec mistral-embed, query Pinecone, filtre les chunks.
import { Pinecone } from '@pinecone-database/pinecone';
import 'dotenv/config';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

// --- Embedding ---

function fetchWithTimeout(url, options, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function embedText(text) {
  const response = await fetchWithTimeout('https://api.mistral.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'mistral-embed', input: [text] }),
  });
  if (!response.ok) throw new Error(`Embedding error ${response.status}`);
  const data = await response.json();
  return data.data[0].embedding;
}

// --- Phase 4 : retrieveContext ---

export async function retrieveContext(query, topK = 5) {
  if (!query || !query.trim()) return [];

  const queryVector = await embedText(query);
  const index = pinecone.index(process.env.PINECONE_INDEX_NAME);

  const results = await index.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
  });

  return results.matches
    .filter(m => m.score >= 0.5)
    .map(m => ({
      text: m.metadata?.text ?? '',
      source: m.metadata?.source ?? 'Source inconnue',
      score: m.score,
      chunkIndex: m.metadata?.chunkIndex ?? 0,
    }));
}

// Test rapide en CLI : node rag-pipeline.js "ma question"
if (process.argv[1] && process.argv[1].endsWith('rag-pipeline.js')) {
  const question = process.argv[2] || 'Comment définir un outil dans Pydantic AI ?';
  retrieveContext(question).then(chunks => {
    console.log(`\n${chunks.length} chunks retournés pour : "${question}"\n`);
    chunks.forEach((c, i) =>
      console.log(`[${i + 1}] score=${c.score.toFixed(3)} source=${c.source}\n    ${c.text.slice(0, 120)}...\n`)
    );
  });
}
