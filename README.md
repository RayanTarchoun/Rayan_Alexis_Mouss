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

## Phase 1 — Préparation du corpus

Le corpus est constitué de 175 fichiers Markdown extraits de la documentation officielle Pydantic AI (~1.36 MB).

Script PowerShell de récupération :

```powershell
git clone --depth 1 https://github.com/pydantic/pydantic-ai.git $env:TEMP\pa-clone
New-Item -ItemType Directory -Force -Path corpus
Get-ChildItem "$env:TEMP\pa-clone\docs" -Recurse -Filter "*.md" | ForEach-Object {
    $flat = $_.FullName.Replace("$env:TEMP\pa-clone\docs\", "").Replace("\", "_")
    Copy-Item $_.FullName "corpus\$flat"
}
Remove-Item -Recurse -Force "$env:TEMP\pa-clone"
```

Le dossier `corpus/` est ignoré par git (voir `.gitignore`).
