# Mini-Perplexity — Pipeline RAG sur la documentation Pydantic AI

Projet réalisé par **Alexis Rodrigues, Moussa Diop, Rayan Tarchoun** — IPSSI, Semaine 8.

Pipeline RAG (Retrieval-Augmented Generation) complet : de la préparation du corpus à l'interface CLI interactive, en passant par l'indexation vectorielle, la génération LLM, l'évaluation baseline et l'audit du retrieval.

---

## Architecture

```
Question utilisateur
       │
       ▼
  embedText()          ← Mistral mistral-embed (1024 dimensions)
       │
       ▼
  Pinecone query       ← Recherche cosinus, top-5, filtre score ≥ 0.5
       │
       ▼
  generateCompletion() ← Mistral mistral-small-latest, temperature 0.1
       │
       ▼
  Réponse + Sources + Métriques
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
├── corpus/                       # 175 fichiers Markdown (docs Pydantic AI) — non versionné
├── scripts/
│   ├── create-index.js           # Phases 2-3 : chunking + embedding + indexation Pinecone
│   └── eval.js                   # Phase 8 : évaluation baseline sur 10 questions
├── rag-pipeline.js               # Phases 4-7 : retrieval, génération, citations, observabilité
│                                 # Phase 11 : paramètres topK, threshold, temperature configurables
├── rag-pipeline-langchain.js     # Phase 9 : même pipeline via LangChain.js
├── cli.js                        # Phase 10 : interface CLI interactive
├── eval-table.md                 # Résultats de l'évaluation baseline
├── questions-test.txt            # 10 questions de référence
├── .env.example                  # Template des variables d'environnement
└── package.json
```

---

## Installation

### 1. Cloner le repo et installer les dépendances

```bash
git clone https://github.com/RayanTarchoun/Alexis_Moussa_Rayan.git
cd Alexis_Moussa_Rayan
npm install
```

### 2. Configurer les variables d'environnement

```bash
cp .env.example .env
```

Remplir `.env` avec vos clés :

```env
MISTRAL_API_KEY=votre_cle_mistral
PINECONE_API_KEY=votre_cle_pinecone
PINECONE_INDEX_NAME=mini-perplexity-pydantic-ai
PINECONE_ENVIRONMENT=us-east-1
```

### 3. Préparer le corpus

Copier les fichiers Markdown de la documentation Pydantic AI dans `corpus/` :

```powershell
git clone --depth 1 https://github.com/pydantic/pydantic-ai.git $env:TEMP\pa-clone
New-Item -ItemType Directory -Force -Path corpus
Get-ChildItem "$env:TEMP\pa-clone\docs" -Recurse -Filter "*.md" | ForEach-Object {
    $flat = $_.FullName.Replace("$env:TEMP\pa-clone\docs\", "").Replace("\", "_")
    Copy-Item $_.FullName "corpus\$flat"
}
Remove-Item -Recurse -Force "$env:TEMP\pa-clone"
```

### 4. Créer l'index Pinecone

Dans la console Pinecone, créer un index avec :
- **Dimensions** : 1024
- **Metric** : cosine

### 5. Indexer le corpus

```bash
npm run index
```

Embed et indexe les 175 fichiers (~659 chunks) dans Pinecone. Durée estimée : ~1 minute.

---

## Utilisation

### CLI interactive

```bash
npm start
```

```
Mini-Perplexity — posez vos questions sur le corpus Pydantic AI
(Ctrl+C pour quitter)

> Comment définir un outil dans Pydantic AI ?
Recherche en cours...

Pour définir un outil dans Pydantic AI, vous utilisez le décorateur @agent.tool...

Sources : [tools.md]
Pertinence moyenne : 0.80
```

### Évaluation baseline

```bash
npm run eval
```

Lance les 10 questions de `questions-test.txt`, génère `eval-table.md` avec les métriques automatiques. Les colonnes Pertinence et Fidélité sont à remplir manuellement.

---

## Questions de référence

### Happy paths (réponse clairement dans le corpus)
1. Comment définir un outil dans Pydantic AI ?
2. Quelle est la différence entre Agent et RunContext ?
3. Comment streamer une réponse avec Pydantic AI ?
4. Comment déclarer des dépendances dans un agent Pydantic AI ?
5. Quels modèles LLM sont supportés par Pydantic AI ?
6. Comment gérer l'historique des messages dans Pydantic AI ?

### Ambiguës (plusieurs sections du corpus pourraient répondre)
7. Comment gérer les erreurs dans Pydantic AI ?
8. Comment tester un agent Pydantic AI ?

### Adversariales (hors corpus — doit déclencher "je ne sais pas")
9. Quel est le PIB de la France en 2023 ?
10. Qui a gagné la Coupe du Monde de football en 2022 ?

---

## Résultats de l'évaluation

| Métrique | Valeur |
|---|---|
| Coût total (10 questions) | $0.010128 |
| Latence moyenne | 4524 ms |
| Moyenne pertinence | 4.5/5 |
| Moyenne fidélité | 4.6/5 |

Les questions adversariales (hors corpus) déclenchent correctement une réponse de refus en 13 tokens, sans hallucination.

---

## Phase 11 — Audit du retrieval

La Phase 11 rend les paramètres clés du pipeline configurables pour permettre l'expérimentation et l'optimisation des résultats.

| Paramètre | Défaut | Description |
|---|---|---|
| `topK` | 5 | Nombre de chunks récupérés depuis Pinecone |
| `threshold` | 0.5 | Score minimum de similarité pour garder un chunk |
| `temperature` | 0.1 | Créativité du LLM (0 = déterministe, 1 = créatif) |

**Exemple d'utilisation :**

```js
import { ragQuery } from './rag-pipeline.js';

// Plus strict : seulement les chunks très pertinents
const result = await ragQuery(question, { topK: 3, threshold: 0.7, temperature: 0.1 });

// Plus large : récupère plus de contexte
const result = await ragQuery(question, { topK: 10, threshold: 0.4, temperature: 0.1 });
```

**Impact des paramètres :**
- Augmenter `threshold` → moins de chunks, réponses plus précises mais risque de "je ne trouve pas" sur des questions valides
- Diminuer `threshold` → plus de contexte, réponses plus complètes mais potentiellement moins ciblées
- Augmenter `topK` → plus de contexte fourni au LLM, coût en tokens plus élevé

---

## Phases du projet

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
| 11 | Audit du retrieval — paramètres `topK`, `threshold`, `temperature` configurables |
