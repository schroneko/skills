import { readFileSync } from 'node:fs';

const [candidatePath] = process.argv.slice(2);

if (!candidatePath) {
  console.error('Usage: node build-x-guest-check-eval.mjs <candidates.json>');
  process.exit(2);
}

const candidates = JSON.parse(readFileSync(candidatePath, 'utf8')).map(item => ({
  name: String(item.name || ''),
  handle: String(item.handle || '').replace(/^@/, '')
})).filter(item => /^[A-Za-z0-9_]{1,15}$/.test(item.handle));

const fn = `async () => {
  const candidates = ${JSON.stringify(candidates)};
  const bearer = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
  const ct0 = (document.cookie.match(/(?:^|; )ct0=([^;]+)/) || [])[1] || '';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const chunks = (items, size) => {
    const out = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
  };
  const headers = {
    authorization: bearer,
    'x-csrf-token': ct0,
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-active-user': 'yes',
    'x-twitter-client-language': document.documentElement.lang || 'ja',
    accept: 'application/json'
  };
  const requestJson = async url => {
    const res = await fetch(url, {credentials: 'include', headers});
    const text = await res.text();
    const status = {status: res.status, remaining: res.headers.get('x-rate-limit-remaining'), limit: res.headers.get('x-rate-limit-limit'), reset: res.headers.get('x-rate-limit-reset'), url: url.replace(/screen_name=[^&]+/, 'screen_name=<redacted>')};
    if (res.status === 429) return {ok: false, rateLimited: true, status, body: text.slice(0, 500)};
    if (!res.ok) return {ok: false, status, body: text.slice(0, 500)};
    return {ok: true, status, data: JSON.parse(text)};
  };
  const relationshipByHandle = new Map();
  const statuses = [];
  for (const chunk of chunks(candidates, 50)) {
    const url = 'https://x.com/i/api/1.1/friendships/lookup.json?screen_name=' + encodeURIComponent(chunk.map(item => item.handle).join(','));
    const result = await requestJson(url);
    statuses.push({...result.status, endpoint: 'friendships/lookup', requested: chunk.length});
    if (!result.ok) return {ok: false, stage: 'friendships/lookup', statuses, rateLimited: !!result.rateLimited, body: result.body};
    for (const row of result.data) relationshipByHandle.set(String(row.screen_name || '').toLowerCase(), row.connections || []);
    await sleep(300);
  }
  const rows = candidates.map(item => {
    const key = item.handle.toLowerCase();
    const connections = relationshipByHandle.has(key) ? relationshipByHandle.get(key) : null;
    const followsOrganizer = Array.isArray(connections) && connections.includes('followed_by');
    let reason = '';
    if (!connections) reason = 'unknown';
    else if (!followsOrganizer) reason = 'not_following';
    else reason = 'ok';
    return {...item, connections, followsOrganizer, reason};
  });
  return {
    ok: true,
    total: rows.length,
    okCount: rows.filter(row => row.reason === 'ok').length,
    notFollowingCount: rows.filter(row => row.reason === 'not_following').length,
    unknownCount: rows.filter(row => row.reason === 'unknown').length,
    notFollowing: rows.filter(row => row.reason === 'not_following'),
    unknown: rows.filter(row => row.reason === 'unknown'),
    rows,
    statuses
  };
}`;

process.stdout.write(fn);
