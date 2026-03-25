import { execSync } from 'node:child_process';

const workspace = process.cwd().replace(/\\/g, '/').toLowerCase();

const patterns = [
  'scripts/dev-all.mjs',
  'vite/bin/vite.js',
  'nodemon/bin/nodemon.js',
  'npm-cli.js run backend:dev',
  'npm-cli.js --prefix backend run dev',
  'npm-cli.js run frontend:dev',
];

const normalize = (value) => String(value || '').replace(/\\/g, '/').toLowerCase();
const shouldKill = (commandLine) => {
  const normalized = normalize(commandLine);
  if (!normalized.includes(workspace)) return false;
  return patterns.some((pattern) => normalized.includes(pattern));
};

const killWindows = () => {
  const output = execSync(
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process -Filter \\"Name=\'node.exe\'\\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"',
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }
  ).trim();

  if (!output) return [];
  const parsed = JSON.parse(output);
  const items = Array.isArray(parsed) ? parsed : [parsed];
  const killed = [];

  for (const item of items) {
    const pid = Number(item?.ProcessId);
    const commandLine = String(item?.CommandLine || '');
    if (!Number.isFinite(pid) || pid <= 0) continue;
    if (pid === process.pid) continue;
    if (!shouldKill(commandLine)) continue;

    try {
      process.kill(pid, 'SIGKILL');
      killed.push(pid);
    } catch (_) {
      // Process may have already exited; ignore.
    }
  }

  return killed;
};

const killUnix = () => {
  const output = execSync('ps -eo pid=,args=', {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  }).trim();

  if (!output) return [];
  const killed = [];

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const firstSpaceIndex = line.indexOf(' ');
    if (firstSpaceIndex <= 0) continue;

    const pid = Number(line.slice(0, firstSpaceIndex).trim());
    const commandLine = line.slice(firstSpaceIndex + 1).trim();
    if (!Number.isFinite(pid) || pid <= 0) continue;
    if (pid === process.pid) continue;
    if (!shouldKill(commandLine)) continue;

    try {
      process.kill(pid, 'SIGKILL');
      killed.push(pid);
    } catch (_) {
      // Process may have already exited; ignore.
    }
  }

  return killed;
};

try {
  const killed = process.platform === 'win32' ? killWindows() : killUnix();
  if (killed.length > 0) {
    console.log(`[kill-stale-dev] Stopped stale dev processes: ${killed.join(', ')}`);
  } else {
    console.log('[kill-stale-dev] No stale dev processes found.');
  }
} catch (error) {
  const message = String(error?.message || error || 'Unknown error');
  console.warn(`[kill-stale-dev] Warning: ${message}`);
}
