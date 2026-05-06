// Phases 4-5 : Retrieval + Génération LLM avec prompt RAG strict
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

// --- Phase 5 : generateCompletion ---

async function generateCompletion(question, context) {
  const contextText = context
    .map((c, i) => `[Source ${i + 1} - ${c.source}]\n${c.text}`)
    .join('\n\n---\n\n');

  const systemPrompt = `Tu es un assistant expert qui répond uniquement à partir des sources fournies.

Règles :
- Réponds uniquement à partir du contexte ci-dessous. N'utilise pas ta mémoire interne.
- Si la réponse n'est pas dans le contexte, dis explicitement "Je ne trouve pas cette information dans les documents fournis."
- Cite toujours tes sources entre crochets : [Source 1], [Source 2], etc.
- Sois précis et concis.`;

  const userMessage = `Contexte :
${contextText}

Question : ${question}`;

  const response = await fetchWithTimeout('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  },
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Mistral completion error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// --- Phase 5 : pipeline complète (sans observabilité encore) ---

export async function ragQuery(question, options = {}) {
  const { topK = 5 } = options;

  const chunks = await retrieveContext(question, topK);

  if (chunks.length === 0) {
    return {
      answer: 'Je ne trouve pas cette information dans les documents fournis.',
      chunks: [],
    };
  }

  const answer = await generateCompletion(question, chunks);
  return { answer, chunks };
}
