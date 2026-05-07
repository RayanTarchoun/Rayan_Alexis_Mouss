// Phase 16 (J5) : formatResponse — footer disclaimer + note pertinence si <0.80
// Centralise la mise en forme : sources, note de confiance, disclaimer obligatoire.

const DISCLAIMER =
  '*Réponse générée par IA à partir des documents fournis. Vérifiez les sources avant toute décision importante.*';

/**
 * formatResponse — assemble la réponse finale prête à afficher.
 *
 * @param {string} answer — texte de réponse brut renvoyé par le LLM (ou message JNSP)
 * @param {Array}  sources — tableau [{file, index?, relevance?, page?, url?}]
 * @param {number} confidence — score de pertinence (0..1) ; en dessous de 0.80 on ajoute une note
 * @returns {string} — réponse formatée Markdown
 */
export function formatResponse(answer, sources = [], confidence = null) {
  const sourcesList =
    Array.isArray(sources) && sources.length > 0
      ? '\n\n**Sources :**\n' +
        sources
          .map((s, i) => {
            const file = s.file || s.source || 'Source inconnue';
            const ref = s.url ? `[${file}](${s.url})` : file;
            const page = s.page ? ` — p.${s.page}` : '';
            return `[${i + 1}] ${ref}${page}`;
          })
          .join('\n')
      : '';

  // Note de pertinence : on alerte l'utilisateur quand la confiance est faible
  // (mais que la requête est quand même partie au LLM, donc >= CONFIDENCE_THRESHOLD).
  const confidenceNote =
    Number.isFinite(confidence) && confidence < 0.80
      ? `\n\n> Note : score de pertinence contextuelle : ${(confidence * 100).toFixed(0)}%.`
      : '';

  return `${answer}${sourcesList}${confidenceNote}\n\n---\n${DISCLAIMER}`;
}
