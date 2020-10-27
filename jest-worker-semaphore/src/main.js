const { pipeline } = require('stream/promises');
const fs = require('fs');
const { default: Semaphore } = require('semaphore-async-await');
const { default: Worker } = require('jest-worker');
const split = require('split');

const WORKER_COUNT = 6;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function tryAcquire(semaphore, timeout) {
  let timedOut = false;
  return Promise.race([
    semaphore.acquire()
      .then(() => {
        if (timedOut) {
          semaphore.release();
        }
      })
      .then(() => true),
    delay(timeout)
      .then(() => {
        timedOut = true;
      })
      .then(() => false),
  ]);
}

async function main() {
  const worker = new Worker(require.resolve('./worker.js'), {
    exposedMethods: ['run'],
    numWorkers: WORKER_COUNT,
    enableWorkerThreads: true,
  });

  worker.getStdout().pipe(process.stdout);
  worker.getStderr().pipe(process.stderr);
  const sem = new Semaphore(WORKER_COUNT);

  await pipeline(
    fs.createReadStream('adj.txt'),
    split(),
    async function*(stream) {
      let outputs = [];

      const run = async (input) => {
        const output = await worker.run(input).catch(err => {
          sem.release();
          throw err;
        });
        await sem.release();
        return { input, output };
      };

      let offset = 0;
      const takeLeading = () => {
        let firstNull = outputs.indexOf(null);
        if (firstNull === -1) {
          firstNull = outputs.length;
        }

        let chunk = outputs.slice(0, firstNull);
        offset += chunk.length;

        if (firstNull > 0) {
          outputs = outputs.slice(firstNull);
        }

        return chunk;
      };

      for await (const input of stream) {
        console.log('[input]', input);

        for (const result of takeLeading()) {
          yield result;
        }


        while(!await tryAcquire(sem, 200)) {
          for (const result of takeLeading()) {
            yield result;
          }
        }

        for (const result of takeLeading()) {
          yield result;
        }

        const index = outputs.length + offset;
        outputs.push(null);

        // Note: not awaited
        run(input)
          .then(result => {
            outputs[index - offset] = result;
          })
          .catch((error) => {
            outputs[index - offset] = { error };
          });
      }

      for (const next of outputs) {
        if (next) {
          yield next;
        }
      }
    },
    async function*(stream) {
      for await (const { input, output } of stream) {
        console.log('[result]', input, '->', output);
      }
    }
  )

  console.log('[Done]');

  worker.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
})

