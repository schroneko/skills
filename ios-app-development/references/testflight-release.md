# TestFlight Release

## Contents

- [Preconditions](#preconditions)
- [Export Configuration](#export-configuration)
- [Archive](#archive)
- [Inspect The Archive](#inspect-the-archive)
- [Upload](#upload)
- [Verify Apple Processing](#verify-apple-processing)
- [Completion Evidence](#completion-evidence)

## Preconditions

Confirm:

- the Apple Developer Program agreement is active
- Xcode is signed in to the intended Team
- the explicit App ID exists
- the App Store Connect app record exists
- the record uses the archive's Bundle ID
- the App Store Connect display name, primary locale, SKU, and user access are correct
- the marketing version is correct
- the build number has never been uploaded for that version
- an internal tester group and intended tester exist
- export-compliance metadata is correct

Creating the App ID and app record is an external mutation. Confirm final identifiers immediately before creating them.

A missing App Store Connect record can surface during export as `Error Downloading App Information`. Diagnose record existence before changing signing.

## Export Configuration

Use an export options plist equivalent to:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>destination</key>
    <string>upload</string>
    <key>manageAppVersionAndBuildNumber</key>
    <false/>
    <key>method</key>
    <string>app-store-connect</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>stripSwiftSymbols</key>
    <true/>
    <key>teamID</key>
    <string>TEAM_ID</string>
    <key>uploadSymbols</key>
    <true/>
</dict>
</plist>
```

Keep the Team ID app-specific. Do not store credentials in this plist.

## Archive

Use a fresh archive path and derived-data path:

```bash
xcodebuild -project App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' -archivePath build/App-TestFlight-1.xcarchive -derivedDataPath build/AppArchiveDerivedData-1 archive
```

Add `-onlyUsePackageVersionsFromResolvedFile` when the project commits and maintains resolved package versions.

If the approved authentication mechanism supplies an App Store Connect key to Xcode, use Xcode's `-authenticationKeyPath`, `-authenticationKeyID`, and `-authenticationKeyIssuerID` options without printing their values. Otherwise use the signed-in Xcode account and managed signing.

`-allowProvisioningUpdates` may create or update Apple signing resources. Add it only after authorization for that external mutation.

Use `-skipPackagePluginValidation` only for a repository-documented and reviewed package plugin whose validation failure has been diagnosed.

With automatic signing, archive signing and export signing are separate. Do not reject an archive only because it contains a development or wildcard profile. Verify export or upload distribution evidence separately.

Do not treat the absence of a local `Apple Distribution` identity in `security find-identity` as conclusive when the established release path uses Xcode automatic signing. Xcode may use cloud-managed distribution signing. The signed archive, export log, and App Store Connect processing result are the authoritative evidence.

## Inspect The Archive

Inspect the archive before upload:

```bash
plutil -p build/App-TestFlight-1.xcarchive/Info.plist
codesign --verify --deep --strict build/App-TestFlight-1.xcarchive/Products/Applications/App.app
codesign -d --entitlements :- build/App-TestFlight-1.xcarchive/Products/Applications/App.app
```

Verify:

- application path and scheme
- marketing version and build number
- Bundle ID
- Team and signing identity
- embedded provisioning profile
- arm64 architecture
- entitlements
- dSYM presence

## Upload

Export with `destination: upload`:

```bash
xcodebuild -exportArchive -archivePath build/App-TestFlight-1.xcarchive -exportPath build/App-TestFlight-1-export -exportOptionsPlist build/ExportOptions.plist
```

Apply the same approved Xcode authentication options used for archive when required.

Add `-allowProvisioningUpdates` only under the same authorized condition used for archive.

With `destination: upload`, a successful command may not leave the requested export directory or a durable IPA. Preserve the archive and the generated `.xcdistributionlogs`; use the provisioning and pipeline logs to confirm the App Store profile, distribution identity, entitlements, and upload outcome.

Treat the command's upload success as one state only.

## Verify Apple Processing

Use App Store Connect or its documented API to confirm the uploaded build appears and reaches a valid processing state. Keep API credentials in the approved secret mechanism and redact sensitive output.

If direct App Store Connect sign-in has expired but `developer.apple.com/account` is already authenticated for the intended Team, open the visible App Store Connect link under Program Resources. Its Apple-provided session-switch URL transfers the active Developer account session into App Store Connect. Read and use the link's exact `href`; do not construct the Team URL manually or retrieve saved passwords.

Then:

1. Assign the build to the intended internal tester group.
2. Read the relationship back to confirm assignment.
3. Confirm the group contains the intended tester.
4. Confirm the tester can see or install the build in TestFlight.
5. Run the primary workflow from the TestFlight build.
6. Install the next build over the previous one and confirm user data survives.

Internal TestFlight invitation and public external-testing links are different mechanisms. Do not promise a public join link for internal testing.

Decide internal-group automatic distribution deliberately when creating the group. App Store Connect currently treats that choice as immutable for the group. Creating the group and adding its testers while a first build is processing can shorten the path to availability, but still verify the build relationship after processing.

For a strictly iPhone-only release, inspect the internal group's compatibility-testing settings too. `TARGETED_DEVICE_FAMILY = 1` limits the binary's device family, but App Store Connect can still make an iPhone app available on Apple silicon Macs and Apple Vision Pro. Disable both compatibility paths and read the settings back before declaring the distribution iPhone-only.

For a first-ever build, record update retention as not applicable and require it for the next distributed build.

## Completion Evidence

Record:

- app version and build number
- App Store Connect build identifier
- upload timestamp
- Apple processing state
- internal group assignment
- tester count without exposing identities
- install and launch result
- primary workflow result
- update and data-retention result

Do not report the release complete until all user-requested states are confirmed.
