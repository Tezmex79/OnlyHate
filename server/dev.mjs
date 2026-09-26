import { spawn } from 'node:child_process';

const processes = [
  spawn(process.execPath, ['server/index.mjs'], {
    env: { ...process.env, PORT: process.env.PORT ?? '8787' },
    stdio: 'inherit',
  }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '0.0.0.0'], {
    stdio: 'inherit',
  }),
];

const stopAll = (exitCode = 0) => {
  for (const child of processes) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(exitCode);
};

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

for (const child of processes) {
  child.on('error', (error) => {
    console.error(error.message);
    stopAll(1);
  });

  child.on('exit', (code) => {
    if (code && code !== 0) {
      stopAll(code);
    }
  });
}
