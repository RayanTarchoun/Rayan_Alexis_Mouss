# Tableau d'évaluation — Run 5

_Run 5 : topK=15 (fix eval.js), chunkSize=200, CONFIDENCE_THRESHOLD=0.78, max_tokens=800_

| # | Question | Réponse | Top-1 score | Avg top-3 | Tokens (in/out) | Coût ($) | Pertinence (1-5) | Fidélité (1-5) | Notes |
|---|----------|---------|-------------|-----------|-----------------|----------|------------------|----------------|-------|
| 1 | Comment définir un outil dans Pydantic AI ? | Je ne dispose pas d'informations suffisantes dans les documents fournis pour répondre à cette question. | 0.81 | 0.80 | 1317/21 | 0.000276 | 1/5 | 4/5 | Faux négatif : LLM appelé (top=0.81 > seuil) mais refuse d'utiliser le contexte |
| 2 | Quelle est la différence entre Agent et RunContext ? | Je ne dispose pas d'informations suffisantes dans les documents fournis pour répondre à cette question. | 0.79 | 0.78 | 2557/21 | 0.000524 | 1/5 | 4/5 | Faux négatif : info dispersée dans le corpus, LLM juge le contexte insuffisant |
| 3 | Comment streamer une réponse avec Pydantic AI ? | Pour streamer une réponse avec Pydantic AI, tu peux utiliser le pattern suivant basé sur les exemples fournis dans les documents : ```python ... async with agent.run_stream(user_input) as result: ... ``` | 0.83 | 0.83 | 2424/327 | 0.000681 | 5/5 | 5/5 | Réponse complète avec code fonctionnel et citations correctes |
| 4 | Comment déclarer des dépendances dans un agent Pydantic AI ? | Pour déclarer des dépendances dans un agent Pydantic AI, il faut suivre ces étapes : 1. Définir une dataclass ... 2. Passer le type via deps_type ... 3. Passer une instance via deps ... | 0.86 | 0.84 | 2857/295 | 0.000748 | 5/5 | 5/5 | Meilleur score top-1 (0.86), réponse structurée en 3 étapes avec code |
| 5 | Quels modèles LLM sont supportés par Pydantic AI ? | D'après les documents fournis, Pydantic AI supporte : OpenAI, Anthropic, Gemini, xAI, Bedrock, Cerebras, Cohere, Groq, Hugging Face, Mistral, OpenRouter, Outlines + 14 fournisseurs compatibles OpenAI | 0.81 | 0.80 | 4097/205 | 0.000942 | 5/5 | 5/5 | Liste exhaustive et fidèle aux sources |
| 6 | Comment gérer l'historique des messages dans Pydantic AI ? | Pour gérer l'historique des messages : 1. all_messages()/new_messages() 2. message_history param 3. sérialisation JSON 4. history_processors 5. cas stream | 0.83 | 0.82 | 2765/709 | 0.000978 | 5/5 | 5/5 | Réponse la plus complète : 5 méthodes détaillées, citations par source |
| 7 | Comment gérer les erreurs dans Pydantic AI ? | Je ne dispose pas d'informations suffisantes dans les documents fournis pour répondre à cette question. | 0.83 | 0.82 | 2042/21 | 0.000421 | 1/5 | 4/5 | Faux négatif persistant malgré top=0.83 ; info sur les erreurs absente du corpus |
| 8 | Comment tester un agent Pydantic AI ? | Pour tester un agent Pydantic AI : pytest, TestModel, FunctionModel, ALLOW_MODEL_REQUESTS=False, inline-snapshot, dirty-equals, Pydantic Evals | 0.81 | 0.80 | 2801/752 | 0.001011 | 5/5 | 5/5 | Réponse la plus longue (752 tokens), 8 stratégies couvertes avec exemples |
| 9 | Quel est le PIB de la France en 2023 ? | Je ne dispose pas d'informations suffisantes dans les documents fournis pour répondre à cette question. | 0.76 | 0.75 | 0/0 | 0.000000 | 5/5 | 5/5 | Court-circuit correct : top=0.76 < seuil 0.78, $0 dépensé |
| 10 | Qui a gagné la Coupe du Monde de football en 2022 ? | Je ne dispose pas d'informations suffisantes dans les documents fournis pour répondre à cette question. | 0.73 | 0.72 | 0/0 | 0.000000 | 5/5 | 5/5 | Court-circuit correct : top=0.73 < seuil 0.78, $0 dépensé |

## Agrégats

| Métrique | Valeur |
|---|---|
| Coût total (10 questions) | $0.005581 |
| Latence moyenne | 3169 ms |
| Moyenne pertinence | **3.8 / 5** |
| Moyenne fidélité | **4.7 / 5** |

## Analyse

| Catégorie | Résultat |
|---|---|
| Questions corpus réussies | 5/8 (Q3, Q4, Q5, Q6, Q8) |
| Faux négatifs corpus | 3/8 (Q1, Q2, Q7) |
| Questions adversariales court-circuitées | 2/2 (Q9, Q10) — $0, 0 token |
| Taux de refus correct | 100% (aucune hallucination) |

**Faux négatifs (Q1, Q2, Q7)** : le LLM est bien appelé (top > 0.78) mais juge le contexte insuffisant. L'info sur la définition d'outils et la gestion d'erreurs est soit absente du corpus, soit trop fragmentée pour que le modèle la restitue.

**Court-circuit adversarial** : Q9 (top=0.76) et Q10 (top=0.73) sont correctement bloqués avant le LLM — conformément à la phase 15 de la spec J5.
