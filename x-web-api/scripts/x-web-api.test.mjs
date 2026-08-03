import assert from "node:assert/strict";
import { createCipheriv, createHash } from "node:crypto";
import test from "node:test";
import {
  buildPlan,
  computePlanDigest,
  decryptChromeCookie,
  deriveChromeKey,
  extractInitialState,
  extractOperationMetadata,
  extractTimelineUsers,
  parseArgs,
  reconcileTargetRelationships,
  validatePlan,
  XWebApiError,
} from "./x-web-api.mjs";

test("decryptChromeCookie validates the v24 host hash", () => {
  const password = "fixture-password";
  const hostKey = ".x.com";
  const value = "fixture-cookie";
  const plaintext = Buffer.concat([
    createHash("sha256").update(hostKey).digest(),
    Buffer.from(value),
  ]);
  const cipher = createCipheriv(
    "aes-128-cbc",
    deriveChromeKey(password),
    Buffer.alloc(16, 0x20),
  );
  const encryptedValue = Buffer.concat([
    Buffer.from("v10"),
    cipher.update(plaintext),
    cipher.final(),
  ]);
  assert.equal(
    decryptChromeCookie({
      encryptedValue,
      hostKey,
      password,
      databaseVersion: 24,
    }),
    value,
  );
  assert.throws(
    () =>
      decryptChromeCookie({
        encryptedValue,
        hostKey: "x.com",
        password,
        databaseVersion: 24,
      }),
    (error) =>
      error instanceof XWebApiError && error.code === "COOKIE_HOST_MISMATCH",
  );
});

test("extractOperationMetadata reads current bundle metadata", () => {
  const bundle =
    '1(e){e.exports={queryId:"query-id",operationName:"UserCreatorSubscriptions",operationType:"query",metadata:{featureSwitches:["one","two"],fieldToggles:["three"]}}}';
  assert.deepEqual(
    extractOperationMetadata(bundle, "UserCreatorSubscriptions"),
    {
      queryId: "query-id",
      operationName: "UserCreatorSubscriptions",
      featureSwitches: ["one", "two"],
      fieldToggles: ["three"],
    },
  );
});

test("extractInitialState reads embedded JSON", () => {
  const html =
    '<script>window.__INITIAL_STATE__={"featureSwitch":{"defaultConfig":{"one":{"value":true}}}};window.__META_DATA__={}</script>';
  assert.deepEqual(extractInitialState(html), {
    featureSwitch: { defaultConfig: { one: { value: true } } },
  });
});

test("extractTimelineUsers returns users and bottom cursor", () => {
  const timeline = {
    instructions: [
      {
        entries: [
          {
            content: {
              itemContent: {
                user_results: {
                  result: {
                    __typename: "User",
                    rest_id: "10",
                    core: { screen_name: "alice", name: "Alice" },
                    affiliates_highlighted_label: {
                      user: {
                        __typename: "User",
                        rest_id: "99",
                        core: { screen_name: "decoy", name: "Decoy" },
                      },
                    },
                  },
                },
              },
            },
          },
          {
            content: {
              cursorType: "Bottom",
              value: "next",
            },
          },
        ],
      },
    ],
  };
  assert.deepEqual(extractTimelineUsers(timeline), {
    users: [
      {
        id: "10",
        handle: "alice",
        name: "Alice",
        url: "https://x.com/alice",
      },
    ],
    bottomCursor: "next",
  });
});

test("extractTimelineUsers reads module items without nested decoys", () => {
  const timeline = {
    instructions: [
      {
        entries: [
          {
            content: {
              items: [
                {
                  item: {
                    itemContent: {
                      user_results: {
                        result: {
                          __typename: "User",
                          rest_id: "20",
                          core: { screen_name: "module_user", name: "Module User" },
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
  assert.deepEqual(extractTimelineUsers(timeline), {
    users: [
      {
        id: "20",
        handle: "module_user",
        name: "Module User",
        url: "https://x.com/module_user",
      },
    ],
    bottomCursor: null,
  });
});

test("buildPlan targets only non-mutual non-subscription follows", () => {
  const viewer = {
    id: "1",
    handle: "viewer",
    name: "Viewer",
    url: "https://x.com/viewer",
  };
  const subscriptions = [
    {
      id: "2",
      handle: "kept",
      name: "Kept",
      url: "https://x.com/kept",
    },
    {
      id: "4",
      handle: "not_followed",
      name: "Not Followed",
      url: "https://x.com/not_followed",
    },
  ];
  const userLookup = new Map([
    [
      "3",
      {
        id: "3",
        handle: "removed",
        name: "Removed",
        url: "https://x.com/removed",
      },
    ],
  ]);
  const relationships = new Map([
    [
      "2",
      {
        id: "2",
        following: true,
        followed_by: false,
        connections: ["following"],
      },
    ],
    [
      "3",
      {
        id: "3",
        following: true,
        followed_by: false,
        connections: ["following"],
      },
    ],
    [
      "5",
      {
        id: "5",
        following: true,
        followed_by: true,
        connections: ["following", "followed_by"],
      },
    ],
  ]);
  const plan = buildPlan({
    viewer,
    subscriptions,
    followingIds: ["2", "3", "5"],
    userLookup,
    relationships,
    operation: {
      name: "UserCreatorSubscriptions",
      query_id: "query-id",
    },
    relationshipCheckedAt: "2026-07-31T00:00:00.000Z",
    createdAt: "2026-07-31T00:00:00.000Z",
  });
  assert.equal(plan.source.subscription_count, 2);
  assert.equal(plan.source.following_count, 3);
  assert.equal(plan.source.mutual_count, 1);
  assert.equal(plan.source.unilateral_count, 2);
  assert.equal(plan.source.retained_subscription_count, 1);
  assert.equal(plan.source.retained_unilateral_subscription_count, 1);
  assert.equal(plan.source.target_count, 1);
  assert.equal(plan.source.unresolved_target_count, 0);
  assert.deepEqual(plan.targets.map((target) => target.id), ["3"]);
  assert.equal(plan.targets[0].relationship.followed_by, false);
  assert.equal(plan.digest, computePlanDigest(plan));
  assert.equal(validatePlan(plan), plan);
  const tampered = structuredClone(plan);
  tampered.targets[0].id = "9";
  assert.throws(
    () => validatePlan(tampered),
    (error) =>
      error instanceof XWebApiError && error.code === "PLAN_DIGEST_MISMATCH",
  );
});

test("parseArgs keeps execution opt-in", () => {
  assert.deepEqual(
    parseArgs([
      "apply-unfollow-plan",
      "--plan",
      "/tmp/plan.json",
      "--execute",
    ]),
    {
      command: "apply-unfollow-plan",
      options: {
        plan: "/tmp/plan.json",
        execute: true,
      },
    },
  );
});

test("reconcileTargetRelationships revalidates finalized targets", () => {
  const plan = {
    targets: [
      { id: "1" },
      { id: "2" },
      { id: "3" },
    ],
  };
  const checkpoint = {
    completed_ids: ["1"],
    protected_mutual_ids: ["2"],
    retryable_ids: ["2"],
  };
  const relationships = new Map([
    [
      "1",
      {
        id: "1",
        following: true,
        followed_by: false,
      },
    ],
    [
      "2",
      {
        id: "2",
        following: false,
        followed_by: false,
      },
    ],
    [
      "3",
      {
        id: "3",
        following: true,
        followed_by: true,
      },
    ],
  ]);
  const ready = reconcileTargetRelationships(
    plan,
    checkpoint,
    relationships,
    { revalidateFinalized: true },
  );
  assert.deepEqual(ready.map((target) => target.id), ["1"]);
  assert.deepEqual(checkpoint.completed_ids, ["2"]);
  assert.deepEqual(checkpoint.protected_mutual_ids, ["3"]);
  assert.deepEqual(checkpoint.retryable_ids, []);
});
