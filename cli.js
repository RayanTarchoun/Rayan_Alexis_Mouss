// Phase 10 : Interface CLI interactive
import readline from 'readline';
import { ragQuery } from './rag-pipeline.js';

const MAX_QUESTION_LENGTH = 2000;

const rl = readline.createInterface({
  input:  process.stdin,
  output: process.stdout,
});

// Fermeture propre sur Ctrl+C — pas de promesse pendante
process.on('SIGINT', () => {
  console.log('\nAu revoir !');
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

    // Question vide → on redemande sans appeler le pipeline
    if (!question.trim()) continue;

    // Question trop longue → rejet explicite
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

      console.log('\n' + result.answer);

      if (result.sources.length > 0) {
        const fileList = result.sources.map(s => s.file).join(', ');
        console.log(`\nSources : [${fileList}]`);
        console.log(`Pertinence moyenne : ${result.metrics.avgScore.toFixed(2)}`);
      }

      console.log('');
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
