import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const logDirectory = resolve(root, '.runtime');
mkdirSync(logDirectory, { recursive: true });

function available(port) {
  return new Promise(resolvePort => {
    const server = createServer();
    server.once('error', () => resolvePort(false));
    server.listen(port, '0.0.0.0', () => server.close(() => resolvePort(true)));
  });
}

let port = Number(process.env.PORT || 5186);
while (!(await available(port))) {
  port += 1;
  if (port > 5300) throw new Error('No available development port.');
}
const log = openSync(resolve(logDirectory, 'vite.log'), 'a');
const child = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', '0.0.0.0', '--port', String(port), '--strictPort'], {
  cwd: root,
  detached: true,
  stdio: ['ignore', log, log],
});
child.on('error', error => { console.error(error); process.exitCode = 1; });
child.unref();
closeSync(log);
writeFileSync(resolve(logDirectory, 'server.json'), JSON.stringify({ pid: child.pid, port, url: `http://localhost:${port}/` }, null, 2));
console.log(`Sunny Life: http://localhost:${port}/`);
console.log(`Server PID: ${child.pid}`);
console.log(`Log: ${resolve(logDirectory, 'vite.log')}`);
