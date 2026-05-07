# Mini-Perplexity — Pipeline RAG sur la documentation Pydantic AI

Projet réalisé par **Alexis Rodrigues, Moussa Diop, Rayan Tarchoun** — IPSSI, Semaines 8-9.

Pipeline RAG (Retrieval-Augmented Generation) **production-ready** : retrieval vectoriel,
génération LLM, citations structurées, observabilité, audit du retrieval, retry/circuit
breaker, cost tracking session, score de confiance, court-circuit "je ne sais pas",
disclaimer de transparence, et tests adversariaux.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MINI-PERPLEXITY — ARCHITECTURE                       │
└─────────────────────────────────────────────────────────────────────────┘

PIPELINE D'INDEXATION (une fois, ou à chaque mise à jour du corpus)
─────────────────────────────────────────────────────────────────────

  Documents     Chunking      Embedding      Pinecone
  ┌─────────┐   ┌─────────┐   ┌──────────┐   ┌──────────┐
  │  .md    │──▶│ chunk 1 │──▶│ [0.12,   │──▶│ vector   │
  │  .txt   │   │ chunk 2 │   │  0.87,   │   │ store    │
  └─────────┘   │ chunk N │   │  ...]    │   │ + meta   │
                └─────────┘   └──────────┘   └──────────┘
                  400/50      mistral-embed   1024 dims

PIPELINE DE REQUÊTE (pour chaque question utilisateur)
─────────────────────────────────────────────────────────────────────

  Question      Embed         Retrieval      computeConfidence
  ┌─────────┐   ┌─────────┐   ┌──────────┐   ┌──────────────────┐
  │ "Qu'est-│──▶│ [0.23,  │──▶│  top-5   │──▶│ topScore ≥ 0.75 ?│
  │  ce X?" │   │  0.61]  │   │  cosinus │   └────┬─────────────┘
  └─────────┘   └─────────┘   └──────────┘   oui  │  non
                                                  │  │
                              ┌───────────────────┘  └────────────┐
                              ▼                                   ▼
                  ┌──────────────────────┐         ┌──────────────────────┐
                  │ generateCompletion() │         │ "Je ne dispose pas   │
                  │  + system prompt     │         │  d'informations      │
                  │  + context chunks    │         │  suffisantes..."     │
                  │  + temperature 0.1   │         │                      │
                  │  + max_tokens 500    │         │  (pas d'appel LLM,   │
                  └──────────┬───────────┘         │   coût $0)           │
                             │                     └──────────────────────┘
                             ▼
                  ┌──────────────────────┐
                  │  formatResponse()    │
                  │  • réponse           │
                  │  • sources [N]       │
                  │  • note pertinence   │
                  │  • disclaimer IA     │
                  └──────────────────────┘

GARDE-FOUS TRANSVERSAUX
─────────────────────────────────────────────────────────────────────

  Timeout (30s) ─▶ withRetry (backoff 2^n + jitter) ─▶ CircuitBreaker (5 pannes / 30s)
  max_tokens 500 ─▶ trackCost (session counter)    ─▶ logCostStats
  CONFIDENCE_THRESHOLD ─▶ court-circuit "je ne sais pas"
```

---

## Stack technique

| Composant | Technologie |
|---|---|
| Embedding | Mistral `mistral-embed` (1024 dimensions) |
| Vector store | Pinecone (cosine similarity) |
| LLM | Mistral `mistral-small-latest` |
| Abstraction LangChain | `@langchain/mistralai`, `@langchain/pinecone` |
| Runtime | Node.js 18+, ES Modules |

---

## Structure du projet

```
.
├── corpus/                       # 175 fichiers Markdown (non versionné, voir .gitignore)
├── lib/                          # J5 : modules transverses
│   ├── resilience.js             # Phase 12 : withRetry + CircuitBreaker
│   ├── cost-tracker.js           # Phase 13 : calculateCost + session counter
│   └── format-response.js        # Phase 16 : disclaimer + note pertinence
├── scripts/
│   ├── create-index.js           # Phases 2-3 : chunking + embedding + indexation Pinecone
│   ├── eval.js                   # Phase 8 : évaluation baseline sur 10 questions
│   ├── audit-retrieval.js        # Phase 11 : harness 10 variantes du pipeline
│   ├── build-eval-table.js       # Phase 11 : agrégation JSON → eval-table.md étendu
│   └── test-adversarial.js       # Phase 17 : red teaming automatisé
├── rag-pipeline.js               # Pipeline principal (Phases 4-7, 11, 12-15)
├── rag-pipeline-langchain.js     # Phase 9 : pipeline via LangChain.js
├── cli.js                        # Phase 10 : CLI interactive (utilise formatResponse)
├── eval-table.md                 # Résultats baseline + section audit
├── questions-test.txt            # 10 questions de référence
├── PHASE11.md                    # Guide audit du retrieval
├── red-teaming.md                # Phase 17 : attaques adversariales + correctifs
├── .env.example                  # Variables d'environnement
└── package.json
```

---

## Installation

### 1. Cloner et installer

```bash
git clone https://github.com/RayanTarchoun/Rayan_Alexis_Mouss.git
cd Rayan_Alexis_Mouss
npm install
```

### 2. Configurer l'environnement

```bash
cp .env.example .env
```

```env
MISTRAL_API_KEY=votre_cle_mistral
PINECONE_API_KEY=votre_cle_pinecone
PINECONE_INDEX_NAME=mini-perplexity-pydantic-ai
PINECONE_ENVIRONMENT=us-east-1
CONFIDENCE_THRESHOLD=0.75
```

### 3. Préparer le corpus + indexer (voir Phase 1 de l'historique git pour le script PowerShell)

```bash
npm run index
```

---

## Utilisation

### CLI interactive

```bash
npm start
```

```
> Comment définir un outil dans Pydantic AI ?
Recherche en cours...

Pour définir un outil dans Pydantic AI, vous utilisez le décorateur @agent.tool [Source 1].

**Sources :**
[1] tools.md

---
*Réponse générée par IA à partir des documents fournis. Vérifiez les sources avant toute décision importante.*
```

Question hors corpus → court-circuit AVANT le LLM (coût $0) :

```
> Quel est le PIB de la France en 2023 ?
Recherche en cours...

Je ne dispose pas d'informations suffisantes dans les documents fournis pour répondre à cette question.

---
*Réponse générée par IA à partir des documents fournis. Vérifiez les sources avant toute décision importante.*
```

### Évaluation baseline

```bash
npm run eval
```

### Audit Phase 11 (variantes du retrieval)

```bash
npm run audit baseline
npm run audit topK_10
npm run audit threshold_0_7
npm run audit:table
```

### Tests adversariaux Phase 17 (red teaming)

```bash
npm run test:adversarial
```

Exécute les 5 prompts adversariaux et affiche un verdict (tient / passe) pour chacun.

---

## Phases du projet

### J4 — Construction du pipeline

| Phase | Description |
|---|---|
| 1 | Préparation du corpus (175 fichiers Markdown, ~1.36 MB) |
| 2 | Chunking avec overlap (400 mots / 50 de recouvrement) |
| 3 | Embedding batch + indexation Pinecone |
| 4 | Retrieval vectoriel (top-5, filtre score ≥ 0.5) |
| 5 | Génération LLM avec prompt RAG strict |
| 6 | Pipeline complet + observabilité (latence, tokens, coût) |
| 7 | Citations structurées + détection de citations orphelines |
| 8 | Évaluation baseline sur 10 questions |
| 9 | Refactoring LangChain.js |
| 10 | Interface CLI interactive |
| 11 | Audit du retrieval (`topK`, `threshold`, `temperature`, `chunk_size`) |

### J5 — Production-ready

| Phase | Description |
|---|---|
| 12 | Error handling : `withRetry` (backoff exponentiel + jitter) + `CircuitBreaker` (5 pannes / 30s) |
| 13 | Cost tracker centralisé : `calculateCost()` + compteur session, format `[Stats] ... Session total: $X` |
| 14 | Score de confiance : `computeConfidence(matches)` + `CONFIDENCE_THRESHOLD` (.env, défaut 0.75) |
| 15 | Court-circuit "Je ne sais pas" AVANT l'appel LLM si `!confidence.sufficient` (coût $0 garanti hors corpus) |
| 16 | `formatResponse()` : footer disclaimer + note pertinence si `confidence < 0.80` |
| 17 | Red teaming team-vs-team : 5 attaques testées, 2 correctifs documentés (`red-teaming.md`) |
| 18 | Polish final : README v2, ASCII architecture, version `2.0.0` |

---

## Variables d'environnement

| Variable | Défaut | Description |
|---|---|---|
| `MISTRAL_API_KEY` | — | Clé API Mistral (obligatoire) |
| `PINECONE_API_KEY` | — | Clé API Pinecone (obligatoire) |
| `PINECONE_INDEX_NAME` | — | Nom de l'index Pinecone (obligatoire) |
| `PINECONE_ENVIRONMENT` | `us-east-1` | Région Pinecone |
| `CONFIDENCE_THRESHOLD` | `0.75` | Seuil de top-1 score sous lequel le pipeline répond "je ne sais pas" sans appeler le LLM |

---

## Démo en 30 secondes

```bash
# 1. Une requête happy path
echo "Comment définir un outil dans Pydantic AI ?" | node cli.js
# → réponse normale + sources + disclaimer

# 2. Une requête hors corpus
echo "Quel est le PIB de la France en 2023 ?" | node cli.js
# → court-circuit JNSP, coût $0

# 3. Le red teaming
npm run test:adversarial
# → 5 attaques, verdict tient/passe pour chacune
```
