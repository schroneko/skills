import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  candidateKey,
  classifyUserActivity,
  createScanState,
  ensureActivityCacheDirectories,
  isRateLimitBlocked,
  rateLimitResumeAt,
  readScanState,
  readUserCache,
  writeJsonAtomically,
  writeScanState
} from './x-activity-cache.mjs';

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = [...argv];
  const candidatePath = args.shift();
  if (!candidatePath) fail('usage: node plan-x-activity-scan.mjs <candidates.json> --event-id <id> --cutoff <iso> [options]');
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
  return { candidatePath, options };
}

function requireOption(options, key) {
  const value = options[key];
  if (!value) fail(`--${key} is required`);
  return value;
}

function parseInteger(value, name, defaultValue) {
  if (value === undefined) return defaultValue;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) fail(`${name} must be a non-negative integer`);
  return parsed;
}

function normalizeStatus(value) {
  return String(value || '').toLowerCase().replace(/[\s-]+/g, '_');
}

function isPending(candidate) {
  const status = normalizeStatus(candidate.status || candidate.approval_status);
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

function readCandidates(payload) {
  const values = Array.isArray(payload) ? payload : payload.candidates || [];
  return values
    .filter(isPending)
    .map(normalizeCandidate)
    .filter(Boolean);
}

function parseCutoff(value) {
  if (!Number.isFinite(Date.parse(value))) fail('--cutoff must be an ISO date');
  return new Date(value).toISOString();
}

function isStale(value, freshnessMinutes, now) {
  if (freshnessMinutes === null) return false;
  const timestamp = Date.parse(value || '');
  return !Number.isFinite(timestamp) || now - timestamp >= freshnessMinutes * 60 * 1000;
}

function userForEval(user) {
  if (!user) return null;
  return {
    restId: user.restId,
    handle: user.handle,
    name: user.name,
    protected: user.protected,
    statusesCount: user.statusesCount,
    pinnedTweetIds: user.pinnedTweetIds,
    coverage: user.coverage
  };
}

function buildResult(candidate, user, activity) {
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
    timeline: user ? { ...user.coverage } : null
  };
}

function emptyRateLimits() {
  return {
    UserByScreenName: { limit: null, remaining: null, reset: null, observedAt: null },
    UserTweets: { limit: null, remaining: null, reset: null, observedAt: null }
  };
}

function availableRequests(rateLimit, fallback, now) {
  if (isRateLimitBlocked(rateLimit, now)) return 0;
  if (Number.isFinite(rateLimit?.remaining) && Number.isFinite(rateLimit?.reset) && rateLimit.reset * 1000 > now) {
    return Math.max(0, rateLimit.remaining - 5);
  }
  return fallback;
}

async function main() {
  const { candidatePath, options } = parseArgs(process.argv.slice(2));
  const eventId = requireOption(options, 'event-id');
  const cutoff = parseCutoff(requireOption(options, 'cutoff'));
  const cacheRoot = options['cache-root'];
  const maxCandidates = parseInteger(options['max-candidates'], '--max-candidates', 5);
  const freshnessMinutes = options['freshness-minutes'] === undefined
    ? null
    : parseInteger(options['freshness-minutes'], '--freshness-minutes', 0);
  const keyword = String(options.keyword || 'astra');
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const payload = JSON.parse(await readFile(candidatePath, 'utf8'));
  const candidates = readCandidates(payload);
  if (candidates.length === 0) fail('no Pending Approval candidates with valid handles were found');
  await ensureActivityCacheDirectories(cacheRoot);

  let state = await readScanState(cacheRoot, eventId);
  if (!state || state.cutoff !== cutoff) {
    state = createScanState({ eventId, cutoff, candidates, now: nowIso });
  } else {
    state.candidates = candidates;
    state.updatedAt = nowIso;
  }

  const previousResults = new Map((state.results || []).map((result) => [result.candidateKey, result]));
  const localResults = [];
  const requestCandidates = [];
  for (const candidate of candidates) {
    const key = candidateKey(candidate);
    const previous = previousResults.get(key);
    const restId = previous?.userRestId || '';
    const user = restId ? await readUserCache(cacheRoot, restId) : null;
    const activity = user ? classifyUserActivity(user, cutoff, keyword) : null;
    const coverageComplete = Boolean(activity?.safeTerminal);
    const criterionSatisfied = Boolean(activity && (
      activity.astraPostCount >= 3
      || activity.classification === 'protected'
      || activity.classification === 'zero_posts'
    ));
    const userLookupNeeded = !user
      || user.handle.toLowerCase() !== candidate.handle.toLowerCase()
      || isStale(user.lastUserLookupAt, freshnessMinutes, now);
    const timelineRefreshNeeded = !criterionSatisfied && (
      !user
      || Boolean(user.coverage.resumeCursor)
      || !coverageComplete
      || isStale(user.lastTimelineFetchAt, freshnessMinutes, now)
    );
    if (user && !userLookupNeeded && !timelineRefreshNeeded) {
      localResults.push(buildResult(candidate, user, activity));
      continue;
    }
    requestCandidates.push({
      candidate,
      candidateKey: key,
      userLookupNeeded,
      cachedUser: userForEval(user),
      cachedTweetIds: user ? user.tweets.map((tweet) => tweet.id) : [],
      resumeCursor: user?.coverage.resumeCursor || null,
      cachedSummary: activity || null
    });
  }

  const rateLimits = state.rateLimits || emptyRateLimits();
  const userBudget = availableRequests(rateLimits.UserByScreenName, maxCandidates, now);
  const tweetBudget = availableRequests(rateLimits.UserTweets, maxCandidates * 3, now);
  const rateLimitBlocked = Object.values(rateLimits).some((rateLimit) => isRateLimitBlocked(rateLimit, now));
  let remainingUserBudget = userBudget;
  let remainingTweetBudget = tweetBudget;
  const nextBatch = [];
  for (const item of requestCandidates) {
    if (nextBatch.length >= maxCandidates) break;
    if (item.userLookupNeeded && remainingUserBudget <= 0) break;
    if (remainingTweetBudget <= 0) break;
    nextBatch.push(item);
    if (item.userLookupNeeded) remainingUserBudget -= 1;
    remainingTweetBudget -= 1;
  }

  const batchId = randomUUID();
  const blockedResumeAt = rateLimitResumeAt(rateLimits, now);
  const resultByKey = new Map(localResults.map((result) => [result.candidateKey, result]));
  state.results = candidates
    .map((candidate) => resultByKey.get(candidateKey(candidate)) || previousResults.get(candidateKey(candidate)))
    .filter(Boolean);
  state.lastBatch = nextBatch.length > 0
    ? { batchId, candidateKeys: nextBatch.map((item) => item.candidateKey), status: 'planned', plannedAt: nowIso }
    : state.lastBatch;
  state.resumeAt = blockedResumeAt;
  state.stopReason = rateLimitBlocked
    ? blockedResumeAt ? 'preemptive_rate_limit_stop' : 'rate_limit_metadata_incomplete'
    : null;
  state.updatedAt = nowIso;
  await writeScanState(cacheRoot, state);

  const output = {
    schemaVersion: 1,
    batchId,
    eventId,
    cutoff,
    keyword,
    generatedAt: nowIso,
    candidates,
    localResults: state.results,
    nextBatch,
    requestBudget: {
      userByScreenName: Math.max(0, userBudget - remainingUserBudget),
      userTweets: Math.min(tweetBudget, nextBatch.length * 3),
      maxPagesPerCandidate: 3
    },
    rateLimits,
    resumeAt: blockedResumeAt,
    complete: nextBatch.length === 0 && !rateLimitBlocked && state.results.every((result) => result.complete === true),
    stopped: rateLimitBlocked,
    stopReason: state.stopReason
  };
  if (options.output) {
    await writeJsonAtomically(options.output, output);
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

await main();
