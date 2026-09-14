import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const inputPath = args[0];

if (!inputPath) {
  console.error('Usage: node extract-luma-api-candidates.mjs <luma-api-response.json> [--x-question-id <id>]');
  process.exit(2);
}

const optionValue = name => {
  const index = args.indexOf(name);
  if (index === -1) return '';
  return args[index + 1] || '';
};

const xQuestionId = optionValue('--x-question-id');
const payload = JSON.parse(readFileSync(inputPath, 'utf8'));
const entries = Array.isArray(payload) ? payload : payload.entries || payload.guests || payload.results || [];
const blockedHandles = new Set(['i', 'intent', 'share', 'home', 'search', 'notifications', 'messages', 'settings', 'compose', 'explore']);

const cleanHandle = value => {
  const handle = String(value || '').replace(/^@/, '').trim();
  if (!handle) return '';
  if (blockedHandles.has(handle.toLowerCase())) return '';
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return '';
  return handle;
};

const normalizeHandle = raw => {
  let value = String(raw || '').trim();
  if (!value) return '';
  value = value.replace(/^https:\/([^/])/, (_, char) => `https://${char}`);
  value = value.replace(/^http:\/([^/])/, (_, char) => `http://${char}`);
  const repairedMatch = value.match(/(?:^|[^A-Za-z0-9_.-])(?:https?:\/*)?(?:www\.)?(?:x|twitter)\.com\/+(@?[A-Za-z0-9_]{1,15})(?=$|[/?#\s])/i);
  const repaired = cleanHandle(repairedMatch && repairedMatch[1]);
  if (repaired) return repaired;
  try {
    const url = new URL(value);
    if (!['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'].includes(url.hostname.toLowerCase())) return '';
    return cleanHandle(url.pathname.split('/').filter(Boolean)[0] || '');
  } catch {
    return cleanHandle(value);
  }
};

const isXQuestion = answer => {
  const label = String(answer.label || '').toLowerCase();
  if (xQuestionId && answer.question_id === xQuestionId) return true;
  if (String(answer.question_type || '').toLowerCase() === 'twitter') return true;
  if (label.includes('あなたの x のプロフィールリンク')) return true;
  if (label.includes('x のプロフィールリンク')) return true;
  if (label.includes('x のハンドル')) return true;
  if (label.includes('x handle')) return true;
  if (label.includes('twitter handle')) return true;
  if (label.includes('x profile')) return true;
  if (label.includes('twitter profile')) return true;
  return false;
};

const extractXAnswer = guest => {
  const answers = Array.isArray(guest.registration_answers) ? guest.registration_answers : [];
  const exact = answers.find(isXQuestion);
  if (exact) return exact.value ?? exact.answer ?? '';
  const linkAnswer = answers.find(answer => {
    const value = String(answer.value ?? answer.answer ?? '');
    return /(?:x|twitter)\.com\//i.test(value);
  });
  return linkAnswer ? linkAnswer.value ?? linkAnswer.answer ?? '' : '';
};

const statusCounts = {};
const pending = [];
const candidates = [];
const invalidX = [];

for (const guest of entries) {
  const status = String(guest.approval_status || guest.status || '');
  statusCounts[status || 'unknown'] = (statusCounts[status || 'unknown'] || 0) + 1;
  if (status.toLowerCase() !== 'pending_approval' && status !== 'Pending Approval') continue;
  const raw = extractXAnswer(guest);
  const handle = normalizeHandle(raw);
  const apiId = String(guest.api_id || guest.apiId || guest.id || guest.guest_id || '').trim();
  const row = {apiId, name: String(guest.name || ''), handle, xLink: String(raw || ''), status};
  pending.push(row);
  if (handle) candidates.push(row);
  else invalidX.push(row);
}

process.stdout.write(JSON.stringify({
  totalRows: entries.length,
  statusCounts,
  pendingCount: pending.length,
  candidateCount: candidates.length,
  invalidXCount: invalidX.length,
  candidates,
  invalidX,
  pending
}, null, 2));
