// Phases 4-7 + 11 (J4) : Retrieval + Generation + Citations + paramètres configurables
// Phase 12 (J5) : embedText et generateCompletion passent par withRetry + circuit breaker
// Phase 13 (J5) : cost tracking centralisé via lib/cost-tracker.js
// Phase 14 (J5) : computeConfidence(matches) + CONFIDENCE_THRESHOLD env (défaut 0.75)
// Phase 15 (J5) : court-circuit "Je ne sais pas" AVANT l'appel LLM si !confidence.sufficient
import { Pinecone } from '@pinecone-database/pinecone';
import { withRetry, mistralBreaker } from './lib/resilience.js';
import { trackCost, logCostStats } from './lib/cost-tracker.js';
import 'dotenv/config';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const MODEL = 'mistral-small-latest';

// Phase 15 : message standardisé exact (cf. spec J5 phase 4)
const NO_ANSWER_MESSAGE =
  "Je ne dispose pas d'informations suffisantes dans les documents fournis pour répondre à cette question.";

// --- Helper réseau ---

function fetchWithTimeout(url, options, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

// --- Embedding ---

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

// --- Phase 14 : computeConfidence ---

export function computeConfidence(matches) {
  if (!matches || matches.length === 0) {
    return { topScore: 0, avgScore: 0, sufficient: false };
  }
  const scores = matches.map(m => m.score ?? 0).filter(Number.isFinite);
  const topScore = scores[0] ?? 0;
  const avgScore = scores.length
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;

  const threshold = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.75');
  return { topScore, avgScore, sufficient: topScore >= threshold };
}

// --- generateCompletion ---

async function generateCompletion(question, context, { temperature = 0.1 } = {}) {
  const contextText = context
    .map((c, i) => `[Source ${i + 1} - ${c.source}]\n${c.text}`)
    .join('\n\n---\n\n');

  const systemPrompt = `Tu es un assistant documentaire. Règles absolues :
1. Réponds UNIQUEMENT à partir du contexte fourni.
2. Si le contexte ne contient pas suffisamment d'informations pour répondre, réponds exactement :
"${NO_ANSWER_MESSAGE}"
3. Ne complète JAMAIS avec tes connaissances générales.
4. Cite tes sources entre crochets : [Source 1], [Source 2], etc.`;

  const userMessage = `Contexte :
${contextText}

Question : ${question}`;

  return mistralBreaker.call(() => withRetry(async () => {
    const response = await fetchWithTimeout('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: userMessage  },
        ],
        temperature,
        max_tokens: 800,
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

// --- Helper : réponse "je ne sais pas" sans appel LLM ---

function noAnswerResponse(confidence, retrievalMs) {
  return {
    answer: NO_ANSWER_MESSAGE,
    sources: [],
    chunks: [],
    chunksUsed: 0,
    confidence,
    metrics: {
      topScore: confidence.topScore,
      avgScore: confidence.avgScore,
      retrievalMs,
      generationMs: 0,
      promptTokens: 0,
      completionTokens: 0,
      costUSD: 0,
      orphanCitations: [],
    },
  };
}

// --- ragQuery ---

export async function ragQuery(question, options = {}) {
  const { topK = 10, threshold = 0.5, temperature = 0.1, verbose = false } = options;

  if (verbose) console.log(`[ragQuery] question="${question.slice(0, 70)}"`);

  const t0 = Date.now();
  const chunks = await retrieveContext(question, topK, threshold);
  const retrievalMs = Date.now() - t0;

  const confidence = computeConfidence(chunks);

  if (verbose) {
    console.log(
      `[retrieve] ${chunks.length} chunks en ${retrievalMs}ms · ` +
      `top=${confidence.topScore.toFixed(2)} · avg=${confidence.avgScore.toFixed(2)} · ` +
      `sufficient=${confidence.sufficient}`
    );
  }

  // Phase 15 : court-circuit AVANT le LLM si la confiance n'est pas suffisante.
  // Aucun appel API → coût $0, économie de tokens garantie.
  if (!confidence.sufficient) {
    if (verbose) console.log('[ragQuery] confidence insuffisante → "je ne sais pas" (pas d\'appel LLM)');
    return noAnswerResponse(confidence, retrievalMs);
  }

  // GENERATE
  const t1 = Date.now();
  const { content: answer, usage } = await generateCompletion(question, chunks, { temperature });
  const generationMs = Date.now() - t1;

  const promptTokens     = usage.prompt_tokens     ?? 0;
  const completionTokens = usage.completion_tokens ?? 0;

  const cost = trackCost(promptTokens, completionTokens, MODEL);
  if (verbose) logCostStats(cost);

  const sources         = formatSources(chunks);
  const orphanCitations = detectOrphanCitations(answer, chunks.length);

  return {
    answer,
    sources,
    chunks,
    chunksUsed: chunks.length,
    confidence,
    metrics: {
      topScore: confidence.topScore,
      avgScore: confidence.avgScore,
      retrievalMs,
      generationMs,
      promptTokens,
      completionTokens,
      costUSD: cost.costUSD,
      orphanCitations,
    },
  };
}
