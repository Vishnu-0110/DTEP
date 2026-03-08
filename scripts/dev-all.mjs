import { spawn } from 'node:child_process';

const npmCommand = 'npm';
const children = new Set();
let isShuttingDown = false;

const terminateChild = (child) => {
  if (!child || child.killed) {
    return;
  }

  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });

    killer.on('error', () => {
      child.kill('SIGTERM');
    });

    return;
  }

  child.kill('SIGTERM');
};

const shutdown = (exitCode = 0) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  for (const child of children) {
    terminateChild(child);
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, 250);
};

const start = (label, args) => {
  const command = process.platform === 'win32'
    ? `${npmCommand} ${args.join(' ')}`
    : npmCommand;
  const spawnArgs = process.platform === 'win32' ? [] : args;
  const child = spawn(command, spawnArgs, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  });

  children.add(child);

  child.on('error', (error) => {
    console.error(`[dev-all] Failed to start ${label}: ${error.message}`);
    shutdown(1);
  });

  child.on('exit', (code, signal) => {
    children.delete(child);

    if (isShuttingDown) {
      return;
    }

    if (signal) {
      console.error(`[dev-all] ${label} stopped with signal ${signal}.`);
      shutdown(1);
      return;
    }

    if (code !== 0) {
      console.error(`[dev-all] ${label} exited with code ${code}.`);
      shutdown(code ?? 1);
      return;
    }

    shutdown(0);
  });
};

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('[dev-all] Starting frontend and backend dev servers...');
start('backend', ['run', 'backend:dev']);
start('frontend', ['run', 'frontend:dev']);
