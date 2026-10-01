// Inspect a running page through the Chrome DevTools Protocol, and optionally
// capture it once the page says it is ready.
//
//   node tools/inspect-page.mjs http://127.0.0.1:5188/?cell=plant-cell "window.cellAtelier.state"
//   node tools/inspect-page.mjs http://127.0.0.1:5188/ "window.cellAtelier?.state.loading ? null : 'ready'" \
//        --shot _preview/page.png --size 1600x1000
//
// Chrome's --screenshot flag races the model download: virtual time can expire
// before a multi-megabyte GLB is parsed, which yields a blank canvas. Waiting on
// an expression first makes the capture deterministic.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const argv = process.argv.slice(2);
const shotIndex = argv.indexOf('--shot');
const shotPath = shotIndex === -1 ? null : argv[shotIndex + 1];
const sizeIndex = argv.indexOf('--size');
const size = sizeIndex === -1 ? '1600x1000' : argv[sizeIndex + 1];
const skip = new Set();
if (shotIndex !== -1) skip.add(shotIndex + 1);
if (sizeIndex !== -1) skip.add(sizeIndex + 1);
const positional = argv.filter((value, index) => !value.startsWith('--') && !skip.has(index));

const [url = 'http://127.0.0.1:5188/', expressionArgument = 'window.cellAtelier?.state.loading ? null : window.cellAtelier.state'] = positional;
// An expression that starts with @ is read from a file, which keeps quotes and
// newlines intact when the shell would otherwise mangle them.
const expression = expressionArgument.startsWith('@')
  ? readFileSync(expressionArgument.slice(1), 'utf8')
  : expressionArgument;
const port = 9411 + Math.floor(Math.random() * 200);

const candidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const browser = candidates.find((candidate) => existsSync(candidate));
if (!browser) throw new Error('No Chrome or Edge installation found.');

const child = spawn(browser, [
  '--headless=new',
  '--disable-gpu',
  '--enable-unsafe-swiftshader',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  `--window-size=${size.replace('x', ',')}`,
  `--remote-debugging-port=${port}`,
  '--user-data-dir=' + process.env.TEMP + '\\cell-atelier-probe',
  url,
], { stdio: 'ignore' });

const stop = () => { try { child.kill(); } catch { /* already gone */ } };
process.on('exit', stop);

async function target() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = (await response.json()).filter((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
      if (pages.length) return pages[0].webSocketDebuggerUrl;
    } catch { /* browser not up yet */ }
    await delay(250);
  }
  throw new Error('Chrome never exposed a debugging target.');
}

const socket = new WebSocket(await target());
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let nextId = 1;
const pending = new Map();
const events = [];
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  const handler = pending.get(message.id);
  if (handler) {
    pending.delete(message.id);
    handler(message);
    return;
  }
  if (message.method === 'Runtime.exceptionThrown') {
    const details = message.params.exceptionDetails;
    events.push(`EXCEPTION ${details.exception?.description ?? details.text}`);
  }
  if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
    events.push(`CONSOLE.${message.params.type} ${message.params.args.map((a) => a.value ?? a.description).join(' ')}`);
  }
  if (message.method === 'Log.entryAdded' && ['error', 'warning'].includes(message.params.entry.level)) {
    events.push(`LOG.${message.params.entry.level} ${message.params.entry.text}`);
  }
});

function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve) => pending.set(id, resolve));
}

async function evaluate(expressionText) {
  const result = await send('Runtime.evaluate', { expression: expressionText, returnByValue: true, awaitPromise: true });
  if (result.result?.exceptionDetails) {
    throw new Error(result.result.exceptionDetails.exception?.description ?? 'evaluation failed');
  }
  return result.result?.result?.value;
}

let value;
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.reload', { ignoreCache: true });
for (let attempt = 0; attempt < 80; attempt += 1) {
  try {
    value = await evaluate(expression);
  } catch (error) {
    value = `ERROR: ${error.message}`;
  }
  // A throwing expression means "not ready yet" while the module is still
  // evaluating, so keep polling instead of reporting the failure immediately.
  if (value !== null && value !== undefined && !String(value).startsWith('ERROR:')) break;
  await delay(500);
}

await delay(1200);
console.log(JSON.stringify(value, null, 2));
if (events.length) console.log('page events:\n' + events.join('\n'));

if (shotPath) {
  const capture = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const data = capture.result?.data;
  if (!data) throw new Error('Page.captureScreenshot returned no data');
  writeFileSync(shotPath, Buffer.from(data, 'base64'));
  console.log(`screenshot: ${shotPath} (${Math.round(Buffer.from(data, 'base64').length / 1024)} KB)`);
}

socket.close();
stop();
process.exit(0);
