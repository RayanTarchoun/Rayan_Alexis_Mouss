// Phase 12 (J5) : couches de robustesse pour les appels API Mistral
// - withRetry : backoff exponentiel + jitter, retente sur 429/503
// - CircuitBreaker : coupe le circuit après N échecs consécutifs

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * withRetry — exécute fn(), retente sur 429/503 avec backoff exponentiel + jitter.
 * Délais : ~1s, ~2s, ~4s, ~8s (+ random 0-500ms pour éviter le thundering herd).
 *
 * @param {Function} fn       — fonction async à exécuter
 * @param {number}   maxRetries — nombre max de retries (défaut 3)
 * @param {number}   baseDelay  — délai de base en ms (défaut 1000)
 */
export async function withRetry(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err?.message || '';
      const isRetryable = msg.includes('429') || msg.includes('503');
      const isLastAttempt = attempt === maxRetries;
      if (!isRetryable || isLastAttempt) throw err;

      const delay = Math.pow(2, attempt) * baseDelay + Math.random() * 500;
      console.log(`[Retry] Tentative ${attempt + 1}/${maxRetries} dans ${Math.round(delay)}ms`);
      await sleep(delay);
    }
  }
}

/**
 * CircuitBreaker — coupe les appels après threshold pannes consécutives.
 * États : CLOSED (normal) → OPEN (bloqué) → HALF_OPEN (1 requête test).
 *
 * Inspiration : disjoncteur électrique. Si on a 5 pannes en série, on arrête
 * de bombarder l'API et on attend `timeout` ms avant de retester.
 */
export class CircuitBreaker {
  constructor(options = {}) {
    this.threshold = options.threshold || 5;     // pannes consécutives avant ouverture
    this.timeout = options.timeout || 30_000;    // durée de l'état "ouvert" en ms
    this.failures = 0;
    this.state = 'CLOSED';                       // CLOSED | OPEN | HALF_OPEN
    this.nextAttempt = Date.now();
  }

  async call(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit ouvert - service indisponible, réessayez plus tard');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }

  _onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  _onFailure() {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
      console.error(`[CircuitBreaker] Circuit ouvert - ${this.failures} pannes consécutives`);
    }
  }
}

// Instance partagée pour tous les appels Mistral (embeddings + completions)
export const mistralBreaker = new CircuitBreaker({ threshold: 5, timeout: 30_000 });
