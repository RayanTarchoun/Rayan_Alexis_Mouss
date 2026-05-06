# Mini-Perplexity — Pipeline RAG sur la documentation Pydantic AI

Projet réalisé par **Alexis Rodrigues, Moussa Diop, Rayan Tarchoun** — IPSSI, Semaine 8.

Pipeline RAG (Retrieval-Augmented Generation) sur la documentation Pydantic AI.

## Stack technique

| Composant | Technologie |
|---|---|
| Embedding | Mistral `mistral-embed` (1024 dimensions) |
| Vector store | Pinecone (cosine similarity) |
| LLM | Mistral `mistral-small-latest` |
| Runtime | Node.js 18+, ES Modules |
