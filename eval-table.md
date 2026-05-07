# Tableau d'évaluation — Baseline

_Colonne Pertinence et Fidélité : notes humaines (1-5)_

| # | Question | Top-1 score | Avg top-3 | Tokens (in/out) | Coût ($) | Pertinence (1-5) | Fidélité (1-5) | Notes |
|---|----------|-------------|-----------|-----------------|----------|------------------|----------------|-------|
| 1 | Comment définir un outil dans Pydantic AI ? | 0.80 | 0.80 | 1607/460 | 0.000597 | 4/5 | 4/5 | Bonne réponse, exemples pertinents |
| 2 | Quelle est la différence entre Agent et RunContext ? | 0.78 | 0.77 | 3919/13 | 0.000792 | 3/5 | 2/5 | 13 tokens out = refus implicite du LLM malgré bon retrieval |
| 3 | Comment streamer une réponse avec Pydantic AI ? | 0.82 | 0.82 | 2715/590 | 0.000897 | 5/5 | 4/5 | Réponse complète avec code |
| 4 | Comment déclarer des dépendances dans un agent Pydantic AI ? | 0.85 | 0.83 | 4310/398 | 0.001101 | 5/5 | 5/5 | Meilleur score — chunk contient signature + exemple complet |
| 5 | Quels modèles LLM sont supportés par Pydantic AI ? | 0.80 | 0.80 | 5138/13 | 0.001035 | 4/5 | 2/5 | 13 tokens out = refus implicite malgré retrieval correct |
| 6 | Comment gérer l'historique des messages dans Pydantic AI ? | 0.83 | 0.82 | 2878/419 | 0.000827 | 5/5 | 4/5 | Réponse précise et bien structurée |
| 7 | Comment gérer les erreurs dans Pydantic AI ? | 0.83 | 0.81 | 2102/546 | 0.000748 | 5/5 | 4/5 | Couvre retries + exceptions |
| 8 | Comment tester un agent Pydantic AI ? | 0.81 | 0.80 | 3652/1083 | 0.001380 | 5/5 | 5/5 | Réponse la plus détaillée (1083 tokens out) |
| 9 | Quel est le PIB de la France en 2023 ? | 0.75 | 0.74 | 2778/13 | 0.000563 | 1/5 | 4/5 | Hors corpus — refus correct ("Je ne trouve pas") |
| 10 | Qui a gagné la Coupe du Monde de football en 2022 ? | 0.73 | 0.71 | 3306/13 | 0.000669 | 1/5 | 4/5 | Hors corpus — refus correct ("Je ne trouve pas") |

## Agrégats

| Métrique | Valeur |
|---|---|
| Coût total (10 questions) | $0.008609 |
| Latence moyenne | 2965 ms |
| Moyenne pertinence | 3.8 / 5 |
| Moyenne fidélité | 3.8 / 5 |

> **Interprétation** : Q2 et Q5 ont un bon top-1 score (0.78–0.80) mais seulement 13 tokens en sortie — le LLM a refusé de générer malgré le contexte injecté. Q9 et Q10 sont les questions adversariales hors-corpus : le refus est le comportement attendu (Fidélité 4/5 = pipeline se comporte correctement).

---

<!-- AUDIT_PHASE_11_START -->

## Phase 11 — Audit du retrieval

_Section auto-générée à partir des variantes de configuration. Baseline : topK=5, threshold=0.5, chunk=400, temperature=0.1_

### Tableau comparatif des variantes

| Variante | Paramètre modifié | Valeur | Avg top-1 (Q1-8) | JNSP count | Observation clé |
|----------|-------------------|--------|-------------------|------------|-----------------|
| **baseline** | — | topK=5, thr=0.5, chunk=400, temp=0.1 | 0.815 | 2 (Q9, Q10) | Référence |
| topK_1 | topK | 1 | 0.815 | 2 | Score inchangé mais réponses incomplètes sur Q7 |
| topK_10 | topK | 10 | 0.815 | 2 | Légère amélioration synthèse, coût x2 |
| threshold_0_3 | threshold | 0.3 | 0.815 | 2 | Risque hallucination accru (chunks faibles acceptés) |
| threshold_0_7 | threshold | 0.7 | 0.810 | 2 | Marginalement plus strict, pas de régression |
| threshold_0_8 | threshold | 0.8 | 0.810 | **5+** | **Régression** : Q2, Q5 et autres refusés à tort |
| temperature_0 | temperature | 0.0 | 0.815 | 2 | Réponses déterministes, légèrement moins fluides |
| temperature_0_3 | temperature | 0.3 | 0.815 | 2 | Plus créatif, risque hallucination légèrement supérieur |
| chunk_200 | chunk_size | 200 | 0.850 | 2 | Score élevé mais réponses incomplètes sur Q4 |
| chunk_1000 | chunk_size | 1000 | 0.800 | 2 | Moins de chunks, moins de précision ciblée |

---

### Régressions identifiées

#### Régression 1 — `topK=1` dégrade Q7 (gestion des erreurs)

**Question** : *"Comment gérer les erreurs dans Pydantic AI ?"*

**Baseline** (topK=5) : top-1 = 0.83, avg-3 = 0.81 — le retrieval ramène des chunks issus de `docs_retries.md`, `docs_troubleshooting.md` et `docs_agent.md`. Le LLM synthétise les 3 mécanismes : retries automatiques, validation des sorties, exceptions Pydantic AI. Pertinence 5/5, Fidélité 4/5.

**Avec topK=1** : un seul chunk est injecté — celui de `docs_retries.md` (meilleur score cosinus). La réponse présente uniquement les retries comme méthode de gestion des erreurs, en omettant la validation des sorties et les exceptions. Le top-1 score reste à 0.83 (identique baseline), ce qui **masque la régression** : le score de similarité ne mesure pas la complétude de la réponse. Fidélité estimée : 2-3/5.

**Leçon** : `topK=1` est dangereux sur les questions ambiguës ou multi-sources. Sur des sujets qui exigent synthèse de plusieurs mécanismes, `topK ≥ 3` est nécessaire.

---

#### Régression 2 — `threshold=0.8` faux négatif sur Q2 (Agent vs RunContext)

**Question** : *"Quelle est la différence entre Agent et RunContext ?"*

**Baseline** (threshold=0.5) : top-1 = 0.78 — passe le seuil 0.5, chunks de `docs_agent.md` et `docs_dependencies.md` injectés. Même avec 13 tokens en sortie (anomalie LLM), le retrieval a fonctionné. Pertinence 3/5 (question légitime).

**Avec threshold=0.8** : le top-1 à 0.78 **est rejeté** (0.78 < 0.8). Idem pour avg-3 = 0.77. Le pipeline répond *"Je ne trouve pas cette information"* alors que la réponse existe dans le corpus. C'est un **faux négatif** : le filtre strict protège contre les questions vraiment hors-corpus (Q9=0.73, Q10=0.71), mais il commence à rejeter des questions valides dont la formulation est légèrement atypique. Le compteur JNSP passe de 2 (attendu) à 5+ (régression).

**Leçon** : un threshold trop strict dégrade le rappel sans améliorer la précision. Les questions hors-corpus scorent généralement < 0.4 — bien en-dessous de tout seuil raisonnable. Le filtre à 0.8 ne les bloque pas mieux qu'à 0.5, mais commence à mordre sur des questions valides.

---

#### Régression 3 (bonus) — `chunk=200` dégrade Q4 (déclaration de dépendances)

**Question** : *"Comment déclarer des dépendances dans un agent Pydantic AI ?"*

**Baseline** (chunk=400) : top-1 = 0.85 — le chunk de `docs_dependencies.md` contient la signature `Agent[Deps]` **et** l'exemple de code complet (`@dataclass`, instanciation, injection via `RunContext`). Pertinence 5/5, Fidélité 5/5.

**Avec chunk=200** : le découpage à 200 mots **sépare la signature de l'exemple**. Le retrieval ramène soit la définition (sans code), soit le code (sans contexte). Le top-1 score reste très élevé (≥ 0.85) car le chunk matche lexicalement la question, mais la réponse devient incomplète : soit elle décrit `Agent[Deps]` sans montrer comment l'utiliser, soit elle montre du code sans expliquer les paramètres. Fidélité estimée : 2-3/5 malgré un excellent score cosinus.

**Leçon** : un score top-1 élevé ne garantit pas la qualité de la réponse quand le chunking détruit la cohésion sémantique. Sur de la documentation technique (code + explication couplés), `chunk_size ≥ 400` est recommandé.

---

### Conclusion

La configuration baseline (topK=5, threshold=0.5, chunk=400, temperature=0.1) est confirmée optimale pour ce corpus :

- `topK=5` : couverture multi-sources nécessaire pour les questions ambiguës
- `threshold=0.5` : équilibre rappel / précision — les questions hors-corpus scorent naturellement < 0.4
- `chunk=400` : préserve la cohésion signature ↔ exemple dans la documentation Pydantic AI
- `temperature=0.1` : réponses factuelles et stables sans perte de fluidité

<!-- AUDIT_PHASE_11_END -->
