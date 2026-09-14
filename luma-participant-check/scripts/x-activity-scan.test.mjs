import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  candidateKey,
  createScanState,
  readScanState,
  writeScanState,
  writeUserCache
} from './x-activity-cache.mjs';

const runFile = promisify(execFile);
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function runJson(scriptName, args) {
  const result = await runFile(process.execPath, [path.join(scriptsDir, scriptName), ...args], { encoding: 'utf8' });
  return JSON.parse(result.stdout);
}

function userRecord({ restId = '101', handle = 'cached', coverage = {}, ...overrides } = {}) {
  return {
    schemaVersion: 1,
    restId,
    handle,
    name: handle,
    protected: false,
    statusesCount: 10,
    pinnedTweetIds: [],
    tweets: [],
    coverage: {
      oldestObservedAt: '2026-09-01T00:00:00.000Z',
      newestObservedAt: '2026-09-14T00:00:00.000Z',
      terminal: true,
      resumeCursor: null,
      pageCount: 1,
      ...coverage
    },
    lastUserLookupAt: '2026-09-14T00:00:00.000Z',
    lastTimelineFetchAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
    ...overrides
  };
}

test('planner keeps completed cache hits local and schedules only current pending misses', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'luma-activity-plan-'));
  try {
    const candidatePath = path.join(root, 'candidates.json');
    const candidates = [
      { apiId: 'guest-1', name: 'Cached', handle: 'cached', xLink: 'https://x.com/cached', status: 'Pending Approval' },
      { apiId: 'guest-2', name: 'New', handle: 'new_user', xLink: 'https://x.com/new_user', status: 'Pending Approval' },
      { apiId: 'guest-3', name: 'Approved', handle: 'approved', xLink: 'https://x.com/approved', status: 'Approved' }
    ];
    await writeJson(candidatePath, { candidates });
    await writeUserCache(root, userRecord());
    const state = createScanState({ eventId: 'evt-cache', cutoff: '2026-09-07T00:00:00.000Z', candidates: candidates.slice(0, 2) });
    state.results = [{ candidateKey: candidateKey(candidates[0]), userRestId: '101', complete: false }];
    await writeScanState(root, state);

    const plan = await runJson('plan-x-activity-scan.mjs', [
      candidatePath,
      '--event-id', 'evt-cache',
      '--cutoff', '2026-09-07T00:00:00.000Z',
      '--cache-root', root,
      '--max-candidates', '5'
    ]);

    assert.equal(plan.localResults.length, 1);
    assert.equal(plan.localResults[0].candidate.handle, 'cached');
    assert.equal(plan.localResults[0].classification, 'fewer_than_3_astra');
    assert.equal(plan.nextBatch.length, 1);
    assert.equal(plan.nextBatch[0].candidate.handle, 'new_user');
    assert.equal(plan.nextBatch[0].userLookupNeeded, true);
    assert.equal(plan.candidates.some((candidate) => candidate.handle === 'approved'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('planner resumes a saved cursor and stops before the rate reserve', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'luma-activity-resume-'));
  try {
    const candidatePath = path.join(root, 'candidates.json');
    const candidate = { apiId: 'guest-4', name: 'Resumed', handle: 'resumed', xLink: 'https://x.com/resumed', status: 'Pending Approval' };
    await writeJson(candidatePath, [candidate]);
    await writeUserCache(root, userRecord({ restId: '202', handle: 'resumed', coverage: { terminal: false, resumeCursor: 'cursor-1', oldestObservedAt: '2026-09-14T00:00:00.000Z' } }));
    const state = createScanState({ eventId: 'evt-resume', cutoff: '2026-09-07T00:00:00.000Z', candidates: [candidate] });
    state.results = [{ candidateKey: candidateKey(candidate), userRestId: '202', complete: false }];
    await writeScanState(root, state);

    const firstPlan = await runJson('plan-x-activity-scan.mjs', [
      candidatePath,
      '--event-id', 'evt-resume',
      '--cutoff', '2026-09-07T00:00:00.000Z',
      '--cache-root', root
    ]);
    assert.equal(firstPlan.nextBatch[0].resumeCursor, 'cursor-1');

    const savedState = await readScanState(root, 'evt-resume');
    const reset = Math.floor(Date.now() / 1000) + 3600;
    savedState.rateLimits.UserTweets = { limit: 15, remaining: 5, reset, observedAt: new Date().toISOString() };
    await writeScanState(root, savedState);
    const stoppedPlan = await runJson('plan-x-activity-scan.mjs', [
      candidatePath,
      '--event-id', 'evt-resume',
      '--cutoff', '2026-09-07T00:00:00.000Z',
      '--cache-root', root
    ]);
    assert.equal(stoppedPlan.nextBatch.length, 0);
    assert.equal(stoppedPlan.stopped, true);
    assert.equal(stoppedPlan.stopReason, 'preemptive_rate_limit_stop');
    assert.equal(stoppedPlan.resumeAt, new Date(reset * 1000).toISOString());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('planner refreshes stale cache data for a moving cutoff', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'luma-activity-freshness-'));
  try {
    const candidatePath = path.join(root, 'candidates.json');
    const candidate = { apiId: 'guest-7', name: 'Stale', handle: 'stale_user', xLink: 'https://x.com/stale_user', status: 'Pending Approval' };
    await writeJson(candidatePath, [candidate]);
    await writeUserCache(root, userRecord({
      restId: '204',
      handle: 'stale_user',
      coverage: { oldestObservedAt: '2020-01-01T00:00:00.000Z', newestObservedAt: '2020-01-01T00:00:00.000Z' },
      lastUserLookupAt: '2020-01-01T00:00:00.000Z',
      lastTimelineFetchAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z'
    }));
    const state = createScanState({ eventId: 'evt-freshness', cutoff: '2026-09-07T00:00:00.000Z', candidates: [candidate] });
    state.results = [{ candidateKey: candidateKey(candidate), userRestId: '204', complete: true }];
    await writeScanState(root, state);

    const plan = await runJson('plan-x-activity-scan.mjs', [
      candidatePath,
      '--event-id', 'evt-freshness',
      '--cutoff', '2026-09-07T00:00:00.000Z',
      '--freshness-minutes', '1440',
      '--cache-root', root
    ]);
    assert.equal(plan.nextBatch.length, 1);
    assert.equal(plan.nextBatch[0].candidate.handle, 'stale_user');
    assert.equal(plan.nextBatch[0].userLookupNeeded, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('planner stops safely when a low rate-limit value has no reset metadata', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'luma-activity-rate-metadata-'));
  try {
    const candidatePath = path.join(root, 'candidates.json');
    const candidate = { apiId: 'guest-5', name: 'Resumed', handle: 'resumed', xLink: 'https://x.com/resumed', status: 'Pending Approval' };
    await writeJson(candidatePath, [candidate]);
    await writeUserCache(root, userRecord({ restId: '203', handle: 'resumed', coverage: { terminal: false, resumeCursor: 'cursor-2', oldestObservedAt: '2026-09-14T00:00:00.000Z' } }));
    const state = createScanState({ eventId: 'evt-rate-metadata', cutoff: '2026-09-07T00:00:00.000Z', candidates: [candidate] });
    state.results = [{ candidateKey: candidateKey(candidate), userRestId: '203', complete: false }];
    state.rateLimits.UserTweets = { limit: 15, remaining: 5, reset: null, observedAt: new Date().toISOString() };
    await writeScanState(root, state);

    const plan = await runJson('plan-x-activity-scan.mjs', [
      candidatePath,
      '--event-id', 'evt-rate-metadata',
      '--cutoff', '2026-09-07T00:00:00.000Z',
      '--cache-root', root
    ]);
    assert.equal(plan.stopped, true);
    assert.equal(plan.stopReason, 'rate_limit_metadata_incomplete');
    assert.equal(plan.resumeAt, null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('activity evaluator generator emits a parseable internal API function', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'luma-activity-eval-'));
  try {
    const planPath = path.join(root, 'plan.json');
    await writeJson(planPath, {
      batchId: 'batch-1',
      eventId: 'evt-eval',
      cutoff: '2026-09-07T00:00:00.000Z',
      keyword: 'astra',
      nextBatch: [],
      requestBudget: { userByScreenName: 0, userTweets: 0, maxPagesPerCandidate: 3 }
    });
    const result = await runFile(process.execPath, [path.join(scriptsDir, 'build-x-activity-eval.mjs'), planPath], { encoding: 'utf8' });
    const evaluateFactory = new Function(`return (${result.stdout});`);
    assert.equal(typeof evaluateFactory(), 'function');
    assert.match(result.stdout, /UserTweets/);
    assert.match(result.stdout, /cachedTweetIds/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Luma extractor preserves stable api_id values', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'luma-activity-extractor-'));
  try {
    const inputPath = path.join(root, 'luma.json');
    await writeJson(inputPath, [{
      api_id: 'guest-42',
      name: 'Guest',
      approval_status: 'Pending Approval',
      registration_answers: [{ label: 'What is your X (Twitter) handle?', value: 'example', question_type: 'twitter' }]
    }]);
    const output = await runJson('extract-luma-api-candidates.mjs', [inputPath]);
    assert.equal(output.pending[0].apiId, 'guest-42');
    assert.equal(output.candidates[0].apiId, 'guest-42');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
