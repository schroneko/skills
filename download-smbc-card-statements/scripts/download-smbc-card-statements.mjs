import { mkdir, readdir, readFile, rename, rm, stat, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (!arg.startsWith('--')) continue;
  const key = arg.slice(2);
  const next = process.argv[index + 1];
  if (next && !next.startsWith('--')) {
    args.set(key, next);
    index += 1;
  } else {
    args.set(key, 'true');
  }
}

const targetRoot = args.get('target-dir');
if (!targetRoot) {
  throw new Error('Missing --target-dir');
}

const requestedCard = args.get('card') || 'all';
const requestedMonths = args.get('months')?.split(',').map((month) => month.trim()).filter(Boolean) || null;
const entryUrl = args.get('entry-url') || 'https://www.smbc-card.com/memx/web_meisai/top/index.html?dk=hp_005_0021918_hd';
const devtoolsPortPath = args.get('devtools-port-file') || `${process.env.HOME}/Library/Application Support/Google/Chrome/DevToolsActivePort`;
const tempDir = args.get('temp-dir') || join(tmpdir(), `smbc-card-statements-${process.pid}`);

const knownCards = [
  {
    match: /三井住友ゴールド.*ＮＬ|三井住友ゴールド.*NL/,
    slug: 'smbc-gold-v-nl',
  },
  {
    match: /オーナーズ.*Ｇ|オーナーズ.*G/,
    slug: 'smbc-owners-v-g',
  },
];

await mkdir(targetRoot, { recursive: true });
await mkdir(tempDir, { recursive: true });

const [portLine, browserPath] = (await readFile(devtoolsPortPath, 'utf8')).trim().split('\n');
const ws = new WebSocket(`ws://127.0.0.1:${Number(portLine)}${browserPath}`);
let nextId = 1;
const pending = new Map();
const downloadEvents = [];

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method?.startsWith('Browser.download')) downloadEvents.push(message);
  if (!message.id || !pending.has(message.id)) return;
  const handlers = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) handlers.reject(new Error(`${message.error.message}: ${message.error.data || ''}`));
  else handlers.resolve(message.result);
});

await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});

function send(method, params = {}, sessionId = undefined) {
  const id = nextId;
  nextId += 1;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evalValue(expression, sessionId) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Runtime exception');
  return result.result.value;
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(expression, sessionId, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const ok = await evalValue(expression, sessionId).catch(() => false);
    if (ok) return true;
    await wait(250);
  }
  return false;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function newestCsvAfter(startedAt) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const names = await readdir(tempDir);
    const csvs = [];
    for (const name of names) {
      if (!name.toLowerCase().endsWith('.csv')) continue;
      const full = join(tempDir, name);
      const info = await stat(full);
      if (info.mtimeMs >= startedAt - 1000 && info.size > 0) {
        csvs.push({ full, name, mtimeMs: info.mtimeMs });
      }
    }
    csvs.sort((a, b) => b.mtimeMs - a.mtimeMs);
    if (csvs[0]) return csvs[0];
    await wait(250);
  }
  return null;
}

function slugForCard(text) {
  const known = knownCards.find((card) => card.match.test(text));
  if (known) return known.slug;
  return text.normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'smbc-card';
}

async function openEntry(sessionId) {
  await evalValue(`location.href = ${JSON.stringify(entryUrl)}; true`, sessionId);
  const ok = await waitUntil(`document.readyState === 'complete' && Array.from(document.querySelectorAll('select')).some((select) => Array.from(select.options).some((option) => /^20\\d{4}$/.test(option.value)))`, sessionId);
  if (!ok) throw new Error('month selector not found');
}

async function readCards(sessionId) {
  return await evalValue(`(() => {
    const select = document.querySelector('select[name="vp-view-VC0205-001_RS0051_cardIdentifyKey"]');
    if (!select) return [];
    return Array.from(select.options).map((option) => ({
      text: option.textContent.trim(),
      value: option.value
    }));
  })()`, sessionId);
}

async function selectCard(sessionId, cardValue) {
  const result = await evalValue(`(() => {
    const card = document.querySelector('select[name="vp-view-VC0205-001_RS0051_cardIdentifyKey"]');
    if (!card) return 'missing';
    if (card.value === ${JSON.stringify(cardValue)}) return 'same';
    card.value = ${JSON.stringify(cardValue)};
    card.dispatchEvent(new Event('change', { bubbles: true }));
    return 'changed';
  })()`, sessionId);
  if (result === 'missing') throw new Error('card selector not found');
  if (result === 'changed') {
    await waitUntil(`document.readyState === 'complete'`, sessionId);
    await wait(800);
  }
}

async function readMonths(sessionId) {
  return await evalValue(`(() => {
    const select = Array.from(document.querySelectorAll('select')).find((item) => {
      return Array.from(item.options).some((option) => /^20\\d{4}$/.test(option.value));
    });
    if (!select) return [];
    return Array.from(select.options).filter((option) => /^20\\d{4}$/.test(option.value)).map((option) => ({
      text: option.textContent.trim(),
      value: option.value
    }));
  })()`, sessionId);
}

async function openMonth(sessionId, month) {
  const clicked = await evalValue(`(() => {
    const monthSelect = Array.from(document.querySelectorAll('select')).find((select) => Array.from(select.options).some((option) => option.value === ${JSON.stringify(month)}));
    const queryCandidates = Array.from(document.querySelectorAll('input, button')).filter((element) => (element.value || element.innerText || '').trim() === '照会');
    const query = queryCandidates.find((element) => element.type === 'submit') || queryCandidates[0];
    if (!monthSelect || !query) return false;
    monthSelect.value = ${JSON.stringify(month)};
    monthSelect.dispatchEvent(new Event('change', { bubbles: true }));
    query.click();
    return true;
  })()`, sessionId);
  if (!clicked) throw new Error('query controls not found');
  await waitUntil(`document.readyState === 'complete'`, sessionId);
  await wait(800);
}

async function clickCsv(sessionId) {
  return await evalValue(`(() => {
    const csv = Array.from(document.querySelectorAll('a')).find((element) => (element.innerText || element.textContent || '').includes('CSV形式で保存する'));
    if (!csv) return false;
    csv.scrollIntoView({ block: 'center' });
    csv.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    csv.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    csv.click();
    return true;
  })()`, sessionId);
}

const targets = await send('Target.getTargets');
const target = targets.targetInfos.find((item) => item.url.includes('smbc-card.com/memx/web_meisai/top/index.html'));
if (!target) throw new Error('Open the logged-in SMBC web statement page in Chrome first');

const { sessionId } = await send('Target.attachToTarget', {
  targetId: target.targetId,
  flatten: true,
});

await send('Runtime.enable', {}, sessionId);
await send('Page.enable', {}, sessionId);
await send('Network.enable', {}, sessionId);
await send('Browser.setDownloadBehavior', {
  behavior: 'allow',
  downloadPath: tempDir,
  eventsEnabled: true,
}).catch(async () => {
  await send('Page.setDownloadBehavior', {
    behavior: 'allow',
    downloadPath: tempDir,
  }, sessionId);
});

await openEntry(sessionId);
const pageCards = await readCards(sessionId);
const selectedCards = pageCards.map((card) => ({
  ...card,
  slug: slugForCard(card.text),
})).filter((card) => requestedCard === 'all' || card.slug === requestedCard);

if (selectedCards.length === 0) {
  throw new Error(`No matching card found for --card ${requestedCard}`);
}

const saved = [];
const skipped = [];

for (const card of selectedCards) {
  const cardDir = join(targetRoot, card.slug);
  await mkdir(cardDir, { recursive: true });
  await openEntry(sessionId);
  await selectCard(sessionId, card.value);
  const visibleMonths = requestedMonths || (await readMonths(sessionId)).map((month) => month.value);
  for (const month of visibleMonths) {
    const output = `${card.slug}-${month}.csv`;
    const destination = join(cardDir, output);
    if (await exists(destination)) {
      skipped.push(`${output}: exists`);
      continue;
    }
    console.error(`checking ${output}`);
    try {
      await openEntry(sessionId);
      await selectCard(sessionId, card.value);
      await openMonth(sessionId, month);
      const before = Date.now();
      const beforeEvents = downloadEvents.length;
      const clicked = await clickCsv(sessionId);
      if (!clicked) {
        skipped.push(`${output}: no direct csv`);
        continue;
      }
      const got = await newestCsvAfter(before);
      if (!got) {
        const events = downloadEvents.slice(beforeEvents).map((event) => event.method).join(',');
        skipped.push(`${output}: no download${events ? ` events=${events}` : ''}`);
        continue;
      }
      if (await exists(destination)) await unlink(destination);
      await rename(got.full, destination);
      saved.push(`${output} <- ${basename(got.name)}`);
    } catch (error) {
      skipped.push(`${output}: ${error.message}`);
    }
  }
}

ws.close();
await rm(tempDir, { recursive: true, force: true });
console.log(JSON.stringify({ saved, skipped }, null, 2));
