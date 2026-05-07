// Phases 4-7 + 11 (J4) : Retrieval + Generation + Citations + paramètres configurables
// Phase 12 (J5)         : embedText et generateCompletion passent par withRetry + circuit breaker
import { Pinecone } from '@pinecone-database/pinecone';
import { withRetry, mistralBreaker } from './lib/resilience.js';
import 'dotenv/config';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

// $0.2/1M tokens in, $0.6/1M tokens out — mistral-small-latest
const COST_IN  = 0.2  / 1_000_000;
const COST_OUT = 0.6  / 1_000_000;

// --- Helper réseau ---

function fetchWithTimeout(url, options, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// --- Embedding (Phase 12 : wrappé withRetry + breaker) ---

async function embedText(text) {
  return mistralBreaker.call(() => withRetry(async () => {
    const response = await fetchWithTimeout('https://api.mistral.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'mistral-embed', input: [text] }),
    });
    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Mistral embeddings error ${response.status}: ${err}`);
    }
    const data = await response.json();
    return data.data[0].embedding;
  }));
}

// --- Phase 4 : retrieveContext ---

export async function retrieveContext(query, topK = 5, threshold = 0.5) {
  if (!query || !query.trim()) return [];

  const queryVector = await embedText(query);
  const index = pinecone.index(process.env.PINECONE_INDEX_NAME);

  const results = await index.query({
    vector: queryVector,
    topK,
    includeMetadata: true,
  });

  return results.matches
    .filter(m => m.score >= threshold)
    .map(m => ({
      text: m.metadata?.text ?? '',
      source: m.metadata?.source ?? 'Source inconnue',
      score: m.score,
      chunkIndex: m.metadata?.chunkIndex ?? 0,
    }));
}

// --- Phase 5 (J4) + Phase 12 (J5) : generateCompletion robustifiée ---

async function generateCompletion(question, context, { temperature = 0.1 } = {}) {
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

  // Phase 12 : circuit breaker + retry exponentiel
  return mistralBreaker.call(() => withRetry(async () => {
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
        temperature,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Mistral completion error ${response.status}: ${err}`);
    }

    const data = await response.json();
    return {
      content: data.choices[0].message.content,
      usage: data.usage ?? { prompt_tokens: 0, completion_tokens: 0 },
    };
  }));
}

// --- Phase 7 : formatage des sources ---

function formatSources(chunks) {
  const best = new Map();
  chunks.forEach((chunk, i) => {
    const file = chunk.source || 'Source inconnue';
    if (!best.has(file) || best.get(file).relevance < chunk.score) {
      best.set(file, { index: i + 1, file, relevance: chunk.score });
    }
  });
  return Array.from(best.values());
}

function detectOrphanCitations(answer, numSources) {
  const orphans = [];
  const re = /\[Source (\d+)\]/g;
  let m;
  while ((m = re.exec(answer)) !== null) {
    const n = parseInt(m[1]);
    if (n > numSources) orphans.push(n);
  }
  return orphans;
}

// --- Phase 6 + 7 + 11 : ragQuery ---

export async function ragQuery(question, options = {}) {
  const { topK = 5, threshold = 0.5, temperature = 0.1, verbose = false } = options;

  if (verbose) console.log(`[ragQuery] question="${question.slice(0, 70)}"`);

  const t0 = Date.now();
  const chunks = await retrieveContext(question, topK, threshold);
  const retrievalMs = Date.now() - t0;

  const topScore = chunks[0]?.score ?? 0;
  const avgScore = chunks.length
    ? chunks.reduce((s, c) => s + c.score, 0) / chunks.length
    : 0;

  if (verbose) {
    console.log(
      `[retrieve] topK=${chunks.length} retournés en ${retrievalMs}ms, ` +
      `top score ${topScore.toFixed(2)}, avg score ${avgScore.toFixed(2)}`
    );
  }

  if (chunks.length === 0) {
    return {
      answer: 'Je ne trouve pas cette information dans les documents fournis.',
      sources: [],
      chunks: [],
      chunksUsed: 0,
      metrics: {
        topScore: 0, avgScore: 0,
        retrievalMs, generationMs: 0,
        promptTokens: 0, completionTokens: 0,
        costUSD: 0, orphanCitations: [],
      },
    };
  }

  const t1 = Date.now();
  const { content: answer, usage } = await generateCompletion(question, chunks, { temperature });
  const generationMs = Date.now() - t1;

  const promptTokens     = usage.prompt_tokens     ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;
  const costUSD = promptTokens * COST_IN + completionTokens * COST_OUT;

  if (verbose) {
    console.log(
      `[generate] ${promptTokens} tok in / ${completionTokens} tok out, ` +
      `${generationMs}ms, $${costUSD.toFixed(6)}`
    );
  }

  const sources         = formatSources(chunks);
  const orphanCitations = detectOrphanCitations(answer, chunks.length);

  return {
    answer,
    sources,
    chunks,
    chunksUsed: chunks.length,
    metrics: {
      topScore,
      avgScore,
      retrievalMs,
      generationMs,
      promptTokens,
      completionTokens,
      costUSD: parseFloat(costUSD.toFixed(6)),
      orphanCitations,
    },
  };
}
