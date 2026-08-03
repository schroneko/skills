---
name: ios-app-development
description: Build, repair, verify, and distribute native iPhone apps from requirements through internal TestFlight. Use for Swift or SwiftUI iOS projects, XcodeGen setup, signing, device validation, App Store Connect records, TestFlight uploads, tester assignment, release troubleshooting, and reusable development-process improvements.
---

# iOS App Development

## Purpose

Take an iPhone app from local requirements to a verified internal TestFlight build. Treat implementation, signing, upload, Apple processing, tester assignment, and device installation as separate states with separate evidence.

## Core Rules

- Read repository instructions, requirements, project configuration, and release artifacts before declaring a blocker.
- Inspect a known successful app from the same owner when one exists. Reuse its account, signing, and release pattern without copying app-specific identifiers, entitlements, permissions, dependencies, or deployment targets.
- Keep the product display name separate from stable internal target and scheme names when renaming would create needless release risk.
- Set `TARGETED_DEVICE_FAMILY: 1` for iPhone-only apps.
- Choose the minimum iOS version from required APIs and intended users. Do not copy another app's deployment target without evidence.
- Keep the app functional without an account unless account-backed behavior is an explicit requirement.
- Store secrets only through the repository's approved secret mechanism. Never print tokens, private keys, tester addresses, or account credentials.
- Do not claim TestFlight completion from a successful archive or upload alone.
- Do not commit or push unless the user has authorized it under the active repository instructions.

## Start With Evidence

1. Read the local specification and classify decisions as confirmed, provisional, or absent.
2. Inspect the current project, Git state, installed Xcode, XcodeGen, schemes, signing settings, connected devices, and existing release artifacts.
3. Inspect a successful sibling app when available. Record only the generalizable facts.
4. Identify external choices that become durable, especially the Bundle ID and App Store Connect app record.
5. Continue with reversible local work while durable choices remain open. Confirm final values immediately before registering them externally.
6. Reconcile conflicting requirements into one named release contract. Record each conflict, chosen scope, and acceptance evidence instead of letting document order decide.
7. Identify product claims that depend on unproven algorithms, models, datasets, or device behavior. Run a bounded feasibility spike with explicit pass and fail criteria before building production architecture around them.

For a new or regenerated project, read [project-foundation.md](references/project-foundation.md).

## Build In Vertical Slices

1. Establish the app shell, persistence boundary, and the primary user workflow.
2. Add one complete user-visible slice at a time, including its error, cancellation, empty, and recovery states.
3. Keep framework adapters behind narrow interfaces so domain behavior can be tested without camera, network, StoreKit, or device hardware.
4. Make file writes transactional. Persist metadata only after the corresponding files are durable, and clean up partial outputs after failure.
5. Add permissions only when the implemented feature needs them. Include precise usage descriptions.
6. Preserve user data across ordinary upgrades. Add migration or compatibility tests before changing stored formats.
7. Prefer Apple frameworks and existing project dependencies. Add a third-party package only when it supplies material domain capability that would be unsafe or wasteful to recreate.
8. For imaging features that alter document geometry or hidden content, separate deterministic transforms from inferred reconstruction. Never present generated text, symbols, or diagrams as recovered source content.

For precision camera, document, and image-restoration work, read [precision-imaging.md](references/precision-imaging.md).

## Validate In Layers

Use the smallest useful check first, then broaden the evidence:

1. Regenerate the Xcode project from its source configuration.
2. Run an unsigned generic iOS build.
3. Run focused unit tests.
4. Run the full unit-test suite.
5. Run UI tests for critical flows when they can be deterministic.
6. Build with signing for a physical iPhone.
7. Archive the exact Release configuration intended for upload.
8. Inspect the archive metadata, embedded profile, entitlements, signature, version, build number, Bundle ID, architecture, and symbols.
9. Install and exercise the signed or TestFlight build on a real device when user authorization and device access permit it.

Read [quality-gates.md](references/quality-gates.md) before declaring implementation or release readiness.

## Release Through TestFlight

Read [testflight-release.md](references/testflight-release.md) before any App Store Connect mutation or upload.

The release state machine is:

1. Unsigned local Release build passes.
2. Durable product identifiers and App Store Connect metadata are confirmed.
3. Explicit App ID exists.
4. App Store Connect app record exists and matches the Bundle ID.
5. Signed archive succeeds.
6. Archive inspection passes.
7. Upload succeeds.
8. Apple processing reaches a valid state.
9. The build is assigned to the intended internal tester group.
10. The intended tester can see or install the build in TestFlight.
11. The TestFlight build passes its primary workflow.
12. A later distributed build preserves data from the previous build. Record this as not applicable for a first-ever build.

Do not collapse these states. Report the last confirmed state and the exact evidence for it.

## Diagnose By Layer

Classify failures before changing code:

- Source or test failure
- Generated Xcode project failure
- package-resolution failure
- compiler or linker failure
- entitlement or permission failure
- certificate, profile, or Team mismatch
- archive metadata failure
- missing App ID or App Store Connect record
- upload transport failure
- Apple processing rejection
- tester-group assignment failure
- device installation or launch failure
- runtime crash or data migration failure

Do not treat a device support image issue, delayed Apple crash report, or App Store Connect processing delay as an app defect without supporting evidence.

For Swift 6 code crossing system callbacks, closures, delegates, audio or camera queues, or C APIs, test execution away from the main actor. Treat an actor-isolation crash as a release blocker even when simulator tests pass.

## Improve This Skill During Real Work

After each material success or failure:

1. Capture the observed symptom, confirmed layer, root cause, successful correction, and proof.
2. Decide whether the lesson applies to more than one app.
3. Add only reproducible, generalizable guidance to this skill or its references.
4. Keep app names, Bundle IDs, Team IDs, App Store Connect IDs, tester identities, credentials, and one-off workarounds out of the skill.
5. Re-run skill validation.
6. Forward-test the changed skill against a realistic iPhone app request.

Remove guidance that is contradicted by a later verified workflow. Keep the skill compact and route detailed commands to references.
