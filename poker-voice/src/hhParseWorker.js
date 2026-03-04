import { parentPort } from 'node:worker_threads';
import { parseHandHistoryDeterministic } from './hhDeterministicParse.js';

if (!parentPort) {
  throw new Error('hhParseWorker должен запускаться только как Worker.');
}

parentPort.on('message', (job) => {
  const id = Number(job?.id);
  try {
    const result = parseHandHistoryDeterministic(job?.handHistory, job?.opponent || '', {
      allowEmpty: Boolean(job?.allowEmpty)
    });
    parentPort.postMessage({
      id,
      ok: true,
      result
    });
  } catch (error) {
    parentPort.postMessage({
      id,
      ok: false,
      error: error?.message || 'Ошибка deterministic parse worker.'
    });
  }
});
