// Phase 9 : Refactoring LangChain — même pipeline, moins de code
import { MistralAIEmbeddings, ChatMistralAI } from '@langchain/mistralai';
import { PineconeStore } from '@langchain/pinecone';
import { createRetrievalChain } from 'langchain/chains/retrieval';
import { createStuffDocumentsChain } from 'langchain/chains/combine_documents';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { Pinecone } from '@pinecone-database/pinecone';
import 'dotenv/config';

const pineconeClient = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

// Construit la chain une seule fois et la met en cache
let _chain = null;

async function buildChain() {
  const embeddings = new MistralAIEmbeddings({ model: 'mistral-embed' });
  const pineconeIndex = pineconeClient.index(process.env.PINECONE_INDEX_NAME);

  const vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
    pineconeIndex,
  });

  const retriever = vectorStore.asRetriever({ k: 5 });

  const llm = new ChatMistralAI({
    model: 'mistral-small-latest',
    temperature: 0.1,
  });

  const prompt = ChatPromptTemplate.fromTemplate(`Tu es un assistant expert qui répond uniquement à partir des sources fournies.

Règles :
- Réponds uniquement à partir du contexte ci-dessous. N'utilise pas ta mémoire interne.
- Si la réponse n'est pas dans le contexte, dis "Je ne trouve pas cette information dans les documents fournis."
- Cite tes sources entre crochets : [Source 1], [Source 2], etc.
- Sois précis et concis.

Contexte : {context}

Question : {input}`);

  const combineDocsChain = await createStuffDocumentsChain({ llm, prompt });
  return createRetrievalChain({ combineDocsChain, retriever });
}

async function getChain() {
  if (!_chain) _chain = await buildChain();
  return _chain;
}

export async function ragQueryLangChain(question) {
  if (!question || !question.trim()) {
    return {
      answer: 'Je ne trouve pas cette information dans les documents fournis.',
      sources: [],
      chunks: [],
      chunksUsed: 0,
      metrics: {},
    };
  }

  const chain = await getChain();

  const t0 = Date.now();
  const result = await chain.invoke({ input: question });
  const totalMs = Date.now() - t0;

  const docs = result.context ?? [];

  // Déduplique les sources par fichier
  const seen = new Map();
  docs.forEach(doc => {
    const file = doc.metadata?.source ?? 'inconnue';
    if (!seen.has(file)) seen.set(file, { file, relevance: doc.metadata?.score ?? 0 });
  });

  return {
    answer: result.answer,
    sources: Array.from(seen.values()),
    chunks: docs.map(d => ({ text: d.pageContent, source: d.metadata?.source ?? 'inconnue' })),
    chunksUsed: docs.length,
    metrics: { totalMs },
  };
}
