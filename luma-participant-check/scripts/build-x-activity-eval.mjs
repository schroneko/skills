import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [batchPath] = process.argv.slice(2);
if (!batchPath) {
  process.stderr.write('usage: node build-x-activity-eval.mjs <batch.json>\n');
  process.exit(2);
}

const batch = JSON.parse(readFileSync(batchPath, 'utf8'));
if (!Array.isArray(batch.nextBatch) || !batch.eventId || !batch.cutoff) {
  throw new Error('batch must contain eventId, cutoff, and nextBatch');
}

const helperPath = fileURLToPath(new URL('./build-x-guest-check-eval.mjs', import.meta.url));
const helper = readFileSync(helperPath, 'utf8');
const bearer = helper.match(/const bearer = '([^']+)'/)?.[1];
if (!bearer) throw new Error('existing internal API bearer was not found');

const fn = String.raw`async () => {
  const batch = ${JSON.stringify({
    batchId: batch.batchId,
    eventId: batch.eventId,
    cutoff: batch.cutoff,
    keyword: batch.keyword || 'astra',
    nextBatch: batch.nextBatch,
    requestBudget: batch.requestBudget
  })};
  const bearer = ${JSON.stringify(bearer)};
  const headers = {
    authorization: bearer,
    'x-csrf-token': (document.cookie.match(/(?:^|; )ct0=([^;]+)/) || [])[1] || '',
    'x-twitter-auth-type': 'OAuth2Session',
    'x-twitter-active-user': 'yes',
    'x-twitter-client-language': document.documentElement.lang || 'ja',
    accept: 'application/json'
  };
  const statuses = [];
  const numberOrNull = value => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const discover = (bundle, name) => {
    const marker = 'operationName:"' + name + '"';
    const index = bundle.indexOf(marker);
    if (index < 0) throw new Error('operation not found: ' + name);
    const prefix = bundle.slice(Math.max(0, index - 300), index);
    const suffix = bundle.slice(index, index + 12000);
    const queryId = [...prefix.matchAll(/queryId:"([^"]+)"/g)].at(-1)?.[1];
    const featuresMatch = suffix.match(/featureSwitches:(\[[^\]]*\])/);
    const togglesMatch = suffix.match(/fieldToggles:(\[[^\]]*\])/);
    if (!queryId || !featuresMatch || !togglesMatch) throw new Error('operation metadata incomplete: ' + name);
    const featureSwitches = JSON.parse(featuresMatch[1]);
    const fieldToggles = JSON.parse(togglesMatch[1]);
    return {
      queryId,
      features: Object.fromEntries(featureSwitches.map(value => [value, true])),
      fieldToggles: Object.fromEntries(fieldToggles.map(value => [value, false]))
    };
  };
  const requestJson = async (url, endpoint) => {
    const response = await fetch(url, {credentials: 'include', headers});
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    const status = {
      endpoint,
      status: response.status,
      remaining: numberOrNull(response.headers.get('x-rate-limit-remaining')),
      limit: numberOrNull(response.headers.get('x-rate-limit-limit')),
      reset: numberOrNull(response.headers.get('x-rate-limit-reset'))
    };
    statuses.push(status);
    return {ok: response.ok, rateLimited: response.status === 429, status, data};
  };
  const src = Array.from(document.scripts).map(script => script.src).find(value => /\/main\.[^/]+\.js(?:\?.*)?$/.test(value));
  if (!src) return {schemaVersion: 1, batchId: batch.batchId, eventId: batch.eventId, cutoff: batch.cutoff, records: [], statuses, stopped: true, stopReason: 'main_bundle_not_found'};
  const bundleResponse = await fetch(src);
  const bundle = await bundleResponse.text();
  let operations;
  try {
    operations = {
      user: discover(bundle, 'UserByScreenName'),
      tweets: discover(bundle, 'UserTweets')
    };
  } catch (error) {
    return {schemaVersion: 1, batchId: batch.batchId, eventId: batch.eventId, cutoff: batch.cutoff, records: [], statuses, stopped: true, stopReason: 'operation_discovery_failed', error: String(error.message || error)};
  }
  const userBudget = Number(batch.requestBudget?.userByScreenName || 0);
  const tweetBudget = Number(batch.requestBudget?.userTweets || 0);
  const maxPagesPerCandidate = Number(batch.requestBudget?.maxPagesPerCandidate || 3);
  const cutoffTimestamp = Date.parse(batch.cutoff);
  const keywordMatcher = new RegExp(String(batch.keyword || 'astra'), 'i');
  const records = [];
  const stop = (reason, checked = records.length) => ({schemaVersion: 1, batchId: batch.batchId, eventId: batch.eventId, cutoff: batch.cutoff, keyword: batch.keyword || 'astra', records, statuses, rateLimits: latestRateLimits(), checked, stopped: true, stopReason: reason});
  const latestRateLimits = () => {
    const result = {};
    for (const status of statuses) {
      result[status.endpoint] = {
        limit: status.limit,
        remaining: status.remaining,
        reset: status.reset
      };
    }
    return result;
  };
  const getUser = async candidate => {
    const url = new URL('https://x.com/i/api/graphql/' + operations.user.queryId + '/UserByScreenName');
    url.searchParams.set('variables', JSON.stringify({screen_name: candidate.handle, withSafetyModeUserFields: true}));
    url.searchParams.set('features', JSON.stringify(operations.user.features));
    url.searchParams.set('fieldToggles', JSON.stringify(operations.user.fieldToggles));
    return requestJson(url, 'UserByScreenName');
  };
  const unwrapTweet = value => {
    let current = value;
    if (current?.tweet?.result) current = current.tweet.result;
    if (current?.__typename === 'TweetWithVisibilityResults' && current.tweet?.result) current = current.tweet.result;
    return current;
  };
  const extractTweets = timeline => {
    const tweets = new Map();
    const walk = value => {
      if (!value || typeof value !== 'object') return;
      const candidates = [value.tweet_results?.result, value.itemContent?.tweet_results?.result];
      for (const candidate of candidates) {
        const current = unwrapTweet(candidate);
        if (!current || current.__typename !== 'Tweet' || !current.legacy) continue;
        const legacy = current.legacy;
        const createdAt = String(legacy.created_at || '');
        const text = String(legacy.full_text || '');
        const id = String(current.rest_id || '');
        const author = String(current.core?.user_results?.result?.core?.screen_name || current.core?.user_results?.result?.legacy?.screen_name || '').toLowerCase();
        if (!id || !Number.isFinite(Date.parse(createdAt))) continue;
        tweets.set(id, {id, author, createdAt, timestamp: Date.parse(createdAt), text, isRepost: Boolean(legacy.retweeted_status_result) || /^RT @/i.test(text)});
      }
      for (const child of Object.values(value)) walk(child);
    };
    walk(timeline);
    return [...tweets.values()];
  };
  const extractBottomCursor = timeline => {
    let cursor = null;
    const walk = value => {
      if (!value || typeof value !== 'object') return;
      if (value.cursorType === 'Bottom' && typeof value.value === 'string') cursor = value.value;
      for (const child of Object.values(value)) walk(child);
    };
    walk(timeline);
    return cursor;
  };
  let userRequests = 0;
  let tweetRequests = 0;
  for (const item of batch.nextBatch) {
    const candidate = item.candidate;
    let user = item.cachedUser || null;
    let userLookupStatus = null;
    let userLookupAttempted = false;
    if (item.userLookupNeeded) {
      if (userRequests >= userBudget) return stop('batch_request_budget_exhausted');
      userRequests += 1;
      userLookupAttempted = true;
      const response = await getUser(candidate);
      userLookupStatus = response.status;
      if (response.rateLimited) return stop('rate_limit_429');
      if (!response.ok) {
        records.push({candidateKey: item.candidateKey, candidate, user: null, userLookupAttempted, userLookupStatus, tweets: [], classification: 'lookup_failed', complete: false, safeTerminal: false, timeline: null});
        return stop('request_failed');
      }
      const result = response.data?.data?.user?.result || null;
      const statusCountValue = result?.legacy?.statuses_count ?? result?.tweet_counts?.tweets ?? null;
      user = result && result.__typename === 'User' ? {
        restId: String(result.rest_id || ''),
        handle: String(result.core?.screen_name || result.legacy?.screen_name || ''),
        name: String(result.core?.name || result.legacy?.name || ''),
        protected: Boolean(result.privacy?.protected ?? result.legacy?.protected ?? false),
        statusesCount: numberOrNull(statusCountValue),
        pinnedTweetIds: Array.isArray(result.pinned_items?.tweet_ids_str)
          ? result.pinned_items.tweet_ids_str.map(value => String(value))
          : Array.isArray(result.legacy?.pinned_tweet_ids_str)
            ? result.legacy.pinned_tweet_ids_str.map(value => String(value))
            : []
      } : null;
    }
    if (!user) {
      records.push({candidateKey: item.candidateKey, candidate, user: null, userLookupAttempted, userLookupStatus, tweets: [], classification: 'unresolved', complete: true, safeTerminal: true, timeline: null});
      if (userLookupStatus?.remaining !== null && userLookupStatus?.remaining <= 5) return stop('preemptive_rate_limit_stop');
      continue;
    }
    if (!/^\d+$/.test(user.restId) || !/^[A-Za-z0-9_]{1,15}$/.test(user.handle)) {
      records.push({candidateKey: item.candidateKey, candidate, user: null, userLookupAttempted, userLookupStatus, tweets: [], classification: 'lookup_failed', complete: false, safeTerminal: false, timeline: null});
      return stop('user_identity_incomplete');
    }
    if (user.protected) {
      records.push({candidateKey: item.candidateKey, candidate, user, userLookupAttempted, userLookupStatus, tweets: [], classification: 'protected', complete: true, safeTerminal: true, timeline: {terminal: true, resumeCursor: null, pageCount: 0, tweetCount: 0}});
      if (userLookupStatus?.remaining !== null && userLookupStatus?.remaining <= 5) return stop('preemptive_rate_limit_stop');
      continue;
    }
    if (user.statusesCount === 0) {
      records.push({candidateKey: item.candidateKey, candidate, user, userLookupAttempted, userLookupStatus, tweets: [], classification: 'zero_posts', complete: true, safeTerminal: true, timeline: {terminal: true, resumeCursor: null, pageCount: 0, tweetCount: 0}});
      if (userLookupStatus?.remaining !== null && userLookupStatus?.remaining <= 5) return stop('preemptive_rate_limit_stop');
      continue;
    }
    const allTweets = new Map();
    const seenCursors = new Set();
    let cursor = item.resumeCursor || null;
    let pageCount = 0;
    let lastStatus = null;
    let oldestObservedAt = null;
    let newestObservedAt = null;
    let terminal = false;
    let stoppedReason = null;
    const cachedTweetIds = new Set((item.cachedTweetIds || []).map(String));
    while (pageCount < maxPagesPerCandidate) {
      if (tweetRequests >= tweetBudget) {
        stoppedReason = 'batch_request_budget_exhausted';
        break;
      }
      const url = new URL('https://x.com/i/api/graphql/' + operations.tweets.queryId + '/UserTweets');
      const variables = {userId: user.restId, count: 100, includePromotedContent: false, withQuickPromoteEligibilityTweetFields: true, withVoice: true};
      if (cursor) variables.cursor = cursor;
      url.searchParams.set('variables', JSON.stringify(variables));
      url.searchParams.set('features', JSON.stringify(operations.tweets.features));
      url.searchParams.set('fieldToggles', JSON.stringify(operations.tweets.fieldToggles));
      tweetRequests += 1;
      const response = await requestJson(url, 'UserTweets');
      lastStatus = response.status;
      if (response.rateLimited) {
        stoppedReason = 'rate_limit_429';
        break;
      }
      if (!response.ok) {
        stoppedReason = 'request_failed';
        break;
      }
      pageCount += 1;
      const userResult = response.data?.data?.user?.result;
      const timeline = userResult?.timeline_v2?.timeline || userResult?.timeline?.timeline || null;
      if (!timeline) {
        stoppedReason = 'timeline_missing';
        break;
      }
      const extractedTweets = extractTweets(timeline);
      if (extractedTweets.some(tweet => !tweet.author)) {
        stoppedReason = 'tweet_author_missing';
        break;
      }
      for (const tweet of extractedTweets) {
        if (!cachedTweetIds.has(tweet.id)) allTweets.set(tweet.id, tweet);
      }
      const timestamps = [...allTweets.values()].map(tweet => tweet.timestamp).filter(Number.isFinite);
      if (timestamps.length > 0) {
        oldestObservedAt = new Date(Math.min(...timestamps)).toISOString();
        newestObservedAt = new Date(Math.max(...timestamps)).toISOString();
      }
      const pinned = new Set((user.pinnedTweetIds || []).map(String));
      const visible = [...allTweets.values()].filter(tweet => !pinned.has(tweet.id));
      const oldestNonPinned = visible.sort((a, b) => a.timestamp - b.timestamp)[0] || null;
      const recentOwn = [...allTweets.values()].filter(tweet => tweet.author === user.handle.toLowerCase() && tweet.timestamp >= cutoffTimestamp && !tweet.isRepost && tweet.text.length > 0 && !pinned.has(tweet.id));
      const cachedAstraCount = Number(item.cachedSummary?.astraPostCount || 0);
      const astraCount = cachedAstraCount + recentOwn.filter(tweet => keywordMatcher.test(tweet.text)).length;
      const nextCursor = extractBottomCursor(timeline);
      const cachedCoverage = item.cachedUser?.coverage;
      const alreadyCovered = Boolean(cachedCoverage?.terminal || (cachedCoverage?.oldestObservedAt && Date.parse(cachedCoverage.oldestObservedAt) <= cutoffTimestamp));
      if (astraCount >= 3 || alreadyCovered || !nextCursor || seenCursors.has(nextCursor) || Boolean(oldestNonPinned && oldestNonPinned.timestamp < cutoffTimestamp)) {
        terminal = true;
        cursor = null;
        break;
      }
      if (response.status.remaining !== null && response.status.remaining <= 5) {
        cursor = nextCursor;
        stoppedReason = 'preemptive_rate_limit_stop';
        break;
      }
      if (!nextCursor) {
        terminal = true;
        cursor = null;
        break;
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
    const tweets = [...allTweets.values()];
    const pinned = new Set((user.pinnedTweetIds || []).map(String));
    const recentOwn = tweets.filter(tweet => tweet.author === user.handle.toLowerCase() && tweet.timestamp >= cutoffTimestamp && !tweet.isRepost && tweet.text.length > 0 && !pinned.has(tweet.id));
    const astraPosts = recentOwn.filter(tweet => keywordMatcher.test(tweet.text));
    const cachedAstraCount = Number(item.cachedSummary?.astraPostCount || 0);
    const astraPostCount = cachedAstraCount + astraPosts.length;
    const complete = astraPostCount >= 3 || terminal;
    const classification = astraPostCount >= 3 ? 'astra_3_or_more' : complete ? 'fewer_than_3_astra' : 'incomplete';
    const evidencePosts = astraPosts.slice(0, 3).map(tweet => ({id: tweet.id, createdAt: tweet.createdAt, text: tweet.text, url: 'https://x.com/' + tweet.author + '/status/' + tweet.id}));
    records.push({candidateKey: item.candidateKey, candidate, user, userLookupAttempted, userLookupStatus, tweets, classification, complete, safeTerminal: complete, evidencePosts, timeline: {terminal, resumeCursor: terminal ? null : cursor, pageCount, tweetCount: tweets.length, oldestObservedAt, newestObservedAt, lastStatus, lastFetchedAt: new Date().toISOString()}});
    if (stoppedReason) return stop(stoppedReason);
    if (userLookupStatus?.remaining !== null && userLookupStatus?.remaining <= 5) return stop('preemptive_rate_limit_stop');
    if (lastStatus?.remaining !== null && lastStatus?.remaining <= 5) return stop('preemptive_rate_limit_stop');
  }
  return {schemaVersion: 1, batchId: batch.batchId, eventId: batch.eventId, cutoff: batch.cutoff, keyword: batch.keyword || 'astra', records, statuses, rateLimits: latestRateLimits(), checked: records.length, stopped: false, stopReason: null};
}`;

process.stdout.write(fn);
