---
name: homebrew-self-tap
description: 自作 macOS アプリを Homebrew の 1 コマンドでインストール可能にする。アプリのリポジトリ自体を homebrew-<名前> にリネームして cask と GitHub Releases を同居させる self-tap 方式のセットアップと、バージョン更新、旧 tap からの移行をカバーする。「Homebrew で配布したい」「brew install できるようにして」「cask を作って」「tap を設定して」などのリクエストで使用する。
---

# Homebrew Self-Tap

自作 macOS アプリを、tap 専用リポジトリを増やさずに `brew install` の 1 コマンドで配布する。

## 方針

- アプリごとに独立したリポジトリを維持する。cask を集約する homebrew-tap リポジトリは使わない
- リポジトリ名を `homebrew-<短い名前>` にする。`brew install --cask user/<短い名前>/<トークン>` の自動 tap は GitHub の `homebrew-<短い名前>` という名前のリポジトリだけを探すため、このリネームが 1 コマンド化の必須条件
- cask 定義 `Casks/<トークン>.rb` とバイナリ zip（GitHub Releases）をアプリのリポジトリ自身に置く
- 名前は nicevoice、exbright のような小文字 1 語に揃える。リポジトリ名、cask トークン、インストールコマンドすべてに使う

導入例:

- `schroneko/homebrew-exbright` → `brew install --cask schroneko/exbright/exbright`
- `schroneko/homebrew-nicevoice` → `brew install --cask schroneko/nicevoice/nicevoice`

## 新規セットアップ

### Step 1: リポジトリのリネーム

```bash
gh repo rename homebrew-NAME -R OWNER/OLD-REPO --yes
git -C LOCAL_DIR remote set-url origin git@github.com:OWNER/homebrew-NAME.git
mv LOCAL_DIR GHQ_ROOT/github.com/OWNER/homebrew-NAME
```

GitHub は旧 URL からリダイレクトするため既存リンクは壊れないが、cask とスクリプト内の URL は新名に更新する。

### Step 2: zip の作成とリリース公開

```bash
ditto -c -k --keepParent PATH/TO/App.app App-VERSION.zip
shasum -a 256 App-VERSION.zip
gh release create vVERSION -R OWNER/homebrew-NAME --title "App VERSION" --notes "..." App-VERSION.zip
```

### Step 3: cask の作成

`Casks/NAME.rb` をリポジトリ直下に置く。

```ruby
cask "NAME" do
  version "1.0.0"
  sha256 "SHA256_OF_ZIP"

  url "https://github.com/OWNER/homebrew-NAME/releases/download/v#{version}/App-#{version}.zip"
  name "AppName"
  desc "One-line description"
  homepage "https://github.com/OWNER/homebrew-NAME"

  app "App.app"

  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "/Applications/App.app"],
                   sudo: false
  end

  uninstall quit: "BUNDLE_IDENTIFIER"

  zap trash: [
    "~/Library/Preferences/BUNDLE_IDENTIFIER.plist",
  ]
end
```

- `postflight` の quarantine 除去は ad-hoc 署名または未 notarize のアプリに必要。Developer ID 署名 + notarization 済みなら省略してよい
- README のインストール手順も `brew install --cask OWNER/NAME/NAME` に更新する

### Step 4: 検証

```bash
brew install --cask OWNER/NAME/NAME
```

tap の登録と trust は install 時に自動で行われる。`/Applications` への配置とアプリのバージョンを確認する。

## バージョン更新

1. 新しい zip を作成して sha256 を計算する
2. `gh release create vNEW_VERSION ...` で公開する
3. `Casks/NAME.rb` の `version` と `sha256` を書き換えて commit、push する
4. 利用者は `brew upgrade --cask NAME` で更新できる

リポジトリ内に release スクリプトがある場合は、cask 更新とリリース作成を同一リポジトリ内で完結させる形に書く。実例は `schroneko/homebrew-nicevoice` の `Scripts/release.sh`。

## 旧 tap からの移行

旧 tap（URL 指定 tap や削除済み homebrew-tap 経由）でインストール済みのマシンでは、次の順で入れ替える。

```bash
osascript -e 'tell application "AppName" to quit'
brew uninstall --cask OWNER/OLD-TAP/NAME
brew untap OWNER/OLD-TAP
brew install --cask OWNER/NAME/NAME
```

## 注意点

- `brew tap OWNER/NAME` の短縮形に homebrew- プレフィックスなしのリポジトリは使えない。URL 指定 tap は 2 コマンドになるため採用しない
- 近年の Homebrew はサードパーティ tap に trust 機構があり、未 trust の tap の cask は無視される。`brew install` 時の自動 trust で通常は解決するが、既存 tap で警告が出たら `brew trust --cask OWNER/TAP/NAME` を案内する
- `brew tap` はリポジトリを丸ごと clone するため、アプリのソースも利用者に落ちる。リポジトリが巨大な場合はサイズに注意する
- cask の `url` はリネーム後の正式リポジトリ名を指す。旧名 URL もリダイレクトで動くが、正式名に揃える
