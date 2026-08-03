# Project Foundation

## Contents

- [Inspect Before Creating](#inspect-before-creating)
- [XcodeGen Baseline](#xcodegen-baseline)
- [New-App Decisions](#new-app-decisions)
- [Persistence](#persistence)

## Inspect Before Creating

Run the relevant read-only checks:

```bash
xcodebuild -version
xcodegen --version
xcodebuild -list -project App.xcodeproj
xcrun simctl list devices available
git status -sb
```

Inspect:

- `project.yml`, `.xcodeproj`, `.xcworkspace`, and shared schemes
- application, unit-test, and UI-test targets
- source directories and resource paths
- package dependencies and resolved versions
- Team, Bundle ID, signing style, entitlements, and capabilities
- minimum iOS version and device family
- version and build number
- privacy usage descriptions and `ITSAppUsesNonExemptEncryption`
- Mac Catalyst and Apple silicon Mac availability
- existing archives and export settings

## XcodeGen Baseline

Use `project.yml` as the project configuration source when the repository already uses XcodeGen or a new lightweight project benefits from reproducible generation.

Include:

- one iOS application target
- one unit-test target
- one UI-test target when critical flows are automatable
- a shared scheme
- Release as the archive action
- `CODE_SIGN_STYLE: Automatic`
- the confirmed development Team
- a unique Bundle ID
- `TARGETED_DEVICE_FAMILY: 1` for iPhone-only apps
- explicit `MARKETING_VERSION`
- explicit `CURRENT_PROJECT_VERSION`
- `GENERATE_INFOPLIST_FILE: YES` or a checked-in Info.plist
- only the permissions and capabilities required by implemented features
- a bundled `PrivacyInfo.xcprivacy` for every required-reason API used by app code

Keep display name, target name, product module name, scheme name, and Bundle ID distinct in the design. They may share an initial value, but changing the display name must not require changing stable identifiers.

Do not copy these from a sibling app without separate justification:

- Bundle ID
- minimum iOS version
- microphone, camera, location, photo-library, or background permissions
- memory, iCloud, push, associated-domain, or keychain entitlements
- package dependencies

If app code uses app-only `UserDefaults`, declare `NSPrivacyAccessedAPICategoryUserDefaults` with approved reason `CA92.1`. Keep tracking false, tracking domains empty, and collected data empty when the app performs none of those activities. Recheck current Apple documentation before adding or changing any required-reason API declaration.

## New-App Decisions

Before registering an App ID, confirm:

- user-facing app name
- Bundle ID
- owning Apple Developer Team
- iPhone-only or universal device family
- minimum iOS version
- required Apple capabilities
- App Store Connect display name
- primary locale
- SKU
- user access scope
- iPad compatibility behavior
- Mac Catalyst and Apple silicon Mac availability
- whether backup exclusion means only no iCloud container or exclusion from device backups

Local target and scheme names are reversible. Bundle ID registration and App Store Connect records are durable external changes.

## Persistence

Use Application Support for private durable files and temporary or cache directories only for reproducible data. Store relative filenames in the model rather than absolute sandbox paths.

For each write:

1. Write to a temporary sibling.
2. Validate the output.
3. Move it atomically to the final location.
4. Save metadata.
5. Remove partial files after any failure.

For an all-or-nothing multi-file import:

1. Copy each external item into app-owned staging while security-scoped access is valid. Coordinate document-provider reads with `NSFileCoordinator`.
2. Validate the actual file contents, not only picker filters or filename extensions.
3. Keep only one full-resolution item in memory at a time. Retain paths and lightweight metadata for ordering.
4. Use a stable selection index as the tie-breaker when sorting by embedded capture dates.
5. Produce and validate every durable page asset before metadata commit.
6. Remove fallible temporary staging before the single metadata commit.
7. Commit one project and all page metadata together.
8. Start OCR or other downstream work only after that commit succeeds.
9. On failure or cancellation, remove staging and every partial project file.

Test fresh install, relaunch, ordinary update, interrupted write, low-storage failure, manual deletion, and retention cleanup when those states apply.

Recover crash-left durable directories at launch by comparing storage against every persisted project identifier, including trashed projects. Restrict deletion to UUID-named real directories directly under the owned project root. Preserve known projects, symbolic links, plain files, non-UUID entries, transaction staging roots, and everything outside that root. Make recovery deterministic, idempotent, and nonfatal to launch, with focused boundary tests.
