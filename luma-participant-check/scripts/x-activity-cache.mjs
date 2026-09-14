import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

export const ACTIVITY_CACHE_SCHEMA_VERSION = 1;
export const DEFAULT_ACTIVITY_CACHE_ROOT = path.join(
  homedir(),
  'Library',
  'Application Support',
  'luma-participant-check'
);

function fail(message) {
  throw new Error(message);
}

export function normalizeHandle(value) {
  const handle = String(value || '').replace(/^@/, '').trim().toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(handle)) return '';
  return handle;
}

export function candidateKey(candidate) {
  const apiId = String(candidate.apiId || candidate.api_id || '').trim();
  const handle = normalizeHandle(candidate.handle);
  if (!handle) fail('candidate handle is invalid');
  return `${apiId || '~'}:${handle}`;
}

export function resolveActivityCachePaths(root = DEFAULT_ACTIVITY_CACHE_ROOT) {
  const cacheRoot = path.resolve(root);
  return {
    root: cacheRoot,
    usersDir: path.join(cacheRoot, 'users'),
    scansDir: path.join(cacheRoot, 'scans')
  };
}

function safePathPart(value, label) {
  const part = String(value || '');
  if (!part || !/^[A-Za-z0-9_.-]+$/.test(part)) {
    fail(`${label} contains unsupported characters`);
  }
  return part;
}

export function userCachePath(root, restId) {
  return path.join(resolveActivityCachePaths(root).usersDir, `${safePathPart(restId, 'restId')}.json`);
}

export function scanStatePath(root, eventId) {
  return path.join(resolveActivityCachePaths(root).scansDir, `${safePathPart(eventId, 'eventId')}.json`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertString(value, name, { allowEmpty = false } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    fail(`${name} must be a string`);
  }
}

function assertNullableString(value, name) {
  if (value !== null && typeof value !== 'string') fail(`${name} must be a string or null`);
}

function assertBoolean(value, name) {
  if (typeof value !== 'boolean') fail(`${name} must be a boolean`);
}

function assertNullableNumber(value, name) {
  if (value !== null && (!Number.isFinite(value) || typeof value !== 'number')) {
    fail(`${name} must be a finite number or null`);
  }
}

function validateTweet(tweet, prefix = 'tweet') {
  if (!isRecord(tweet)) fail(`${prefix} must be an object`);
  assertString(tweet.id, `${prefix}.id`);
  assertString(tweet.author, `${prefix}.author`, { allowEmpty: true });
  assertString(tweet.createdAt, `${prefix}.createdAt`);
  if (!Number.isFinite(tweet.timestamp)) fail(`${prefix}.timestamp must be finite`);
  assertString(tweet.text, `${prefix}.text`, { allowEmpty: true });
  assertBoolean(tweet.isRepost, `${prefix}.isRepost`);
}

function validateCoverage(coverage) {
  if (!isRecord(coverage)) fail('user.coverage must be an object');
  assertNullableString(coverage.oldestObservedAt, 'user.coverage.oldestObservedAt');
  assertNullableString(coverage.newestObservedAt, 'user.coverage.newestObservedAt');
  assertBoolean(coverage.terminal, 'user.coverage.terminal');
  assertNullableString(coverage.resumeCursor, 'user.coverage.resumeCursor');
  assertNullableNumber(coverage.pageCount, 'user.coverage.pageCount');
}

export function validateUserRecord(user) {
  if (!isRecord(user)) fail('user cache must be an object');
  if (user.schemaVersion !== ACTIVITY_CACHE_SCHEMA_VERSION) fail('unsupported user cache schema');
  assertString(user.restId, 'user.restId');
  if (!/^\d+$/.test(user.restId)) fail('user.restId must contain only digits');
  assertString(user.handle, 'user.handle');
  if (!normalizeHandle(user.handle)) fail('user.handle is invalid');
  assertString(user.name, 'user.name', { allowEmpty: true });
  assertBoolean(user.protected, 'user.protected');
  assertNullableNumber(user.statusesCount, 'user.statusesCount');
  if (!Array.isArray(user.pinnedTweetIds)) fail('user.pinnedTweetIds must be an array');
  for (const id of user.pinnedTweetIds) assertString(String(id), 'user.pinnedTweetIds item');
  if (!Array.isArray(user.tweets)) fail('user.tweets must be an array');
  user.tweets.forEach((tweet, index) => validateTweet(tweet, `user.tweets[${index}]`));
  validateCoverage(user.coverage);
  assertNullableString(user.lastUserLookupAt, 'user.lastUserLookupAt');
  assertNullableString(user.lastTimelineFetchAt, 'user.lastTimelineFetchAt');
  assertString(user.updatedAt, 'user.updatedAt');
  return user;
}

function validateCandidate(candidate, prefix = 'candidate') {
  if (!isRecord(candidate)) fail(`${prefix} must be an object`);
  assertString(candidate.name, `${prefix}.name`, { allowEmpty: true });
  assertString(candidate.handle, `${prefix}.handle`);
  if (candidate.apiId !== undefined) assertString(candidate.apiId, `${prefix}.apiId`, { allowEmpty: true });
  if (candidate.xLink !== undefined) assertString(candidate.xLink, `${prefix}.xLink`, { allowEmpty: true });
  if (candidate.status !== undefined) assertString(candidate.status, `${prefix}.status`, { allowEmpty: true });
}

function validateRateLimit(value, prefix) {
  if (!isRecord(value)) fail(`${prefix} must be an object`);
  assertNullableNumber(value.limit, `${prefix}.limit`);
  assertNullableNumber(value.remaining, `${prefix}.remaining`);
  assertNullableNumber(value.reset, `${prefix}.reset`);
  assertNullableString(value.observedAt, `${prefix}.observedAt`);
}

export function validateScanState(state) {
  if (!isRecord(state)) fail('scan state must be an object');
  if (state.schemaVersion !== ACTIVITY_CACHE_SCHEMA_VERSION) fail('unsupported scan state schema');
  assertString(state.eventId, 'scan.eventId');
  assertString(state.cutoff, 'scan.cutoff');
  if (!Array.isArray(state.candidates)) fail('scan.candidates must be an array');
  state.candidates.forEach((candidate, index) => validateCandidate(candidate, `scan.candidates[${index}]`));
  if (!Array.isArray(state.results)) fail('scan.results must be an array');
  if (!isRecord(state.rateLimits)) fail('scan.rateLimits must be an object');
  for (const operation of ['UserByScreenName', 'UserTweets']) {
    validateRateLimit(state.rateLimits[operation], `scan.rateLimits.${operation}`);
  }
  if (state.lastBatch !== null && !isRecord(state.lastBatch)) fail('scan.lastBatch must be an object or null');
  assertNullableString(state.resumeAt, 'scan.resumeAt');
  assertNullableString(state.stopReason, 'scan.stopReason');
  assertString(state.updatedAt, 'scan.updatedAt');
  return state;
}

export function validateBatchResult(result) {
  if (!isRecord(result)) fail('batch result must be an object');
  if (result.schemaVersion !== ACTIVITY_CACHE_SCHEMA_VERSION) fail('unsupported batch result schema');
  assertString(result.batchId, 'batch.batchId');
  assertString(result.eventId, 'batch.eventId');
  assertString(result.cutoff, 'batch.cutoff');
  if (!Array.isArray(result.records)) fail('batch.records must be an array');
  if (!Array.isArray(result.statuses)) fail('batch.statuses must be an array');
  for (const status of result.statuses) {
    if (!isRecord(status)) fail('batch status must be an object');
    assertString(status.endpoint, 'batch status endpoint');
    if (!Number.isInteger(status.status)) fail('batch status status must be an integer');
    assertNullableNumber(status.remaining, 'batch status remaining');
    assertNullableNumber(status.limit, 'batch status limit');
    assertNullableNumber(status.reset, 'batch status reset');
  }
  assertBoolean(result.stopped, 'batch.stopped');
  assertNullableString(result.stopReason, 'batch.stopReason');
  return result;
}

export async function ensureActivityCacheDirectories(root = DEFAULT_ACTIVITY_CACHE_ROOT) {
  const paths = resolveActivityCachePaths(root);
  await mkdir(paths.usersDir, { recursive: true });
  await mkdir(paths.scansDir, { recursive: true });
  return paths;
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeJsonAtomically(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function readUserCache(root, restId) {
  const value = await readJsonIfExists(userCachePath(root, restId));
  return value ? validateUserRecord(value) : null;
}

export async function writeUserCache(root, user) {
  validateUserRecord(user);
  await writeJsonAtomically(userCachePath(root, user.restId), user);
  return userCachePath(root, user.restId);
}

export async function readScanState(root, eventId) {
  const value = await readJsonIfExists(scanStatePath(root, eventId));
  return value ? validateScanState(value) : null;
}

export async function writeScanState(root, state) {
  validateScanState(state);
  await writeJsonAtomically(scanStatePath(root, state.eventId), state);
  return scanStatePath(root, state.eventId);
}

export function createScanState({ eventId, cutoff, candidates, now = new Date().toISOString() }) {
  const state = {
    schemaVersion: ACTIVITY_CACHE_SCHEMA_VERSION,
    eventId: safePathPart(eventId, 'eventId'),
    cutoff,
    candidates: candidates.map((candidate) => ({ ...candidate })),
    results: [],
    rateLimits: {
      UserByScreenName: { limit: null, remaining: null, reset: null, observedAt: null },
      UserTweets: { limit: null, remaining: null, reset: null, observedAt: null }
    },
    lastBatch: null,
    resumeAt: null,
    stopReason: null,
    updatedAt: now
  };
  return validateScanState(state);
}

export function normalizeTweet(tweet) {
  const normalized = {
    id: String(tweet.id || ''),
    author: String(tweet.author || '').toLowerCase(),
    createdAt: String(tweet.createdAt || ''),
    timestamp: Number(tweet.timestamp),
    text: String(tweet.text || ''),
    isRepost: Boolean(tweet.isRepost)
  };
  validateTweet(normalized);
  return normalized;
}

export function mergeUserCache(existing, incoming, now = new Date().toISOString()) {
  validateUserRecord(incoming);
  const current = existing ? validateUserRecord(existing) : null;
  if (current && current.restId !== incoming.restId) fail('user cache restId mismatch');
  const tweets = new Map((current?.tweets || []).map((tweet) => [tweet.id, tweet]));
  for (const tweet of incoming.tweets) tweets.set(tweet.id, normalizeTweet(tweet));
  const allTweets = [...tweets.values()];
  const timestamps = allTweets.map((tweet) => tweet.timestamp).filter(Number.isFinite);
  const currentCoverage = current?.coverage || {};
  const incomingCoverage = incoming.coverage || {};
  const oldest = timestamps.length > 0 ? Math.min(...timestamps) : null;
  const newest = timestamps.length > 0 ? Math.max(...timestamps) : null;
  const oldestObservedAt = [currentCoverage.oldestObservedAt, incomingCoverage.oldestObservedAt]
    .filter(Boolean)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] || (oldest === null ? null : new Date(oldest).toISOString());
  const newestObservedAt = [currentCoverage.newestObservedAt, incomingCoverage.newestObservedAt]
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] || (newest === null ? null : new Date(newest).toISOString());
  const merged = {
    schemaVersion: ACTIVITY_CACHE_SCHEMA_VERSION,
    restId: incoming.restId,
    handle: incoming.handle || current?.handle || '',
    name: incoming.name ?? current?.name ?? '',
    protected: incoming.protected ?? current?.protected ?? false,
    statusesCount: incoming.statusesCount ?? current?.statusesCount ?? null,
    pinnedTweetIds: [...new Set([...(current?.pinnedTweetIds || []), ...(incoming.pinnedTweetIds || [])].map(String))],
    tweets: allTweets.sort((a, b) => b.timestamp - a.timestamp),
    coverage: {
      oldestObservedAt,
      newestObservedAt,
      terminal: Boolean(currentCoverage.terminal || incomingCoverage.terminal),
      resumeCursor: incomingCoverage.resumeCursor ?? currentCoverage.resumeCursor ?? null,
      pageCount: Number(currentCoverage.pageCount || 0) + Number(incomingCoverage.pageCount || 0)
    },
    lastUserLookupAt: incoming.lastUserLookupAt || current?.lastUserLookupAt || null,
    lastTimelineFetchAt: incoming.lastTimelineFetchAt || current?.lastTimelineFetchAt || null,
    updatedAt: now
  };
  if (merged.coverage.terminal) merged.coverage.resumeCursor = null;
  return validateUserRecord(merged);
}

export function isRateLimitBlocked(rateLimit, now = Date.now()) {
  return Number.isFinite(rateLimit?.remaining)
    && rateLimit.remaining <= 5
    && (!Number.isFinite(rateLimit.reset) || rateLimit.reset * 1000 > now);
}

export function rateLimitResumeAt(rateLimits, now = Date.now()) {
  const resets = Object.values(rateLimits || {})
    .filter((value) => isRateLimitBlocked(value, now))
    .filter((value) => Number.isFinite(value.reset))
    .map((value) => value.reset * 1000);
  return resets.length > 0 ? new Date(Math.max(...resets)).toISOString() : null;
}

export function classifyUserActivity(user, cutoff, keyword = 'astra') {
  if (!user) {
    return {
      classification: 'unresolved',
      complete: false,
      safeTerminal: false,
      recentOwnPostCount: 0,
      astraPostCount: 0,
      evidencePosts: []
    };
  }
  if (user.protected) {
    return {
      classification: 'protected',
      complete: true,
      safeTerminal: true,
      recentOwnPostCount: 0,
      astraPostCount: 0,
      evidencePosts: []
    };
  }
  if (user.statusesCount === 0) {
    return {
      classification: 'zero_posts',
      complete: true,
      safeTerminal: true,
      recentOwnPostCount: 0,
      astraPostCount: 0,
      evidencePosts: []
    };
  }
  const cutoffTimestamp = Date.parse(cutoff);
  const handle = normalizeHandle(user.handle);
  const pinned = new Set((user.pinnedTweetIds || []).map(String));
  const own = (user.tweets || [])
    .filter((tweet) => tweet.author === handle && Number.isFinite(tweet.timestamp))
    .filter((tweet) => !tweet.isRepost && tweet.text.length > 0 && !pinned.has(tweet.id))
    .filter((tweet) => tweet.timestamp >= cutoffTimestamp)
    .sort((a, b) => b.timestamp - a.timestamp);
  const matcher = new RegExp(String(keyword || 'astra'), 'i');
  const evidencePosts = own
    .filter((tweet) => matcher.test(tweet.text))
    .slice(0, 3)
    .map((tweet) => ({
      id: tweet.id,
      createdAt: tweet.createdAt,
      text: tweet.text,
      url: `https://x.com/${tweet.author || handle}/status/${tweet.id}`
    }));
  const astraPostCount = own.filter((tweet) => matcher.test(tweet.text)).length;
  const covered = user.coverage.terminal
    || (user.coverage.oldestObservedAt && Date.parse(user.coverage.oldestObservedAt) <= cutoffTimestamp);
  const complete = astraPostCount >= 3 || Boolean(covered);
  return {
    classification: astraPostCount >= 3 ? 'astra_3_or_more' : complete ? 'fewer_than_3_astra' : 'incomplete',
    complete,
    safeTerminal: Boolean(covered) || astraPostCount >= 3,
    recentOwnPostCount: own.length,
    astraPostCount,
    evidencePosts
  };
}
