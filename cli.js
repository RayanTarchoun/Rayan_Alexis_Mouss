// Phase 10 : Interface CLI interactive
// Phase 16 (J5) : utilise formatResponse pour disclaimer + note pertinence
import readline from 'readline';
import { ragQuery } from './rag-pipeline.js';
import { formatResponse } from './lib/format-response.js';
import { getSessionStats } from './lib/cost-tracker.js';

const MAX_QUESTION_LENGTH = 2000;

const rl = readline.createInterface({
  input:  process.stdin,
  output: process.stdout,
});

// Fermeture propre sur Ctrl+C — pas de promesse pendante
process.on('SIGINT', () => {
  const stats = getSessionStats();
  console.log(`\n\nAu revoir ! Session : ${stats.requests} requête(s), $${stats.totalUSD.toFixed(4)}`);
  rl.close();
  process.exit(0);
});

function ask(prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function main() {
  console.log('Mini-Perplexity — posez vos questions sur le corpus Pydantic AI');
  console.log('(Ctrl+C pour quitter)\n');

  while (true) {
    const question = await ask('> ');

    if (!question.trim()) continue;

    if (question.length > MAX_QUESTION_LENGTH) {
      console.log(
        `\nQuestion trop longue (${question.length} caractères, max ${MAX_QUESTION_LENGTH}). ` +
        `Raccourcissez votre question.\n`
      );
      continue;
    }

    console.log('Recherche en cours...');

    try {
      const result = await ragQuery(question, { topK: 5, verbose: false });

      // Phase 16 : passage par formatResponse (footer + note pertinence)
      const formatted = formatResponse(
        result.answer,
        result.sources,
        result.confidence?.topScore ?? null
      );
      console.log('\n' + formatted + '\n');
    } catch (err) {
      console.error(`\nErreur : ${err.message}\n`);
    }
  }
}

main().catch(err => {
  console.error(err);
  rl.close();
  process.exit(1);
});
