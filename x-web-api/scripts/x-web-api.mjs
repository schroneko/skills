import { execFileSync } from "node:child_process";
import {
  createDecipheriv,
  createHash,
  pbkdf2Sync,
  timingSafeEqual,
} from "node:crypto";
import {
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

const PUBLIC_BEARER =
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const CHROME_EPOCH_OFFSET_MICROSECONDS = 11644473600000000n;
const PLAN_SCHEMA_VERSION = 2;
const CHECKPOINT_SCHEMA_VERSION = 1;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

export class XWebApiError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "XWebApiError";
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = {}) {
  throw new XWebApiError(code, message, details);
}

function normalizeHandle(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(normalized)) {
    fail("INVALID_HANDLE", "expected handle is invalid");
  }
  return normalized;
}

function parsePositiveInteger(value, option, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maximum) {
    fail("INVALID_OPTION", `${option} must be an integer between 0 and ${maximum}`);
  }
  return parsed;
}

export function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  if (!command || command.startsWith("--")) {
    fail("MISSING_COMMAND", "a command is required");
  }
  const options = {};
  const booleanOptions = new Set(["execute"]);
  while (args.length > 0) {
    const token = args.shift();
    if (!token.startsWith("--")) {
      fail("INVALID_ARGUMENT", `unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    if (Object.hasOwn(options, key)) {
      fail("DUPLICATE_OPTION", `duplicate option: --${key}`);
    }
    if (booleanOptions.has(key)) {
      options[key] = true;
      continue;
    }
    const value = args.shift();
    if (value === undefined || value.startsWith("--")) {
      fail("MISSING_OPTION_VALUE", `missing value for --${key}`);
    }
    options[key] = value;
  }
  return { command, options };
}

function requireOption(options, key) {
  if (!Object.hasOwn(options, key)) {
    fail("MISSING_OPTION", `--${key} is required`);
  }
  return options[key];
}

function assertAllowedOptions(options, allowed) {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(options).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    fail("UNKNOWN_OPTION", `unknown option: --${unknown[0]}`);
  }
}

function getProfilePath(options) {
  const profile = options["chrome-profile"] ?? "Default";
  if (!/^[A-Za-z0-9 _-]+$/.test(profile)) {
    fail("INVALID_PROFILE", "Chrome profile name is invalid");
  }
  return resolve(
    homedir(),
    "Library",
    "Application Support",
    "Google",
    "Chrome",
    profile,
  );
}

function chromeExpiryIsValid(expiresUtc) {
  const value = BigInt(expiresUtc);
  if (value === 0n) {
    return true;
  }
  const unixMicroseconds = value - CHROME_EPOCH_OFFSET_MICROSECONDS;
  return unixMicroseconds > BigInt(Date.now()) * 1000n;
}

export function deriveChromeKey(password) {
  return pbkdf2Sync(password, "saltysalt", 1003, 16, "sha1");
}

export function decryptChromeCookie({
  encryptedValue,
  hostKey,
  password,
  databaseVersion,
}) {
  const encrypted = Buffer.from(encryptedValue);
  if (encrypted.length <= 3 || encrypted.subarray(0, 3).toString("ascii") !== "v10") {
    fail("UNSUPPORTED_COOKIE_FORMAT", "Chrome cookie is not in v10 format");
  }
  const decipher = createDecipheriv(
    "aes-128-cbc",
    deriveChromeKey(password),
    Buffer.alloc(16, 0x20),
  );
  const plaintext = Buffer.concat([
    decipher.update(encrypted.subarray(3)),
    decipher.final(),
  ]);
  let value = plaintext;
  if (Number(databaseVersion) >= 24) {
    if (plaintext.length <= 32) {
      fail("INVALID_COOKIE_PAYLOAD", "Chrome cookie payload is too short");
    }
    const expectedHostHash = createHash("sha256").update(hostKey).digest();
    const actualHostHash = plaintext.subarray(0, 32);
    if (
      expectedHostHash.length !== actualHostHash.length ||
      !timingSafeEqual(expectedHostHash, actualHostHash)
    ) {
      fail("COOKIE_HOST_MISMATCH", "Chrome cookie host hash does not match");
    }
    value = plaintext.subarray(32);
  }
  const decoded = value.toString("utf8");
  if (!decoded || decoded.includes("\u0000")) {
    fail("INVALID_COOKIE_VALUE", "Chrome cookie value is invalid");
  }
  return decoded;
}

function getChromeSafeStoragePassword() {
  try {
    return execFileSync(
      "/usr/bin/security",
      [
        "find-generic-password",
        "-w",
        "-a",
        "Chrome",
        "-s",
        "Chrome Safe Storage",
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).replace(/[\r\n]+$/, "");
  } catch {
    fail(
      "KEYCHAIN_ACCESS_FAILED",
      "Chrome Safe Storage could not be read from macOS Keychain",
    );
  }
}

function readChromeAuth(profilePath) {
  const databasePath = resolve(profilePath, "Cookies");
  if (!existsSync(databasePath)) {
    fail("COOKIE_DATABASE_NOT_FOUND", "Chrome Cookies database was not found");
  }
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const metadata = database
      .prepare("SELECT value FROM meta WHERE key = 'version'")
      .get();
    const databaseVersion = Number(metadata?.value);
    if (!Number.isInteger(databaseVersion) || databaseVersion < 24) {
      fail(
        "UNSUPPORTED_COOKIE_DATABASE",
        "Chrome Cookies database version 24 or newer is required",
      );
    }
    const cookieStatement = database.prepare(
      "SELECT host_key, name, encrypted_value, expires_utc FROM cookies WHERE host_key = '.x.com' AND top_frame_site_key = '' AND path = '/' AND name IN ('auth_token', 'ct0')",
    );
    cookieStatement.setReadBigInts(true);
    const rows = cookieStatement.all();
    const byName = new Map();
    for (const row of rows) {
      if (!chromeExpiryIsValid(row.expires_utc)) {
        continue;
      }
      if (byName.has(row.name)) {
        fail("DUPLICATE_AUTH_COOKIE", `duplicate ${row.name} cookie found`);
      }
      byName.set(row.name, row);
    }
    for (const name of ["auth_token", "ct0"]) {
      if (!byName.has(name)) {
        fail("AUTH_COOKIE_NOT_FOUND", `${name} cookie was not found or is expired`);
      }
    }
    const password = getChromeSafeStoragePassword();
    const authToken = decryptChromeCookie({
      encryptedValue: byName.get("auth_token").encrypted_value,
      hostKey: ".x.com",
      password,
      databaseVersion,
    });
    const csrfToken = decryptChromeCookie({
      encryptedValue: byName.get("ct0").encrypted_value,
      hostKey: ".x.com",
      password,
      databaseVersion,
    });
    return { authToken, csrfToken };
  } finally {
    database.close();
  }
}

function rateLimitFromHeaders(headers) {
  const parseHeader = (name) => {
    const value = headers.get(name);
    if (value === null || value === "") {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    limit: parseHeader("x-rate-limit-limit"),
    remaining: parseHeader("x-rate-limit-remaining"),
    reset: parseHeader("x-rate-limit-reset"),
  };
}

function safeResponseMessage(text) {
  if (!text) {
    return "";
  }
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed?.errors)) {
      return parsed.errors
        .map((error) => String(error?.message ?? error?.code ?? "unknown error"))
        .join("; ")
        .slice(0, 300);
    }
    if (typeof parsed?.error === "string") {
      return parsed.error.slice(0, 300);
    }
  } catch {
    return text.replace(/\s+/g, " ").slice(0, 300);
  }
  return "";
}

class XApiClient {
  constructor(auth) {
    this.auth = auth;
  }

  headers(extra = {}) {
    return {
      accept: "*/*",
      authorization: `Bearer ${PUBLIC_BEARER}`,
      cookie: `auth_token=${this.auth.authToken}; ct0=${this.auth.csrfToken}`,
      "user-agent": USER_AGENT,
      "x-csrf-token": this.auth.csrfToken,
      "x-twitter-active-user": "yes",
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-client-language": "en",
      ...extra,
    };
  }

  async raw(url, options = {}) {
    const parsedUrl = new URL(url);
    if (
      parsedUrl.origin !== "https://x.com" &&
      parsedUrl.origin !== "https://api.x.com"
    ) {
      fail(
        "DISALLOWED_URL",
        "authenticated requests are restricted to https://x.com and https://api.x.com",
      );
    }
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: this.headers(options.headers),
      body: options.body,
      redirect: "manual",
      signal: AbortSignal.timeout(options.timeout ?? 30000),
    });
    const text = await response.text();
    return {
      status: response.status,
      ok: response.ok,
      text,
      headers: response.headers,
      rateLimit: rateLimitFromHeaders(response.headers),
    };
  }

  async json(url, options = {}) {
    const response = await this.raw(url, options);
    if (response.status === 401 || response.status === 403) {
      fail("AUTHORIZATION_FAILED", `X returned HTTP ${response.status}`, {
        context: options.context ?? null,
      });
    }
    if (response.status === 429) {
      fail("RATE_LIMITED", "X returned HTTP 429", {
        context: options.context ?? null,
        rate_limit: response.rateLimit,
      });
    }
    if (!response.ok) {
      fail("X_API_ERROR", `X returned HTTP ${response.status}`, {
        context: options.context ?? null,
        response: safeResponseMessage(response.text),
        rate_limit: response.rateLimit,
      });
    }
    try {
      const parsed = JSON.parse(response.text);
      if (Array.isArray(parsed?.errors) && parsed.errors.length > 0) {
        fail("X_GRAPHQL_ERROR", "X returned GraphQL errors", {
          context: options.context ?? null,
          response: safeResponseMessage(response.text),
        });
      }
      return { data: parsed, rateLimit: response.rateLimit };
    } catch (error) {
      if (error instanceof XWebApiError) {
        throw error;
      }
      fail("INVALID_X_RESPONSE", "X returned invalid JSON");
    }
  }

  async text(url) {
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== "https://x.com") {
      fail("DISALLOWED_URL", "X Web requests are restricted to https://x.com");
    }
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        cookie: `auth_token=${this.auth.authToken}; ct0=${this.auth.csrfToken}`,
        "user-agent": USER_AGENT,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      fail("X_WEB_ERROR", `X Web returned HTTP ${response.status}`);
    }
    return response.text();
  }

  async publicText(url) {
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== "https://abs.twimg.com") {
      fail(
        "DISALLOWED_URL",
        "public asset requests are restricted to https://abs.twimg.com",
      );
    }
    const response = await fetch(url, {
      headers: {
        accept: "*/*",
        "user-agent": USER_AGENT,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      fail("X_WEB_ERROR", `X Web asset returned HTTP ${response.status}`);
    }
    return response.text();
  }
}

async function createClient(options) {
  return new XApiClient(readChromeAuth(getProfilePath(options)));
}

async function getViewer(client) {
  const operation = await discoverOperation(
    client,
    "https://x.com/home",
    "Viewer",
  );
  const url = new URL(
    `https://x.com/i/api/graphql/${operation.queryId}/${operation.operationName}`,
  );
  url.searchParams.set(
    "variables",
    JSON.stringify({ withCommunitiesMemberships: false }),
  );
  url.searchParams.set("features", JSON.stringify(operation.features));
  url.searchParams.set(
    "fieldToggles",
    JSON.stringify(operation.fieldToggles),
  );
  const { data } = await client.json(url, { context: "viewer" });
  const result = data?.data?.viewer?.user_results?.result;
  if (result?.__typename !== "User") {
    fail("INVALID_VIEWER", "viewer identity response is invalid");
  }
  const id = String(result.rest_id ?? "");
  const handle = String(
    result.core?.screen_name ?? result.legacy?.screen_name ?? "",
  );
  if (!/^\d+$/.test(id) || !handle) {
    fail("INVALID_VIEWER", "viewer identity response is invalid");
  }
  return {
    id,
    handle,
    name: String(result.core?.name ?? result.legacy?.name ?? ""),
    url: `https://x.com/${handle}`,
    following_count: Number.isSafeInteger(
      Number(
        result.action_counts?.following_count ??
          result.legacy?.friends_count,
      ),
    )
      ? Number(
          result.action_counts?.following_count ??
            result.legacy?.friends_count,
        )
      : null,
  };
}

function assertViewer(viewer, expectedHandle) {
  const expected = normalizeHandle(expectedHandle);
  if (viewer.handle.toLowerCase() !== expected) {
    fail("VIEWER_MISMATCH", "logged-in X account does not match expected handle", {
      expected_handle: expected,
      actual_handle: viewer.handle,
    });
  }
}

export function extractInitialState(html) {
  const startMarker = "window.__INITIAL_STATE__=";
  const endMarker = ";window.__META_DATA__=";
  const start = html.indexOf(startMarker);
  const end = html.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    fail("INITIAL_STATE_NOT_FOUND", "X initial state was not found");
  }
  try {
    return JSON.parse(html.slice(start + startMarker.length, end));
  } catch {
    fail("INVALID_INITIAL_STATE", "X initial state is invalid");
  }
}

export function extractOperationMetadata(bundle, operationName) {
  const marker = `operationName:"${operationName}"`;
  const operationIndexes = [];
  let searchIndex = 0;
  while (searchIndex < bundle.length) {
    const found = bundle.indexOf(marker, searchIndex);
    if (found < 0) {
      break;
    }
    operationIndexes.push(found);
    searchIndex = found + marker.length;
  }
  if (operationIndexes.length === 0) {
    fail("OPERATION_NOT_FOUND", `${operationName} was not found in X Web bundle`);
  }
  if (operationIndexes.length !== 1) {
    fail(
      "AMBIGUOUS_OPERATION",
      `${operationName} appeared more than once in X Web bundle`,
    );
  }
  const operationIndex = operationIndexes[0];
  const prefix = bundle.slice(Math.max(0, operationIndex - 300), operationIndex);
  const queryMatches = [...prefix.matchAll(/queryId:"([^"]+)"/g)];
  const queryId = queryMatches.at(-1)?.[1];
  const suffix = bundle.slice(operationIndex, operationIndex + 12000);
  const featuresMatch = suffix.match(/featureSwitches:(\[[^\]]*\])/);
  const togglesMatch = suffix.match(/fieldToggles:(\[[^\]]*\])/);
  if (!queryId || !featuresMatch || !togglesMatch) {
    fail("INVALID_OPERATION_METADATA", `${operationName} metadata is incomplete`);
  }
  try {
    return {
      queryId,
      operationName,
      featureSwitches: JSON.parse(featuresMatch[1]),
      fieldToggles: JSON.parse(togglesMatch[1]),
    };
  } catch {
    fail("INVALID_OPERATION_METADATA", `${operationName} metadata is invalid`);
  }
}

async function discoverOperation(client, route, operationName) {
  const html = await client.text(route);
  const scriptMatches = [
    ...html.matchAll(
      /src="(https:\/\/abs\.twimg\.com\/responsive-web\/client-web\/main\.[^"]+\.js)"/g,
    ),
  ];
  const scriptUrl = scriptMatches.at(-1)?.[1];
  if (!scriptUrl) {
    fail("MAIN_BUNDLE_NOT_FOUND", "X Web main bundle URL was not found");
  }
  const bundle = await client.publicText(scriptUrl);
  const metadata = extractOperationMetadata(bundle, operationName);
  const initialState = extractInitialState(html);
  const defaults = initialState?.featureSwitch?.defaultConfig ?? {};
  const userConfig = initialState?.featureSwitch?.user?.config ?? {};
  const features = Object.fromEntries(
    metadata.featureSwitches.map((name) => [
      name,
      (userConfig[name]?.value ?? defaults[name]?.value) === true,
    ]),
  );
  const fieldToggles = Object.fromEntries(
    metadata.fieldToggles.map((name) => [name, false]),
  );
  return { ...metadata, features, fieldToggles };
}

function findTimeline(data) {
  const user = data?.data?.user?.result;
  if (user?.__typename !== "User") {
    fail("INVALID_SUBSCRIPTIONS_RESPONSE", "creator subscriptions user is missing");
  }
  const timeline = user.timeline?.timeline;
  if (!timeline || !Array.isArray(timeline.instructions)) {
    fail("INVALID_SUBSCRIPTIONS_RESPONSE", "creator subscriptions timeline is missing");
  }
  return timeline;
}

export function extractTimelineUsers(timeline) {
  const users = new Map();
  let bottomCursor = null;
  const collectUser = (itemContent) => {
    const value = itemContent?.user_results?.result;
    if (!value || value.__typename !== "User") {
      return;
    }
    const id = String(value.rest_id ?? "");
    const handle = String(
      value.core?.screen_name ?? value.legacy?.screen_name ?? "",
    );
    if (/^\d+$/.test(id) && handle) {
      users.set(id, {
        id,
        handle,
        name: String(value.core?.name ?? value.legacy?.name ?? value.name ?? ""),
        url: `https://x.com/${handle}`,
      });
    }
  };
  const collectContent = (content) => {
    if (!content || typeof content !== "object") {
      return;
    }
    collectUser(content.itemContent);
    for (const moduleItem of Array.isArray(content.items) ? content.items : []) {
      collectUser(moduleItem?.item?.itemContent ?? moduleItem?.itemContent);
    }
    const cursorType = content.cursorType ?? content.cursor_type;
    if (cursorType === "Bottom" && typeof content.value === "string") {
      bottomCursor = content.value;
    }
  };
  const collectEntry = (entry) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    collectContent(entry.content);
    const entryId = entry.entryId ?? entry.entry_id;
    if (
      typeof entryId === "string" &&
      entryId.startsWith("cursor-bottom") &&
      typeof entry.content?.value === "string"
    ) {
      bottomCursor = entry.content.value;
    }
  };
  for (const instruction of timeline.instructions) {
    for (const entry of Array.isArray(instruction?.entries)
      ? instruction.entries
      : []) {
      collectEntry(entry);
    }
    collectEntry(instruction?.entry);
  }
  return { users: [...users.values()], bottomCursor };
}

async function getCreatorSubscriptions(client, viewer, expectedCount) {
  const operation = await discoverOperation(
    client,
    `https://x.com/${encodeURIComponent(viewer.handle)}/creator-subscriptions/subscriptions`,
    "UserCreatorSubscriptions",
  );
  const users = new Map();
  let cursor;
  const seenCursors = new Set();
  for (let page = 0; page < 100; page += 1) {
    const variables = {
      userId: viewer.id,
      count: 20,
      includePromotedContent: false,
    };
    if (cursor) {
      variables.cursor = cursor;
    }
    const url = new URL(
      `https://x.com/i/api/graphql/${operation.queryId}/${operation.operationName}`,
    );
    url.searchParams.set("variables", JSON.stringify(variables));
    url.searchParams.set("features", JSON.stringify(operation.features));
    const { data } = await client.json(url, {
      context: "creator_subscriptions",
    });
    const extracted = extractTimelineUsers(findTimeline(data));
    const previousCount = users.size;
    for (const user of extracted.users) {
      users.set(user.id, user);
    }
    const addedCount = users.size - previousCount;
    if (addedCount === 0) {
      if (expectedCount !== undefined && users.size !== expectedCount) {
        fail(
          "SUBSCRIPTIONS_PAGINATION_STALLED",
          "creator subscriptions pagination returned no new users",
          {
            expected_count: expectedCount,
            actual_count: users.size,
            page: page + 1,
          },
        );
      }
      break;
    }
    if (!extracted.bottomCursor) {
      break;
    }
    if (seenCursors.has(extracted.bottomCursor)) {
      fail("REPEATED_CURSOR", "creator subscriptions cursor repeated");
    }
    seenCursors.add(extracted.bottomCursor);
    cursor = extracted.bottomCursor;
    if (page === 99) {
      fail("TOO_MANY_PAGES", "creator subscriptions exceeded 100 pages", {
        actual_count: users.size,
      });
    }
  }
  const subscriptions = [...users.values()];
  if (expectedCount !== undefined && subscriptions.length !== expectedCount) {
    fail(
      "SUBSCRIPTION_COUNT_MISMATCH",
      "creator subscription count does not match expected count",
      {
        expected_count: expectedCount,
        actual_count: subscriptions.length,
      },
    );
  }
  return {
    subscriptions,
    operation: {
      name: operation.operationName,
      query_id: operation.queryId,
    },
  };
}

async function getFollowing(client, viewer) {
  const operation = await discoverOperation(
    client,
    `https://x.com/${encodeURIComponent(viewer.handle)}/following`,
    "Following",
  );
  const users = new Map();
  let cursor;
  const seenCursors = new Set();
  for (let page = 0; page < 500; page += 1) {
    const variables = {
      userId: viewer.id,
      count: 100,
      includePromotedContent: false,
      withGrokTranslatedBio: false,
    };
    if (cursor) {
      variables.cursor = cursor;
    }
    const url = new URL(
      `https://x.com/i/api/graphql/${operation.queryId}/${operation.operationName}`,
    );
    url.searchParams.set("variables", JSON.stringify(variables));
    url.searchParams.set("features", JSON.stringify(operation.features));
    const { data } = await client.json(url, { context: "following" });
    const extracted = extractTimelineUsers(findTimeline(data));
    const previousCount = users.size;
    for (const user of extracted.users) {
      users.set(user.id, user);
    }
    if (users.size === previousCount) {
      break;
    }
    if (!extracted.bottomCursor) {
      break;
    }
    if (seenCursors.has(extracted.bottomCursor)) {
      fail("REPEATED_CURSOR", "following cursor repeated");
    }
    seenCursors.add(extracted.bottomCursor);
    cursor = extracted.bottomCursor;
    if (page === 499) {
      fail("TOO_MANY_PAGES", "following exceeded 500 pages", {
        actual_count: users.size,
      });
    }
  }
  if (
    viewer.following_count !== null &&
    users.size !== viewer.following_count
  ) {
    fail("FOLLOWING_COUNT_MISMATCH", "following count does not match viewer", {
      expected_count: viewer.following_count,
      actual_count: users.size,
    });
  }
  return {
    ids: [...users.keys()],
    users,
    operation: {
      name: operation.operationName,
      query_id: operation.queryId,
    },
  };
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function getFriendshipRelationships(client, users) {
  const relationships = new Map();
  for (const group of chunk(users, 50)) {
    const url = new URL(
      "https://x.com/i/api/1.1/friendships/lookup.json",
    );
    url.searchParams.set(
      "user_id",
      group.map((user) => user.id).join(","),
    );
    const { data } = await client.json(url, {
      context: "friendships_lookup",
    });
    if (!Array.isArray(data)) {
      fail(
        "INVALID_RELATIONSHIPS_RESPONSE",
        "friendships lookup response is invalid",
      );
    }
    const requested = new Map(group.map((user) => [user.id, user]));
    for (const value of data) {
      const id = String(value?.id_str ?? value?.id ?? "");
      if (!requested.has(id) || relationships.has(id)) {
        fail(
          "INVALID_RELATIONSHIPS_RESPONSE",
          "friendships lookup returned an unexpected user",
        );
      }
      if (!Array.isArray(value.connections)) {
        fail(
          "INVALID_RELATIONSHIPS_RESPONSE",
          "friendships lookup connections are missing",
          { user_id: id },
        );
      }
      relationships.set(id, {
        id,
        handle: String(value.screen_name ?? requested.get(id).handle),
        following: value.connections.includes("following"),
        followed_by: value.connections.includes("followed_by"),
        connections: [...value.connections],
      });
    }
    const missing = group.filter((user) => !relationships.has(user.id));
    if (missing.length > 0) {
      fail(
        "RELATIONSHIPS_LOOKUP_INCOMPLETE",
        "friendships lookup did not return every requested user",
        {
          missing_count: missing.length,
          missing_ids: missing.slice(0, 10).map((user) => user.id),
        },
      );
    }
  }
  return relationships;
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function digestValue(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

export function computePlanDigest(plan) {
  const { digest, ...payload } = plan;
  return digestValue(payload);
}

function targetSort(left, right) {
  const leftKey = left.handle?.toLowerCase() ?? `~${left.id}`;
  const rightKey = right.handle?.toLowerCase() ?? `~${right.id}`;
  return leftKey.localeCompare(rightKey) || left.id.localeCompare(right.id);
}

export function buildPlan({
  viewer,
  subscriptions,
  followingIds,
  userLookup,
  relationships,
  operation,
  relationshipCheckedAt = new Date().toISOString(),
  createdAt = new Date().toISOString(),
}) {
  const following = new Set(followingIds);
  const subscriptionIds = new Set(subscriptions.map((user) => user.id));
  for (const id of followingIds) {
    const relationship = relationships.get(id);
    if (!relationship || relationship.following !== true) {
      fail(
        "FOLLOWING_RELATIONSHIP_MISMATCH",
        "following user is missing a confirmed following relationship",
        { user_id: id },
      );
    }
  }
  const subscriptionRecords = subscriptions
    .map((user) => ({ ...user, is_followed: following.has(user.id) }))
    .sort(targetSort);
  const targets = followingIds
    .filter(
      (id) =>
        !subscriptionIds.has(id) &&
        relationships.get(id).followed_by === false,
    )
    .map((id) => {
      const user = userLookup.get(id);
      const record = user
        ? { ...user }
        : {
            id,
            handle: null,
            name: null,
            url: `https://x.com/i/user/${id}`,
          };
      return {
        ...record,
        relationship: {
          following: true,
          followed_by: false,
          checked_at: relationshipCheckedAt,
        },
      };
    })
    .sort(targetSort);
  const retainedCount = subscriptionRecords.filter(
    (record) => record.is_followed,
  ).length;
  const unilateralIds = followingIds.filter(
    (id) => relationships.get(id).followed_by === false,
  );
  const retainedUnilateralSubscriptionCount = unilateralIds.filter((id) =>
    subscriptionIds.has(id),
  ).length;
  const mutualCount = followingIds.length - unilateralIds.length;
  const plan = {
    schema_version: PLAN_SCHEMA_VERSION,
    operation: "unfollow-non-mutual-except-creator-subscriptions",
    created_at: createdAt,
    viewer,
    source: {
      creator_subscriptions_operation: operation,
      relationship_checked_at: relationshipCheckedAt,
      subscription_count: subscriptionRecords.length,
      following_count: followingIds.length,
      mutual_count: mutualCount,
      unilateral_count: unilateralIds.length,
      retained_subscription_count: retainedCount,
      retained_unilateral_subscription_count:
        retainedUnilateralSubscriptionCount,
      target_count: targets.length,
      unresolved_target_count: targets.filter((target) => !target.handle).length,
    },
    subscriptions: subscriptionRecords,
    targets,
  };
  plan.digest = computePlanDigest(plan);
  return plan;
}

export function validatePlan(plan) {
  if (
    !plan ||
    plan.schema_version !== PLAN_SCHEMA_VERSION ||
    plan.operation !==
      "unfollow-non-mutual-except-creator-subscriptions"
  ) {
    fail("INVALID_PLAN", "plan schema or operation is invalid");
  }
  if (computePlanDigest(plan) !== plan.digest) {
    fail("PLAN_DIGEST_MISMATCH", "plan digest does not match");
  }
  const subscriptionIds = plan.subscriptions.map((record) => String(record.id));
  const targetIds = plan.targets.map((record) => String(record.id));
  if (
    new Set(subscriptionIds).size !== subscriptionIds.length ||
    new Set(targetIds).size !== targetIds.length
  ) {
    fail("INVALID_PLAN", "plan contains duplicate user IDs");
  }
  if (targetIds.some((id) => subscriptionIds.includes(id))) {
    fail("INVALID_PLAN", "plan target overlaps creator subscriptions");
  }
  if (
    plan.targets.some(
      (target) =>
        target.relationship?.following !== true ||
        target.relationship?.followed_by !== false ||
        !Number.isFinite(Date.parse(target.relationship?.checked_at)),
    )
  ) {
    fail(
      "INVALID_PLAN",
      "plan target lacks confirmed unilateral relationship evidence",
    );
  }
  const retainedCount = plan.subscriptions.filter(
    (record) => record.is_followed,
  ).length;
  if (
    plan.source.subscription_count !== plan.subscriptions.length ||
    plan.source.target_count !== plan.targets.length ||
    plan.source.retained_subscription_count !== retainedCount ||
    plan.source.following_count !==
      plan.source.mutual_count + plan.source.unilateral_count ||
    plan.source.target_count !==
      plan.source.unilateral_count -
        plan.source.retained_unilateral_subscription_count ||
    plan.source.retained_unilateral_subscription_count >
      plan.source.retained_subscription_count
  ) {
    fail("INVALID_PLAN", "plan counts are inconsistent");
  }
  return plan;
}

function atomicWriteJson(path, value) {
  const absolutePath = resolve(path);
  if (!existsSync(dirname(absolutePath))) {
    fail("OUTPUT_DIRECTORY_NOT_FOUND", "output directory does not exist");
  }
  const temporaryPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporaryPath, absolutePath);
  } finally {
    if (existsSync(temporaryPath)) {
      unlinkSync(temporaryPath);
    }
  }
  return absolutePath;
}

function assertDistinctFiles(leftPath, rightPath) {
  const left = resolve(leftPath);
  const right = resolve(rightPath);
  if (left === right) {
    fail("PATH_COLLISION", "plan and checkpoint paths must be different");
  }
  if (existsSync(left) && existsSync(right)) {
    const leftStat = statSync(left);
    const rightStat = statSync(right);
    if (leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino) {
      fail("PATH_COLLISION", "plan and checkpoint paths resolve to the same file");
    }
  }
}

function readJson(path, code) {
  try {
    return JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch {
    fail(code, `${path} is not valid JSON`);
  }
}

function loadPlan(path) {
  return validatePlan(readJson(path, "INVALID_PLAN_FILE"));
}

function createCheckpoint(plan) {
  return {
    schema_version: CHECKPOINT_SCHEMA_VERSION,
    plan_digest: plan.digest,
    viewer: {
      id: plan.viewer.id,
      handle: plan.viewer.handle,
    },
    completed_ids: [],
    protected_mutual_ids: [],
    retryable_ids: [],
    last_rate_limit: null,
    last_status: null,
    next_allowed_at: null,
    updated_at: new Date().toISOString(),
  };
}

function loadCheckpoint(path, plan) {
  if (!existsSync(resolve(path))) {
    return createCheckpoint(plan);
  }
  const checkpoint = readJson(path, "INVALID_CHECKPOINT_FILE");
  if (
    checkpoint.schema_version !== CHECKPOINT_SCHEMA_VERSION ||
    checkpoint.plan_digest !== plan.digest ||
    checkpoint.viewer?.id !== plan.viewer.id ||
    checkpoint.viewer?.handle?.toLowerCase() !==
      plan.viewer.handle.toLowerCase() ||
    !Array.isArray(checkpoint.completed_ids) ||
    !Array.isArray(checkpoint.protected_mutual_ids) ||
    !Array.isArray(checkpoint.retryable_ids)
  ) {
    fail("CHECKPOINT_MISMATCH", "checkpoint does not match plan");
  }
  if (
    checkpoint.next_allowed_at !== undefined &&
    checkpoint.next_allowed_at !== null &&
    !Number.isFinite(Date.parse(checkpoint.next_allowed_at))
  ) {
    fail("INVALID_CHECKPOINT", "checkpoint next_allowed_at is invalid");
  }
  checkpoint.next_allowed_at ??= null;
  const targetIds = new Set(plan.targets.map((target) => target.id));
  for (const id of [
    ...checkpoint.completed_ids,
    ...checkpoint.protected_mutual_ids,
    ...checkpoint.retryable_ids,
  ]) {
    if (!targetIds.has(String(id))) {
      fail("INVALID_CHECKPOINT", "checkpoint contains an unknown user ID");
    }
  }
  checkpoint.completed_ids = [...new Set(checkpoint.completed_ids.map(String))];
  checkpoint.protected_mutual_ids = [
    ...new Set(checkpoint.protected_mutual_ids.map(String)),
  ];
  checkpoint.retryable_ids = [...new Set(checkpoint.retryable_ids.map(String))];
  return checkpoint;
}

function equalSets(left, right) {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

async function assertSubscriptionSnapshot(client, viewer, plan) {
  const current = await getCreatorSubscriptions(
    client,
    viewer,
    plan.source.subscription_count,
  );
  const expectedIds = new Set(plan.subscriptions.map((record) => record.id));
  const actualIds = new Set(current.subscriptions.map((record) => record.id));
  if (!equalSets(expectedIds, actualIds)) {
    fail(
      "SUBSCRIPTION_SET_CHANGED",
      "creator subscription set changed after plan creation",
      {
        expected_count: expectedIds.size,
        actual_count: actualIds.size,
      },
    );
  }
  return current;
}

export function reconcileTargetRelationships(
  plan,
  checkpoint,
  relationships,
  { revalidateFinalized = false } = {},
) {
  const completed = new Set(checkpoint.completed_ids);
  const protectedMutual = new Set(checkpoint.protected_mutual_ids);
  const retryable = new Set(checkpoint.retryable_ids);
  const ready = [];
  for (const target of plan.targets) {
    if (revalidateFinalized) {
      completed.delete(target.id);
      protectedMutual.delete(target.id);
    } else if (completed.has(target.id) || protectedMutual.has(target.id)) {
      continue;
    }
    const relationship = relationships.get(target.id);
    if (!relationship) {
      continue;
    }
    if (relationship.followed_by) {
      protectedMutual.add(target.id);
      retryable.delete(target.id);
      continue;
    }
    if (!relationship.following) {
      completed.add(target.id);
      retryable.delete(target.id);
      continue;
    }
    ready.push(target);
  }
  checkpoint.completed_ids = [...completed];
  checkpoint.protected_mutual_ids = [...protectedMutual];
  checkpoint.retryable_ids = [...retryable];
  return ready;
}

function checkpointSummary(plan, checkpoint) {
  const completed = new Set(checkpoint.completed_ids);
  const protectedMutual = new Set(checkpoint.protected_mutual_ids);
  return {
    target_count: plan.targets.length,
    completed_count: completed.size,
    protected_mutual_count: protectedMutual.size,
    pending_count: plan.targets.filter(
      (target) =>
        !completed.has(target.id) && !protectedMutual.has(target.id),
    ).length,
    retryable_count: checkpoint.retryable_ids.length,
    next_allowed_at: checkpoint.next_allowed_at,
  };
}

function assertExecutionWindow(checkpoint) {
  if (!checkpoint.next_allowed_at) {
    return;
  }
  const nextAllowed = Date.parse(checkpoint.next_allowed_at);
  if (nextAllowed > Date.now()) {
    fail("EXECUTION_WINDOW_NOT_READY", "the next write window is not ready", {
      next_allowed_at: checkpoint.next_allowed_at,
    });
  }
}

function setNextExecutionWindow(checkpoint, resetEpochSeconds) {
  const burstWindow = Date.now() + 65000;
  const rateLimitWindow = Number.isFinite(resetEpochSeconds)
    ? resetEpochSeconds * 1000 + 1000
    : 0;
  checkpoint.next_allowed_at = new Date(
    Math.max(burstWindow, rateLimitWindow),
  ).toISOString();
}

async function unfollowOne(client, userId) {
  const body = new URLSearchParams({
    include_profile_interstitial_type: "1",
    include_blocking: "1",
    include_blocked_by: "1",
    include_followed_by: "1",
    include_want_retweets: "1",
    include_mute_edge: "1",
    include_can_dm: "1",
    include_can_media_tag: "1",
    include_ext_is_blue_verified: "1",
    include_ext_verified_type: "1",
    include_ext_profile_image_shape: "1",
    skip_status: "1",
    user_id: userId,
  }).toString();
  return client.raw(
    "https://x.com/i/api/1.1/friendships/destroy.json",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://x.com",
        referer: "https://x.com/",
      },
      body,
    },
  );
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
}

async function commandViewer(options) {
  assertAllowedOptions(options, ["expected-handle", "chrome-profile"]);
  const expectedHandle = requireOption(options, "expected-handle");
  const client = await createClient(options);
  const viewer = await getViewer(client);
  assertViewer(viewer, expectedHandle);
  return { success: true, viewer };
}

async function commandCreatorSubscriptions(options) {
  assertAllowedOptions(options, [
    "expected-handle",
    "expected-subscriptions",
    "chrome-profile",
  ]);
  const expectedHandle = requireOption(options, "expected-handle");
  const expectedCount = parsePositiveInteger(
    requireOption(options, "expected-subscriptions"),
    "--expected-subscriptions",
  );
  const client = await createClient(options);
  const viewer = await getViewer(client);
  assertViewer(viewer, expectedHandle);
  const result = await getCreatorSubscriptions(client, viewer, expectedCount);
  return {
    success: true,
    viewer,
    operation: result.operation,
    count: result.subscriptions.length,
    subscriptions: result.subscriptions,
  };
}

async function commandPlan(options) {
  assertAllowedOptions(options, [
    "expected-handle",
    "expected-subscriptions",
    "output",
    "chrome-profile",
  ]);
  const expectedHandle = requireOption(options, "expected-handle");
  const expectedCount = parsePositiveInteger(
    requireOption(options, "expected-subscriptions"),
    "--expected-subscriptions",
  );
  const output = requireOption(options, "output");
  const client = await createClient(options);
  const viewer = await getViewer(client);
  assertViewer(viewer, expectedHandle);
  const subscriptionResult = await getCreatorSubscriptions(
    client,
    viewer,
    expectedCount,
  );
  const followingResult = await getFollowing(client, viewer);
  const followingIds = followingResult.ids;
  const userLookup = followingResult.users;
  const relationships = await getFriendshipRelationships(
    client,
    [...userLookup.values()],
  );
  const plan = buildPlan({
    viewer,
    subscriptions: subscriptionResult.subscriptions,
    followingIds,
    userLookup,
    relationships,
    operation: subscriptionResult.operation,
  });
  const outputPath = atomicWriteJson(output, plan);
  return {
    success: true,
    dry_run: true,
    plan_path: outputPath,
    plan_digest: plan.digest,
    viewer: plan.viewer,
    source: plan.source,
    subscriptions: plan.subscriptions,
  };
}

async function commandApply(options) {
  assertAllowedOptions(options, [
    "plan",
    "checkpoint",
    "expected-handle",
    "confirm-count",
    "max-actions",
    "execute",
    "chrome-profile",
  ]);
  const planPath = requireOption(options, "plan");
  const checkpointPath = requireOption(options, "checkpoint");
  assertDistinctFiles(planPath, checkpointPath);
  const expectedHandle = requireOption(options, "expected-handle");
  const plan = loadPlan(planPath);
  assertViewer(plan.viewer, expectedHandle);
  const checkpoint = loadCheckpoint(checkpointPath, plan);
  if (!options.execute) {
    return {
      success: true,
      dry_run: true,
      execute: false,
      viewer: plan.viewer,
      plan_digest: plan.digest,
      ...checkpointSummary(plan, checkpoint),
    };
  }
  const confirmCount = parsePositiveInteger(
    requireOption(options, "confirm-count"),
    "--confirm-count",
  );
  if (confirmCount !== plan.source.target_count) {
    fail("CONFIRM_COUNT_MISMATCH", "confirmed count does not match plan target count");
  }
  const maxActions = parsePositiveInteger(
    options["max-actions"] ?? "10",
    "--max-actions",
    10,
  );
  if (maxActions < 1) {
    fail("INVALID_OPTION", "--max-actions must be between 1 and 10");
  }
  assertExecutionWindow(checkpoint);
  const client = await createClient(options);
  const viewer = await getViewer(client);
  assertViewer(viewer, expectedHandle);
  if (viewer.id !== plan.viewer.id) {
    fail("VIEWER_MISMATCH", "viewer user ID does not match plan");
  }
  await assertSubscriptionSnapshot(client, viewer, plan);
  const completedBeforeLookup = new Set(checkpoint.completed_ids);
  const protectedBeforeLookup = new Set(checkpoint.protected_mutual_ids);
  const candidates = plan.targets
    .filter(
      (target) =>
        !completedBeforeLookup.has(target.id) &&
        !protectedBeforeLookup.has(target.id),
    )
    .slice(0, maxActions);
  const relationships = await getFriendshipRelationships(client, candidates);
  const ready = reconcileTargetRelationships(
    plan,
    checkpoint,
    relationships,
  );
  checkpoint.updated_at = new Date().toISOString();
  atomicWriteJson(checkpointPath, checkpoint);
  const completed = new Set(checkpoint.completed_ids);
  const retryable = new Set(checkpoint.retryable_ids);
  let attempted = 0;
  let successfulThisRun = 0;
  for (const target of ready) {
    if (attempted > 0) {
      await sleep(800);
    }
    if (attempted === 0) {
      setNextExecutionWindow(checkpoint);
      checkpoint.updated_at = new Date().toISOString();
      atomicWriteJson(checkpointPath, checkpoint);
    }
    const response = await unfollowOne(client, target.id);
    attempted += 1;
    checkpoint.last_rate_limit = response.rateLimit;
    checkpoint.last_status = response.status;
    checkpoint.updated_at = new Date().toISOString();
    if (response.status === 200) {
      let parsed;
      try {
        parsed = JSON.parse(response.text);
      } catch {
        fail("INVALID_X_RESPONSE", "unfollow response is invalid JSON");
      }
      if (String(parsed?.id_str ?? "") !== target.id) {
        fail("UNFOLLOW_TARGET_MISMATCH", "unfollow response user ID does not match");
      }
      completed.add(target.id);
      successfulThisRun += 1;
      retryable.delete(target.id);
      checkpoint.completed_ids = [...completed];
      checkpoint.retryable_ids = [...retryable];
      atomicWriteJson(checkpointPath, checkpoint);
      continue;
    }
    if (response.status === 401 || response.status === 403) {
      atomicWriteJson(checkpointPath, checkpoint);
      fail("AUTHORIZATION_FAILED", `X returned HTTP ${response.status}`);
    }
    if (response.status === 429) {
      retryable.add(target.id);
      checkpoint.retryable_ids = [...retryable];
      setNextExecutionWindow(checkpoint, response.rateLimit.reset);
      atomicWriteJson(checkpointPath, checkpoint);
      break;
    }
    if (response.status === 404 && successfulThisRun > 0) {
      retryable.add(target.id);
      checkpoint.retryable_ids = [...retryable];
      atomicWriteJson(checkpointPath, checkpoint);
      break;
    }
    atomicWriteJson(checkpointPath, checkpoint);
    fail("UNFOLLOW_FAILED", `unfollow returned HTTP ${response.status}`, {
      user_id: target.id,
      response: safeResponseMessage(response.text),
      rate_limit: response.rateLimit,
    });
  }
  const summary = checkpointSummary(plan, checkpoint);
  return {
    success: true,
    dry_run: false,
    execute: true,
    complete: summary.pending_count === 0,
    attempted_count: attempted,
    checkpoint_path: resolve(checkpointPath),
    last_rate_limit: checkpoint.last_rate_limit,
    ...summary,
  };
}

async function commandVerify(options) {
  assertAllowedOptions(options, [
    "plan",
    "checkpoint",
    "expected-handle",
    "chrome-profile",
  ]);
  const plan = loadPlan(requireOption(options, "plan"));
  const checkpointPath = requireOption(options, "checkpoint");
  assertDistinctFiles(options.plan, checkpointPath);
  const checkpoint = loadCheckpoint(checkpointPath, plan);
  const expectedHandle = requireOption(options, "expected-handle");
  const client = await createClient(options);
  const viewer = await getViewer(client);
  assertViewer(viewer, expectedHandle);
  if (viewer.id !== plan.viewer.id) {
    fail("VIEWER_MISMATCH", "viewer user ID does not match plan");
  }
  await assertSubscriptionSnapshot(client, viewer, plan);
  const relationships = await getFriendshipRelationships(
    client,
    plan.targets,
  );
  reconcileTargetRelationships(plan, checkpoint, relationships, {
    revalidateFinalized: true,
  });
  checkpoint.updated_at = new Date().toISOString();
  atomicWriteJson(checkpointPath, checkpoint);
  const summary = checkpointSummary(plan, checkpoint);
  return {
    success: true,
    complete: summary.pending_count === 0,
    viewer,
    remaining_target_count: summary.pending_count,
    ...summary,
  };
}

export async function run(argv) {
  const { command, options } = parseArgs(argv);
  const commands = {
    viewer: commandViewer,
    "creator-subscriptions": commandCreatorSubscriptions,
    "plan-unfollow-non-mutual-except-subscriptions": commandPlan,
    "apply-unfollow-plan": commandApply,
    "verify-unfollow-plan": commandVerify,
  };
  const handler = commands[command];
  if (!handler) {
    fail("UNKNOWN_COMMAND", `unknown command: ${command}`);
  }
  return handler(options);
}

function output(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  run(process.argv.slice(2))
    .then(output)
    .catch((error) => {
      const normalized =
        error instanceof XWebApiError
          ? {
              code: error.code,
              message: error.message,
              details: error.details,
            }
          : {
              code: "UNEXPECTED_ERROR",
              message: String(error?.message ?? error),
              details: {},
            };
      output({ success: false, error: normalized });
      process.exitCode = 1;
    });
}
