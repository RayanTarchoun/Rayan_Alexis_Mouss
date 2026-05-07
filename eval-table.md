# Tableau d'évaluation — Baseline

_Colonne Pertinence et Fidélité : notes humaines à remplir (1-5)_

| # | Question | Réponse | Top-1 score | Avg top-3 | Tokens (in/out) | Coût ($) | Pertinence (1-5) | Fidélité (1-5) | Notes |
|---|----------|---------|-------------|-----------|-----------------|----------|------------------|----------------|-------|
| 1 | Comment définir un outil dans Pydantic AI ? | Pour définir un outil dans Pydantic AI, plusieurs méthodes sont possibles selon le contexte et les besoins. Voici les approches mentionnées dans les documents fournis :  1. **Utilisation de Pydantic p | 0.81 | 0.80 | 1317/598 | 0.000622 | _/5_ | _/5_ | |
| 2 | Quelle est la différence entre Agent et RunContext ? | Je ne dispose pas d'informations suffisantes dans les documents fournis pour répondre à cette question. | 0.79 | 0.78 | 2557/21 | 0.000524 | _/5_ | _/5_ | |
| 3 | Comment streamer une réponse avec Pydantic AI ? | Pour streamer une réponse avec Pydantic AI, tu peux utiliser le pattern suivant basé sur les exemples fournis dans les documents :  ```python from datetime import date from pydantic import ValidationE | 0.83 | 0.83 | 2424/342 | 0.000690 | _/5_ | _/5_ | |
| 4 | Comment déclarer des dépendances dans un agent Pydantic AI ? | Pour déclarer des dépendances dans un agent Pydantic AI, voici les étapes à suivre selon le contexte fourni :  1. **Définir une classe de dépendances** (généralement une dataclass) pour regrouper les  | 0.86 | 0.84 | 2857/315 | 0.000760 | _/5_ | _/5_ | |
| 5 | Quels modèles LLM sont supportés par Pydantic AI ? | D'après les documents fournis, Pydantic AI supporte les modèles LLM des fournisseurs suivants :  **Fournisseurs natifs :** - OpenAI [Source 1] - Anthropic [Source 1] - Gemini (via Generative Language  | 0.81 | 0.80 | 4097/330 | 0.001017 | _/5_ | _/5_ | |
| 6 | Comment gérer l'historique des messages dans Pydantic AI ? | Pour gérer l'historique des messages dans Pydantic AI, voici les méthodes et bonnes pratiques à suivre selon le contexte fourni :  ### 1. **Accéder aux messages après un run** Après avoir exécuté un a | 0.83 | 0.82 | 2765/800 | 0.001033 | _/5_ | _/5_ | |
| 7 | Comment gérer les erreurs dans Pydantic AI ? | Je ne dispose pas d'informations suffisantes dans les documents fournis pour répondre à cette question. | 0.83 | 0.82 | 2042/21 | 0.000421 | _/5_ | _/5_ | |
| 8 | Comment tester un agent Pydantic AI ? | Pour tester un agent Pydantic AI, voici les méthodes recommandées selon les documents fournis :  1. **Utiliser `TestModel` ou `FunctionModel`** :    - Remplacez le modèle réel par [`TestModel`][pydant | 0.81 | 0.80 | 2801/573 | 0.000904 | _/5_ | _/5_ | |
| 9 | Quel est le PIB de la France en 2023 ? | Je ne dispose pas d'informations suffisantes dans les documents fournis pour répondre à cette question. | 0.76 | 0.75 | 2111/21 | 0.000435 | _/5_ | _/5_ | |
| 10 | Qui a gagné la Coupe du Monde de football en 2022 ? | Je ne dispose pas d'informations suffisantes dans les documents fournis pour répondre à cette question. | 0.73 | 0.72 | 0/0 | 0.000000 | _/5_ | _/5_ | |

## Agrégats

| Métrique | Valeur |
|---|---|
| Coût total (10 questions) | $0.006406 |
| Latence moyenne | 2545 ms |
| Moyenne pertinence | _à compléter_ |
| Moyenne fidélité | _à compléter_ |
