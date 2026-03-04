import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { parseHandHistoryDeterministic } from './hhDeterministicParse.js';

const WORKER_URL = new URL('./hhParseWorker.js', import.meta.url);

function normalizeConcurrency(value, handCount = 0) {
  const requested = Number(value);
  const safeRequested = Number.isFinite(requested) ? Math.trunc(requested) : 1;
  const upperBound = handCount > 0 ? handCount : 1;
  return Math.max(1, Math.min(safeRequested, upperBound));
}

export function defaultParseConcurrency() {
  const cpuCount = Number(os.cpus()?.length || 1);
  return Math.max(1, Math.min(12, cpuCount - 1));
}

export function parseHandsDeterministicSequential(handHistories = [], { opponent = '', allowEmpty = true } = {}) {
  return handHistories.map((handHistory) => {
    try {
      return {
        ok: true,
        result: parseHandHistoryDeterministic(handHistory, opponent, { allowEmpty })
      };
    } catch (error) {
      return {
        ok: false,
        error: error?.message || 'Ошибка deterministic parse.'
      };
    }
  });
}

export async function parseHandsDeterministicPool(handHistories = [], {
  opponent = '',
  allowEmpty = true,
  concurrency = 1
} = {}) {
  const jobs = Array.isArray(handHistories)
    ? handHistories.map((item) => String(item || ''))
    : [];

  if (!jobs.length) return [];

  const workerCount = normalizeConcurrency(concurrency, jobs.length);
  if (workerCount <= 1 || jobs.length <= 1) {
    return parseHandsDeterministicSequential(jobs, { opponent, allowEmpty });
  }

  const results = new Array(jobs.length);
  let completed = 0;
  let nextJobIndex = 0;
  let settled = false;
  const workers = [];

  const terminateAll = async () => {
    await Promise.all(workers.map(async (worker) => {
      try {
        await worker.terminate();
      } catch {}
    }));
  };

  return new Promise((resolve, reject) => {
    const fail = async (error) => {
      if (settled) return;
      settled = true;
      await terminateAll();
      reject(error);
    };

    const finish = async () => {
      if (settled) return;
      settled = true;
      await terminateAll();
      resolve(results);
    };

    const assignNext = (worker) => {
      if (settled) return;
      if (nextJobIndex >= jobs.length) {
        worker.__idle = true;
        return;
      }
      const id = nextJobIndex;
      nextJobIndex += 1;
      worker.__activeJobId = id;
      worker.postMessage({
        id,
        handHistory: jobs[id],
        opponent,
        allowEmpty
      });
    };

    const handleWorkerMessage = (worker, message) => {
      if (settled) return;
      const id = Number(message?.id);
      if (!Number.isInteger(id) || id < 0 || id >= jobs.length) {
        void fail(new Error('Worker вернул некорректный id задачи.'));
        return;
      }
      results[id] = message?.ok
        ? { ok: true, result: message.result }
        : { ok: false, error: String(message?.error || 'Ошибка deterministic parse worker.') };
      completed += 1;
      worker.__activeJobId = null;
      if (completed >= jobs.length) {
        void finish();
        return;
      }
      assignNext(worker);
    };

    for (let index = 0; index < workerCount; index += 1) {
      const worker = new Worker(WORKER_URL, { type: 'module' });
      worker.__activeJobId = null;
      worker.__idle = false;
      workers.push(worker);

      worker.on('message', (message) => handleWorkerMessage(worker, message));
      worker.on('error', (error) => {
        void fail(error);
      });
      worker.on('exit', (code) => {
        if (settled) return;
        if (code === 0) return;
        void fail(new Error(`Worker завершился с кодом ${code}.`));
      });

      assignNext(worker);
    }
  });
}
