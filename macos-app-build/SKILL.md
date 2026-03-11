---
name: macos-app-build
description: macOS ネイティブアプリのビルドと実行を行う。XcodeGen + xcodebuild のワークフロー、オートメーション権限のリセット、トラブルシューティングをカバーする。「アプリをビルドして」「実行して」「macOS アプリを作って」などのリクエストで使用する。
---

# macOS App Build

XcodeGen ベースの macOS ネイティブアプリをビルド・実行する。

## 前提条件

- Xcode がインストール済み
- XcodeGen がインストール済み（`brew install xcodegen`）
- project.yml が存在する

## ワークフロー

### Step 1: プロジェクトファイル生成

```bash
xcodegen generate
```

project.yml から .xcodeproj を生成する。

### Step 2: ビルド

```bash
xcodebuild -project PROJECT.xcodeproj -scheme SCHEME -configuration Debug build \
  KEY1="value1" \
  KEY2="value2"
```

ビルド設定（`$(VAR)` で Info.plist に展開される値）はコマンドライン引数として渡す。環境変数（`export`）では展開されない。

### Step 3: オートメーション権限リセット（AppleScript 使用時）

Safari や Chrome を AppleScript で操作するアプリの場合:

```bash
tccutil reset AppleEvents BUNDLE_ID
```

これにより、次回起動時に権限ダイアログが表示される。

### Step 4: アプリ起動

```bash
open ~/Library/Developer/Xcode/DerivedData/PROJECT-*/Build/Products/Debug/APP.app
```

## トラブルシューティング

### Entitlements file was modified during the build

```
error: Entitlements file "App.entitlements" was modified during the build
```

クリーンビルドで解決:

```bash
xcodebuild -project PROJECT.xcodeproj -scheme SCHEME clean
xcodebuild -project PROJECT.xcodeproj -scheme SCHEME -configuration Debug build ...
```

### オートメーション権限が動作しない

症状: 権限は granted だがタブ/ウィンドウが 0 件

原因: アプリ再ビルドで署名が変わり、macOS が「別のアプリ」として扱っている

解決:

```bash
tccutil reset AppleEvents BUNDLE_ID
```

アプリを再起動し、表示されるダイアログで「OK」をクリック。

### サンドボックスと AppleScript

AppleScript で他アプリを操作する場合、サンドボックスは無効にする必要がある:

```xml
<key>com.apple.security.app-sandbox</key>
<false/>
```

entitlements には以下も必要:

```xml
<key>com.apple.security.automation.apple-events</key>
<true/>
```

### Hardened Runtime と adhoc 署名

`ENABLE_HARDENED_RUNTIME: YES` + adhoc 署名（開発者証明書なし）の組み合わせだと、オートメーション権限ダイアログが表示されないことがある。

開発中は project.yml で無効化:

```yaml
settings:
  base:
    ENABLE_HARDENED_RUNTIME: NO
```

### NSAppleScript で `tab` 定数が動作しない

NSAppleScript 経由で AppleScript を実行すると、`tab` 定数がタブ文字ではなく文字列 "tab" として評価されることがある。ターミナルの `osascript` では正常動作するため発見困難。

解決策: `tab` の代わりに `ASCII character 9` を使用:

```applescript
set delim to (ASCII character 9)
set output to output & winId & delim & tabIndex & delim & title & delim & url
```

## ログ確認

アプリのログ出力先（`~/Library/Application Support/APP_NAME/`）を確認する。Console.app でシステムログも確認可能。

## 署名について

開発中はローカル署名（Sign to Run Locally）で十分。配布時は Developer ID が必要。

XcodeGen の project.yml で署名設定:

```yaml
settings:
  base:
    CODE_SIGN_IDENTITY: "-"  # ローカル署名
    # または
    CODE_SIGN_IDENTITY: "Apple Development"  # 開発証明書
```
