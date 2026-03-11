const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const envPath = path.join(__dirname, '..', '.env');

const loadPort = () => {
  try {
    const envText = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of envText.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const match = line.match(/^PORT=(.+)$/);
      if (match) {
        const parsed = Number(String(match[1]).trim());
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }
  } catch (_) {
    // Fall back to the runtime default if .env cannot be read.
  }

  return Number(process.env.PORT) || 5000;
};

const port = loadPort();

const killWindowsPortListeners = (targetPort) => {
  const psCommand = [
    '$connections = Get-NetTCPConnection -LocalPort ' + targetPort + ' -State Listen -ErrorAction SilentlyContinue',
    'if (-not $connections) { exit 0 }',
    '$pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique',
    'foreach ($pidValue in $pids) {',
    '  $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue',
    '  if ($proc -and $proc.ProcessName -eq \'node\') {',
    '    Stop-Process -Id $pidValue -Force -ErrorAction SilentlyContinue',
    '    Write-Output "Stopped PID $pidValue on port ' + targetPort + '"',
    '  }',
    '}',
  ].join('; ');

  try {
    const output = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`, {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    }).trim();

    if (output) {
      console.log(output);
    }
  } catch (error) {
    const stderr = String(error.stderr || '').trim();
    if (stderr) {
      console.warn(`kill-stale-port warning: ${stderr}`);
    }
  }
};

const killUnixPortListeners = (targetPort) => {
  try {
    const output = execSync(`lsof -ti tcp:${targetPort}`, {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    }).trim();

    if (!output) return;

    for (const pid of output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
      execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
      console.log(`Stopped PID ${pid} on port ${targetPort}`);
    }
  } catch (_) {
    // No listener found or lsof unavailable.
  }
};

if (process.platform === 'win32') {
  killWindowsPortListeners(port);
} else {
  killUnixPortListeners(port);
}
