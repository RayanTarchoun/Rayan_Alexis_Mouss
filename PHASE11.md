# Phase 11 — Audit du retrieval

Phase de diagnostic du pipeline RAG : on fait varier `topK`, `threshold`, `chunk_size`
et `temperature` sur les 10 questions de référence, on mesure ce qui change, on identifie
les régressions, on en tire des conclusions pour la config de démo.

Comptez ~30-45 min d'exécution machine + 30 min de notation humaine.

---

## Ce que le commit Phase 11 ajoute

```
.
├── PHASE11.md                       # ce guide
├── audit-results/                   # généré par les scripts (JSON par variante)
├── scripts/
│   ├── audit-retrieval.js           # harness : 10 questions × 1 variante → JSON
│   └── build-eval-table.js          # agrégateur : N JSON → eval-table.md (étendu)
└── rag-pipeline.js                  # patché : threshold + temperature paramétrables
```

Le patch sur `rag-pipeline.js` est **non-breaking** : les défauts (`threshold=0.5`,
`temperature=0.1`) sont identiques au comportement original. `cli.js`, `eval.js`,
`rag-pipeline-langchain.js` continuent de marcher sans modification.

---

## Procédure d'exécution

### Étape 1 — Variantes "online" (~5 min, ~$0.05 cumulé)

Tournent sur l'index baseline existant (chunk=400, overlap=50). Aucune ré-indexation.

```bash
npm run audit baseline
npm run audit topK_1
npm run audit topK_10
npm run audit threshold_0_3
npm run audit threshold_0_7
npm run audit threshold_0_8
npm run audit temperature_0
npm run audit temperature_0_3
```

Chaque commande produit `audit-results/<variant>.json` avec les métriques détaillées
des 10 questions (top score, avg score, latence, tokens, coût, citations orphelines,
détection des "Je ne sais pas").

### Étape 2 — Variantes "offline" (chunk_size, ~25 min)

Nécessitent une **ré-indexation** du corpus avec un autre `chunkSize`. Procédure pour
chaque variante :

```bash
# 1. Modifier scripts/create-index.js, ligne 8 :
#    export const CONFIG = { chunkSize: 200, overlap: 50, ... };
# 2. Vider l'index Pinecone (UI Pinecone ou snippet ci-dessous)
# 3. Ré-indexer :
npm run index
# 4. Lancer l'audit :
npm run audit chunk_200

# Idem pour chunk=1000, overlap=200 → npm run audit chunk_1000
```

Snippet pour vider l'index sans passer par l'UI Pinecone :

```js
// scripts/clear-index.js (à créer si besoin)
import { Pinecone } from '@pinecone-database/pinecone';
import 'dotenv/config';
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
await pc.index(process.env.PINECONE_INDEX_NAME).deleteAll();
console.log('Index vidé');
```

**À la fin, remettez l'index baseline** (chunk=400, overlap=50) en place pour que
la pipeline démo continue de fonctionner avec les bons paramètres.

### Étape 3 — Génération de la section audit

```bash
npm run audit:table
```

Lit tous les `audit-results/*.json` et **étend** `eval-table.md` avec une section
auto-générée entre les marqueurs `<!-- AUDIT_PHASE_11_START -->` et `<!-- AUDIT_PHASE_11_END -->`.

**La baseline avec vos notes humaines (Pertinence/Fidélité 1-5) est préservée**,
elle se trouve avant le marqueur de début.

### Étape 4 — Rédaction des régressions

Lisez la section "Régressions hypothétiques" ci-dessous, vérifiez avec vos vrais
chiffres laquelle se confirme, et recopiez l'explication adaptée dans la section
"Régressions identifiées" en bas de `eval-table.md`.

### Étape 5 — Commit

```bash
git add PHASE11.md \
        scripts/audit-retrieval.js scripts/build-eval-table.js \
        rag-pipeline.js package.json README.md \
        eval-table.md audit-results/
git commit -m "feat(phase-11): audit retrieval — 10 variantes + régressions documentées"
git push origin PROJET
```

---

## Régressions hypothétiques (à valider avec vos chiffres)

Ces régressions sont **les plus probables** étant donné la structure de votre corpus
Pydantic AI et **vos top-1 scores baseline mesurés** (Q1 à Q10 : 0.80 / 0.78 / 0.82 /
0.85 / 0.80 / 0.83 / 0.83 / 0.80 / 0.75 / 0.73). Si vos résultats les confirment,
recopiez l'explication dans `eval-table.md`. Sinon, prenez-en une autre dans vos
résultats — ne forcez pas une hypothèse fausse.

### Hypothèse A — `topK_1` régresse sur Q7 (gestion erreurs, ambiguë)

**Q7** : *"Comment gérer les erreurs dans Pydantic AI ?"* — catégorie ambiguë.

**En baseline (topK=5, top-1 = 0.83, avg-3 = 0.81)** :
le retrieval ramène plusieurs chunks issus typiquement de `docs_retries.md`,
`docs_troubleshooting.md` et de sections "errors" dans `docs_agent.md`. Le LLM
synthétise les 3 mécanismes (retries automatiques côté outils, gestion des erreurs
de validation des sorties, exceptions Pydantic AI) avec citations multiples.
Pertinence 4/5 et Fidélité 4/5 confirmées par votre notation.

**En `topK_1`** :
un seul chunk arrive — celui ayant le meilleur score, probablement issu de
`docs_retries.md`. La réponse présente les retries comme **la** façon de gérer
les erreurs, en occultant la validation des sorties et la gestion des exceptions.
**Top-1 score reste élevé** (~0.83, identique à la baseline pour ce chunk),
ce qui masque le problème : le retrieval semble "bon" mais la réponse est
factuellement incomplète. Fidélité attendue : 2-3/5.

**Leçon** : `topK=1` est dangereux sur les questions ambiguës ou multi-sources.
Le score de similarité ne mesure pas la **complétude** de la réponse, seulement
la proximité sémantique du chunk top-1. Sur des questions exigeant synthèse,
`topK ≥ 3` est nécessaire.

### Hypothèse B — `threshold_0_8` régresse sur Q2 (différence Agent / RunContext)

**Q2** : *"Quelle est la différence entre Agent et RunContext ?"* — happy path.

**En baseline (threshold=0.5, top-1 = 0.78, avg-3 = 0.77)** :
le top-1 (0.78) passe largement le seuil, les chunks pertinents de `docs_agent.md`
et `docs_dependencies.md` sont injectés, la réponse cite proprement les deux concepts
distincts. Vos notes : 4/5 pertinence, 4/5 fidélité.

**En `threshold_0_8`** :
le top-1 mesuré à 0.78 **est rejeté** (0.78 < 0.8). Le filtre élimine le chunk
le plus pertinent de la question, et probablement aussi les autres chunks du
top-3 (avg-3 = 0.77, donc presque tous sous 0.8). La pipeline répond *"Je ne
trouve pas cette information dans les documents fournis"* alors que la réponse
existe et était correctement servie en baseline. **Faux négatif** : le pipeline
pense protéger contre l'hallucination, il refuse en fait une question légitime.

**Métrique-témoin** : le compteur "JNSP" de la variante `threshold_0_8` doit être
**supérieur à 2** (les 2 adversariales attendues). Avec vos top-1 actuels, on
attend même Q2, Q5, Q1, Q8 (top-1 = 0.78-0.80) sur le fil, et Q9-Q10 (adversariales,
0.73-0.75) qui basculent aussi en JNSP — mais ces deux dernières c'est désirable.
Si le compteur monte à 4-5 JNSP, vous avez la régression.

**Leçon** : un threshold trop strict dégrade le **rappel** sans améliorer la
**précision**. Les questions hors-corpus scorent généralement <0.4, bien sous
n'importe quel seuil raisonnable — le filtre haut ne les bloque pas mieux que
0.5, mais il commence à mordre sur des questions valides à formulation atypique.

### Hypothèse C (bonus) — `chunk_200` régresse sur Q4 (déclaration de dépendances)

**Q4** : *"Comment déclarer des dépendances dans un agent Pydantic AI ?"* — happy.

**En baseline (chunk=400)** : un chunk de `docs_dependencies.md` contient
typiquement la signature `Agent[Deps]` **et** un exemple de code complet
(`@dataclass`, instanciation, injection via `RunContext`). Top-1 baseline = 0.85,
réponse précise et utilisable. Notes : 5/5 pertinence, 5/5 fidélité.

**En `chunk_200`** : le découpage à 200 mots tend à **séparer la signature de
l'exemple**. Le retrieval ramène soit la définition (sans code), soit le code
(sans contexte). Le top-1 score reste très haut (0.85+), parce que le chunk
récupéré matche parfaitement la question lexicalement, mais la réponse devient
incomplète : soit elle décrit `Agent[Deps]` sans montrer comment l'utiliser,
soit elle montre du code sans expliquer les paramètres.

**Leçon** : un score top-1 élevé ne garantit pas la qualité de la réponse
quand le chunking détruit la cohésion sémantique. C'est exactement le phénomène
décrit en section 2 du cours ("L'erreur classique : des chunks trop petits
perdent le contexte d'une idée"). Sur du code source/documentation technique,
`chunk_size ≥ 400` est recommandé pour préserver la coïncidence signature ↔ exemple.

---

## Bonus : pour aller plus loin sur l'audit

Les variantes par défaut couvrent les 3 axes du sujet (topK, threshold, chunk_size)
plus la temperature. Si vous avez du temps après les régressions :

- **Top-1 vs top-3 sur les questions ambiguës** : vos métriques montrent que
  `avgScore` ≈ `topScore` sur Q7-Q8 (écart < 0.02), ce qui signifie que les chunks
  2 et 3 du top-K sont presque aussi pertinents que le top-1 — argument en faveur
  de garder `topK=5` même pour des questions qui *semblent* avoir une réponse simple.

- **Re-ranking maison** : prenez les top-10 chunks d'une variante `topK_10`,
  passez-les dans un mini-prompt LLM "lequel répond le mieux à *<question>* ?",
  comparez l'ordre proposé à l'ordre cosinus original. C'est un cross-encoder
  artisanal — le concept exact dont parle la section "Re-ranking" du cours.

- **Distribution des scores** : tracez l'histogramme des `topScore` sur les 10
  questions × 9 variantes (90 valeurs) avec un script Python rapide. Vous verrez
  où placer un seuil idéal pour votre corpus, plutôt que de deviner 0.5/0.7/0.8.

---

## Ordre de grandeur des coûts

Avec votre baseline mesurée à $0.0010 / question (mistral-small-latest avec contexte
long ~3-5K tokens) :

| Phase | Calls LLM | Coût estimé |
|-------|-----------|-------------|
| 7 variantes online × 10 questions | 70 | ~$0.07 |
| 2 variantes chunk × 10 questions  | 20 | ~$0.02 |
| Ré-indexation chunk_200 (~1300 chunks) | embedding | ~$0.005 |
| Ré-indexation chunk_1000 (~270 chunks) | embedding | ~$0.001 |
| **Total Phase 11** | — | **~$0.10** |

Soit ~10 centimes pour l'audit complet. Largement abordable sur le tier gratuit Mistral.
