import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  classifyUserActivity,
  mergeUserCache,
  readUserCache,
  writeUserCache
} from './x-activity-cache.mjs';

function userRecord(overrides = {}) {
  return {
    schemaVersion: 1,
    restId: '123',
    handle: 'example',
    name: 'Example',
    protected: false,
    statusesCount: 10,
    pinnedTweetIds: [],
    tweets: [],
    coverage: {
      oldestObservedAt: '2026-09-01T00:00:00.000Z',
      newestObservedAt: '2026-09-14T00:00:00.000Z',
      terminal: true,
      resumeCursor: null,
      pageCount: 1
    },
    lastUserLookupAt: '2026-09-14T00:00:00.000Z',
    lastTimelineFetchAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
    ...overrides
  };
}

test('user cache writes atomically and merges idempotently', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'luma-activity-cache-'));
  try {
    const first = userRecord({
      tweets: [{
        id: '1',
        author: 'example',
        createdAt: 'Mon Sep 14 00:00:00 +0000 2026',
        timestamp: Date.parse('Mon Sep 14 00:00:00 +0000 2026'),
        text: 'Astra test',
        isRepost: false
      }]
    });
    await writeUserCache(root, first);
    const stored = await readUserCache(root, '123');
    assert.deepEqual(stored, first);
    const merged = mergeUserCache(stored, first, '2026-09-14T01:00:00.000Z');
    await writeUserCache(root, merged);
    const final = await readUserCache(root, '123');
    assert.equal(final.tweets.length, 1);
    assert.equal(final.updatedAt, '2026-09-14T01:00:00.000Z');
    assert.match(await readFile(path.join(root, 'users', '123.json'), 'utf8'), /"schemaVersion": 1/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('activity classification excludes pinned and reposted posts', () => {
  const tweets = [
    { id: '1', author: 'example', createdAt: 'Mon Sep 14 00:00:00 +0000 2026', timestamp: Date.parse('Mon Sep 14 00:00:00 +0000 2026'), text: 'Astra one', isRepost: false },
    { id: '2', author: 'example', createdAt: 'Sun Sep 13 00:00:00 +0000 2026', timestamp: Date.parse('Sun Sep 13 00:00:00 +0000 2026'), text: 'Astra two', isRepost: false },
    { id: '3', author: 'example', createdAt: 'Sat Sep 12 00:00:00 +0000 2026', timestamp: Date.parse('Sat Sep 12 00:00:00 +0000 2026'), text: 'Astra pinned', isRepost: false },
    { id: '4', author: 'example', createdAt: 'Fri Sep 11 00:00:00 +0000 2026', timestamp: Date.parse('Fri Sep 11 00:00:00 +0000 2026'), text: 'RT @someone Astra repost', isRepost: true },
    { id: '5', author: 'other', createdAt: 'Thu Sep 10 00:00:00 +0000 2026', timestamp: Date.parse('Thu Sep 10 00:00:00 +0000 2026'), text: 'Astra from another author', isRepost: false }
  ];
  const result = classifyUserActivity(userRecord({ pinnedTweetIds: ['3'], tweets }), '2026-09-07T00:00:00.000Z');
  assert.equal(result.astraPostCount, 2);
  assert.equal(result.classification, 'fewer_than_3_astra');
  assert.equal(result.complete, true);
  assert.deepEqual(result.evidencePosts.map((post) => post.id), ['1', '2']);
});

test('missing status count does not become zero posts', () => {
  const result = classifyUserActivity(userRecord({
    statusesCount: null,
    coverage: {
      terminal: false,
      oldestObservedAt: '2026-09-14T00:00:00.000Z'
    }
  }), '2026-09-07T00:00:00.000Z');
  assert.equal(result.classification, 'incomplete');
  assert.equal(result.complete, false);
});

test('malformed user cache is rejected', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'luma-activity-cache-'));
  try {
    await writeUserCache(root, userRecord());
    const filePath = path.join(root, 'users', '123.json');
    const malformed = JSON.parse(await readFile(filePath, 'utf8'));
    delete malformed.coverage;
    await import('node:fs/promises').then(({ writeFile }) => writeFile(filePath, JSON.stringify(malformed)));
    await assert.rejects(() => readUserCache(root, '123'), /coverage/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
