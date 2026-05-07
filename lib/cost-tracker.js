// Phase 13 (J5) : cost tracker centralisé + compteur de session
// - calculateCost(promptTokens, completionTokens, model) : retourne le coût d'une requête
// - trackCost(...) : idem + l'ajoute au total session
// - logCostStats(cost) : affiche le format `[Stats] Input: X | Output: Y | Coût: $Z | Session total: $W`

const PRICING = {
  'mistral-small-latest':  { input: 0.2 / 1_000_000, output: 0.6 / 1_000_000 },
  'mistral-large-latest':  { input: 2.0 / 1_000_000, output: 6.0 / 1_000_000 },
  'mistral-medium-latest': { input: 0.4 / 1_000_000, output: 2.0 / 1_000_000 },
};

let sessionTotalUSD = 0;
let sessionRequests = 0;

/**
 * calculateCost — coût d'UNE requête, sans effet de bord.
 * Utilise la table de tarifs PRICING ci-dessus.
 */
export function calculateCost(promptTokens, completionTokens, model = 'mistral-small-latest') {
  const tariff = PRICING[model] || PRICING['mistral-small-latest'];
  const costUSD = promptTokens * tariff.input + completionTokens * tariff.output;
  return {
    promptTokens,
    completionTokens,
    costUSD: parseFloat(costUSD.toFixed(6)),
    model,
  };
}

/**
 * trackCost — calcule le coût + l'ajoute au compteur session.
 * À appeler après CHAQUE appel LLM réussi.
 */
export function trackCost(promptTokens, completionTokens, model = 'mistral-small-latest') {
  const cost = calculateCost(promptTokens, completionTokens, model);
  sessionTotalUSD += cost.costUSD;
  sessionRequests++;
  return cost;
}

export function getSessionStats() {
  return {
    totalUSD: parseFloat(sessionTotalUSD.toFixed(6)),
    requests: sessionRequests,
  };
}

export function resetSession() {
  sessionTotalUSD = 0;
  sessionRequests = 0;
}

/**
 * logCostStats — format standard de log demandé par le sujet J5 :
 *   [Stats] Input: 743 tokens | Output: 187 tokens | Coût: $0.0031 | Session total: $0.0031
 */
export function logCostStats(cost) {
  console.log(
    `[Stats] Input: ${cost.promptTokens} tokens | Output: ${cost.completionTokens} tokens | ` +
    `Coût: $${cost.costUSD.toFixed(4)} | Session total: $${sessionTotalUSD.toFixed(4)}`
  );
}
