import { spawn } from 'node:child_process';
import { openSync, closeSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const frontendRoot = resolve(root, 'frontend');
const port = Number(process.env.ENJOY_DEV_PORT ?? 5173);
const address = `http://127.0.0.1:${port}`;
const logPath = resolve(tmpdir(), `enjoy-vite-${port}.log`);

async function inspect() {
  try {
    const response = await fetch(`${address}/__enjoy_dev`, {
      signal: AbortSignal.timeout(1000),
    });
    const server = await response.json();
    if (server.root !== frontendRoot || !Number.isInteger(server.pid)) {
      throw new Error(`Port ${port} belongs to another application.`);
    }
    return server;
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return null;
    throw new Error(`Cannot identify the development server at ${address}.`, {
      cause: error,
    });
  }
}

async function main() {
  const existing = await inspect();
  if (process.argv.includes('--stop')) {
    if (existing) process.kill(existing.pid, 'SIGTERM');
    console.log(
      existing ? 'Enjoy frontend stopped.' : 'Enjoy frontend is not running.',
    );
    return;
  }
  if (existing) {
    console.log(
      `Enjoy frontend ready: ${address} (reused PID ${existing.pid})`,
    );
    return;
  }
  const log = openSync(logPath, 'a');
  const child = spawn(
    process.execPath,
    [
      resolve(root, 'node_modules/vite/bin/vite.js'),
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    {
      cwd: frontendRoot,
      detached: true,
      stdio: ['ignore', log, log],
      env: { ...process.env, NO_COLOR: '1' },
    },
  );
  closeSync(log);
  let failure;
  child.on('error', (error) => {
    failure = error;
  });
  child.on('exit', (code) => {
    if (code) failure = new Error(`Vite exited with code ${code}.`);
  });
  child.unref();
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const server = await inspect();
    if (server) {
      console.log(`Enjoy frontend ready: ${address} (PID ${server.pid})`);
      return;
    }
    if (failure) throw failure;
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`Vite did not become ready. See ${logPath}.`);
}

main().catch((error) => {
  console.error(error.message);
  if (error.cause) console.error(error.cause.message);
  try {
    console.error(readFileSync(logPath, 'utf8').slice(-3000));
  } catch {}
  process.exitCode = 1;
});
