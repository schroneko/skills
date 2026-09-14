import { readFile } from 'node:fs/promises';
import {
  candidateKey,
  classifyUserActivity,
  ensureActivityCacheDirectories,
  mergeUserCache,
  normalizeTweet,
  readScanState,
  readUserCache,
  rateLimitResumeAt,
  validateBatchResult,
  writeJsonAtomically,
  writeScanState,
  writeUserCache
} from './x-activity-cache.mjs';

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = [...argv];
  const batchPath = args.shift();
  if (!batchPath) fail('usage: node merge-x-activity-scan.mjs <batch-result.json> --event-id <id> [options]');
  const options = {};
  while (args.length > 0) {
    const token = args.shift();
    if (!token.startsWith('--')) fail(`unexpected argument: ${token}`);
    const key = token.slice(2);
    if (Object.hasOwn(options, key)) fail(`duplicate option: --${key}`);
    const value = args.shift();
    if (value === undefined || value.startsWith('--')) fail(`missing option value: --${key}`);
    options[key] = value;
  }
  return { batchPath, options };
}

function requireOption(options, key) {
  const value = options[key];
  if (!value) fail(`--${key} is required`);
  return value;
}

function normalizeStatus(value) {
  return String(value || '').toLowerCase().replace(/[\s-]+/g, '_');
}

function isPending(candidate) {
  const status = normalizeStatus(candidate.status);
  return status === 'pending_approval' || status === 'pendingapproval';
}

function normalizeCandidate(value) {
  const candidate = {
    apiId: String(value.apiId || value.api_id || '').trim(),
    name: String(value.name || ''),
    handle: String(value.handle || '').replace(/^@/, '').trim(),
    xLink: String(value.xLink || value.x_link || ''),
    status: String(value.status || value.approval_status || '')
  };
  if (!/^[A-Za-z0-9_]{1,15}$/.test(candidate.handle)) return null;
  return candidate;
}

function finiteNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRateLimit(status, observedAt) {
  return {
    limit: Number.isFinite(status.limit) ? status.limit : null,
    remaining: Number.isFinite(status.remaining) ? status.remaining : null,
    reset: Number.isFinite(status.reset) ? status.reset : null,
    observedAt
  };
}

function updateRateLimits(rateLimits, statuses, observedAt) {
  const updated = {
    UserByScreenName: { ...rateLimits.UserByScreenName },
    UserTweets: { ...rateLimits.UserTweets }
  };
  for (const status of statuses) {
    if (Object.hasOwn(updated, status.endpoint)) {
      updated[status.endpoint] = normalizeRateLimit(status, observedAt);
    }
  }
  return updated;
}

function buildIncomingUser(record, now) {
  if (!record.user || !/^\d+$/.test(String(record.user.restId || ''))) return null;
  const timeline = record.timeline || {};
  return {
    schemaVersion: 1,
    restId: String(record.user.restId),
    handle: String(record.user.handle || record.candidate.handle || '').toLowerCase(),
    name: String(record.user.name || ''),
    protected: Boolean(record.user.protected),
    statusesCount: finiteNumberOrNull(record.user.statusesCount),
    pinnedTweetIds: Array.isArray(record.user.pinnedTweetIds) ? record.user.pinnedTweetIds.map(String) : [],
    tweets: (record.tweets || []).map(normalizeTweet),
    coverage: {
      oldestObservedAt: timeline.oldestObservedAt || null,
      newestObservedAt: timeline.newestObservedAt || null,
      terminal: Boolean(timeline.terminal),
      resumeCursor: timeline.resumeCursor || null,
      pageCount: finiteNumberOrNull(timeline.pageCount) ?? 0
    },
    lastUserLookupAt: record.userLookupAttempted ? now : null,
    lastTimelineFetchAt: timeline.lastFetchedAt || null,
    updatedAt: now
  };
}

function buildResult(candidate, user, activity, timeline) {
  return {
    candidateKey: candidateKey(candidate),
    candidate,
    userRestId: user?.restId || null,
    classification: activity.classification,
    complete: activity.complete,
    safeTerminal: activity.safeTerminal,
    recentOwnPostCount: activity.recentOwnPostCount,
    astraPostCount: activity.astraPostCount,
    evidencePosts: activity.evidencePosts,
    timeline: timeline || (user ? { ...user.coverage } : null)
  };
}

function unresolvedResult(candidate, batchRecord) {
  const safe = batchRecord?.classification === 'unresolved';
  return {
    classification: safe ? 'unresolved' : batchRecord?.classification || 'incomplete',
    complete: safe,
    safeTerminal: safe,
    recentOwnPostCount: 0,
    astraPostCount: 0,
    evidencePosts: []
  };
}

async function main() {
  const { batchPath, options } = parseArgs(process.argv.slice(2));
  const eventId = requireOption(options, 'event-id');
  const cacheRoot = options['cache-root'];
  const batch = validateBatchResult(JSON.parse(await readFile(batchPath, 'utf8')));
  if (batch.eventId !== eventId) fail('batch event id does not match --event-id');
  await ensureActivityCacheDirectories(cacheRoot);
  const state = await readScanState(cacheRoot, eventId);
  if (!state) fail(`scan state was not found for event ${eventId}`);
  if (state.cutoff !== batch.cutoff) fail('batch cutoff does not match scan state');
  const now = new Date().toISOString();
  const batchByKey = new Map();
  for (const record of batch.records) {
    if (!record || typeof record !== 'object') fail('batch record must be an object');
    if (!record.candidateKey || !record.candidate) fail('batch record identity is missing');
    const recordCandidate = normalizeCandidate(record.candidate);
    if (!recordCandidate || candidateKey(recordCandidate) !== record.candidateKey) fail('batch record identity does not match candidate');
    if (batchByKey.has(record.candidateKey)) fail(`duplicate batch record: ${record.candidateKey}`);
    batchByKey.set(record.candidateKey, record);
    const incoming = buildIncomingUser(record, now);
    if (incoming) {
      const existing = await readUserCache(cacheRoot, incoming.restId);
      await writeUserCache(cacheRoot, mergeUserCache(existing, incoming, now));
    }
  }

  const previousResults = new Map((state.results || []).map((result) => [result.candidateKey, result]));
  const results = [];
  for (const candidate of state.candidates.filter(isPending).map(normalizeCandidate).filter(Boolean)) {
    const key = candidateKey(candidate);
    const batchRecord = batchByKey.get(key);
    const previous = previousResults.get(key);
    const restId = batchRecord?.user?.restId || previous?.userRestId || '';
    const user = restId ? await readUserCache(cacheRoot, restId) : null;
    if (user) {
      const activity = classifyUserActivity(user, state.cutoff, batch.keyword || 'astra');
      results.push(buildResult(candidate, user, activity, user.coverage));
      continue;
    }
    if (batchRecord) {
      results.push(buildResult(candidate, null, unresolvedResult(candidate, batchRecord), batchRecord.timeline));
      continue;
    }
    if (previous) results.push({ ...previous, candidate });
  }

  state.results = results;
  state.rateLimits = updateRateLimits(state.rateLimits, batch.statuses, now);
  state.lastBatch = {
    batchId: batch.batchId,
    candidateKeys: batch.records.map((record) => record.candidateKey),
    status: 'merged',
    checked: batch.checked,
    stopped: batch.stopped,
    stopReason: batch.stopReason,
    mergedAt: now
  };
  state.resumeAt = batch.stopped ? rateLimitResumeAt(state.rateLimits) : null;
  state.stopReason = batch.stopped ? batch.stopReason : null;
  state.updatedAt = now;
  await writeScanState(cacheRoot, state);

  const pending = results.filter((result) => result.complete !== true);
  const complete = results.filter((result) => result.complete === true);
  const report = {
    schemaVersion: 1,
    eventId,
    cutoff: state.cutoff,
    keyword: batch.keyword || 'astra',
    complete: pending.length === 0 && state.candidates.length === results.length,
    checked: results.length,
    completeCount: complete.length,
    pendingCount: pending.length,
    stopped: batch.stopped,
    stopReason: batch.stopReason,
    resumeAt: state.resumeAt,
    rateLimits: state.rateLimits,
    results
  };
  if (options.output) await writeJsonAtomically(options.output, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

await main();
