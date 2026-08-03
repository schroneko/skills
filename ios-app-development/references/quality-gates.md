# Quality Gates

## Contents

- [Build Gates](#build-gates)
- [Test Gates](#test-gates)
- [Concurrency Gate](#concurrency-gate)
- [Signed Build Gate](#signed-build-gate)
- [Release Gate](#release-gate)

## Build Gates

Regenerate before building:

```bash
xcodegen generate
```

Run an unsigned generic build to separate source failures from signing failures:

```bash
xcodebuild -project App.xcodeproj -scheme App -configuration Debug -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
xcodebuild -project App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build
```

Keep test coverage enabled on the test action, but explicitly set `ENABLE_CODE_COVERAGE = NO` for Release. A scheme with coverage enabled can otherwise produce an instrumented Release binary even when running a normal build. Confirm the Release compile command does not contain `-profile-generate` or `-profile-coverage-mapping`.

Run tests against an available simulator:

```bash
xcodebuild -project App.xcodeproj -scheme App -destination 'platform=iOS Simulator,id=SIMULATOR_UDID' test
```

Select a simulator that actually exists on the machine by UDID. Device names may not be unique across installed runtimes.

Standalone source type-checking is a fast diagnostic, not a build gate. Xcode may add strict-concurrency, macro, module, generated-project, and test-host conditions that a direct `swiftc` invocation does not reproduce.

## Test Gates

Cover behavior with the highest expected loss when it fails:

- core transformations and domain calculations
- persistence, migrations, retention, and deletion
- permission denied, cancellation, and interrupted operations
- import and export fidelity
- backgrounding and relaunch during work
- malformed, empty, very large, and low-quality inputs
- callbacks invoked from non-main queues
- upgrade from the previously distributed build

Do not move SwiftData or other actor-bound model objects through a nonisolated async helper in tests. Snapshot the required identifiers, relative paths, and scalar values on the owning actor, then perform asynchronous file or service work with those `Sendable` values.

Keep Swift Testing macro expressions simple. Current Swift toolchains can infer a throwing closure for nested key-path expressions such as `allSatisfy(\.nested.property)` inside `#expect`. Compute mapped values or predicates first with an explicit closure, then pass the resulting value to the macro. Do not weaken the asserted behavior to work around a macro diagnostic.

For searchable PDF export, verify extraction with the platform PDF reader instead of checking only visual output or PDF creation. Include exact-match tests for long manually edited OCR text. Fit the actual font size to each OCR rectangle and avoid nonuniform text transforms that can change extraction spacing.

Before searchable export, evaluate OCR readiness only for the selected page range. Completed and review-required OCR can carry searchable text; queued, processing, failed, and never-started pages require a clear choice to wait or export with incomplete searchability. Do not block image-only export formats on OCR state.

For UI tests:

- assign stable accessibility identifiers at workflow boundaries
- query by identifier without assuming SwiftUI exposes a fixed element type across OS versions
- wait for asynchronous presentations and state transitions
- inspect the recorded accessibility hierarchy in the `.xcresult` before changing app code
- distinguish a missing element from a present element queried as the wrong type
- test both automatic success and required-manual-correction paths for precision workflows
- stop camera and other critical sessions from explicit cancel, finish, and completion paths instead of relying only on SwiftUI `onDisappear` during chained presentations

Use result-bundle evidence:

```bash
xcrun xcresulttool get test-results summary --path Test.xcresult
xcrun xcresulttool get test-results activities --path Test.xcresult --test-id 'Target/TestName()'
```

For high-accuracy apps, use a versioned evaluation corpus. Keep source images, expected outputs, scoring rules, exclusions, and device or OS metadata stable. Report median, percentile, and worst-case results rather than a single aggregate.

A numeric accuracy target is not testable until the corpus, normalization, metric formula, language or input strata, device and OS, percentile reporting, and pass threshold are recorded.

Live camera acceptance requires a physical iPhone. Simulator UI tests must use an injected camera double.

Treat TestFlight screenshots and written feedback as release evidence. Record the exact app build, device, OS, and affected workflow. For a core-output defect such as wrong orientation, missing page boundaries, or background retained as document content, block the replacement build until the defect has a deterministic regression test and the corrected path passes on the reported OS family.

## Concurrency Gate

Swift 6 isolation violations may appear only on a physical device or optimized Release build. For closures received by AVFoundation, Vision, VisionKit, Core ML, C APIs, delegates, or custom queues:

- define the intended executor explicitly
- avoid capturing main-actor-isolated state from an arbitrary callback
- make transferred closures and values `Sendable` where correct
- add a regression test that invokes the callback from a non-main queue
- inspect the Release binary or crash log when runtime isolation checks are implicated

## Signed Build Gate

A signed device build proves only that compilation and provisioning succeeded. Record separately:

- target device and OS
- Team and profile
- Bundle ID
- install result
- launch result
- primary workflow result
- crash or device-console evidence

Do not trigger visible app launches, device input, or focus changes without authorization under the active environment instructions.

## Release Gate

Before upload, require:

- all required tests pass
- no unresolved release-blocking warnings
- a unique build number
- correct version and Bundle ID
- correct privacy descriptions and entitlements
- a compiled 1024 by 1024 app icon without alpha
- generated Info.plist evidence for display name, minimum OS, device family, encryption declaration, and usage descriptions
- an inventory of embedded frameworks and packages, including any required privacy manifests
- Release archive success
- archive metadata and signature inspection
- a matching App Store Connect app record

After upload, require separate evidence for Apple processing, internal tester assignment, TestFlight visibility, installation, launch, and data-preserving update behavior.
