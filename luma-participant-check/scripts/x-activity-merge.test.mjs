import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  candidateKey,
  createScanState,
  readUserCache,
  writeScanState
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

function tweet(id, createdAt, text, { author = 'example', isRepost = false } = {}) {
  return {
    id,
    author,
    createdAt,
    timestamp: Date.parse(createdAt),
    text,
    isRepost
  };
}

function batchRecord(candidate, tweets, timeline, { userLookupAttempted = true } = {}) {
  return {
    candidateKey: candidateKey(candidate),
    candidate,
    user: {
      restId: '303',
      handle: 'example',
      name: 'Example',
      protected: false,
      statusesCount: 20,
      pinnedTweetIds: ['3']
    },
    userLookupAttempted,
    userLookupStatus: null,
    tweets,
    classification: 'incomplete',
    complete: false,
    safeTerminal: false,
    evidencePosts: [],
    timeline
  };
}

function batch(batchId, eventId, cutoff, record, stopped = false) {
  return {
    schemaVersion: 1,
    batchId,
    eventId,
    cutoff,
    keyword: 'astra',
    records: [record],
    statuses: [
      { endpoint: 'UserByScreenName', status: 200, remaining: 20, limit: 50, reset: null },
      { endpoint: 'UserTweets', status: 200, remaining: 19, limit: 50, reset: null }
    ],
    checked: 1,
    stopped,
    stopReason: stopped ? 'preemptive_rate_limit_stop' : null
  };
}

test('merge persists partial timeline data and completes after a later cursor batch', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'luma-activity-merge-'));
  try {
    const eventId = 'evt-merge';
    const cutoff = '2026-09-07T00:00:00.000Z';
    const candidate = { apiId: 'guest-6', name: 'Example', handle: 'example', xLink: 'https://x.com/example', status: 'Pending Approval' };
    const state = createScanState({ eventId, cutoff, candidates: [candidate] });
    await writeScanState(root, state);

    const firstBatchPath = path.join(root, 'batch-1.json');
    await writeJson(firstBatchPath, batch(
      'batch-1',
      eventId,
      cutoff,
      batchRecord(candidate, [
        tweet('1', '2026-09-14T00:00:00.000Z', 'Astra one'),
        tweet('2', '2026-09-13T00:00:00.000Z', 'Astra two'),
        tweet('3', '2026-09-12T00:00:00.000Z', 'Astra pinned'),
        tweet('4', '2026-09-11T00:00:00.000Z', 'RT @someone Astra repost', { isRepost: true }),
        tweet('5', '2026-09-10T00:00:00.000Z', 'Astra from another author', { author: 'other' })
      ], {
        terminal: false,
        resumeCursor: 'cursor-next',
        pageCount: 1,
        tweetCount: 5,
        oldestObservedAt: '2026-09-10T00:00:00.000Z',
        newestObservedAt: '2026-09-14T00:00:00.000Z',
        lastFetchedAt: '2026-09-14T00:00:00.000Z'
      })
    ));
    const firstReport = await runJson('merge-x-activity-scan.mjs', [
      firstBatchPath,
      '--event-id', eventId,
      '--cache-root', root
    ]);
    assert.equal(firstReport.complete, false);
    assert.equal(firstReport.pendingCount, 1);
    assert.equal(firstReport.results[0].astraPostCount, 2);
    assert.equal(firstReport.results[0].classification, 'incomplete');
    assert.equal((await readUserCache(root, '303')).coverage.resumeCursor, 'cursor-next');

    const secondBatchPath = path.join(root, 'batch-2.json');
    await writeJson(secondBatchPath, batch(
      'batch-2',
      eventId,
      cutoff,
      batchRecord(candidate, [tweet('6', '2026-09-09T00:00:00.000Z', 'Astra three')], {
        terminal: false,
        resumeCursor: 'cursor-next-2',
        pageCount: 1,
        tweetCount: 1,
        oldestObservedAt: '2026-09-09T00:00:00.000Z',
        newestObservedAt: '2026-09-09T00:00:00.000Z',
        lastFetchedAt: '2026-09-14T01:00:00.000Z'
      }, { userLookupAttempted: false })
    ));
    const secondReport = await runJson('merge-x-activity-scan.mjs', [
      secondBatchPath,
      '--event-id', eventId,
      '--cache-root', root
    ]);
    assert.equal(secondReport.complete, true);
    assert.equal(secondReport.pendingCount, 0);
    assert.equal(secondReport.results[0].astraPostCount, 3);
    assert.equal(secondReport.results[0].classification, 'astra_3_or_more');
    assert.deepEqual(secondReport.results[0].evidencePosts.map((post) => post.id), ['1', '2', '6']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
