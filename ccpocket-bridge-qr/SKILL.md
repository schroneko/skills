---
name: ccpocket-bridge-qr
description: ccpocket bridge の QR コードを再発行し、LaunchAgent バックグラウンド起動、Tailscale/LAN URL 切り替え、EADDRINUSE の解消を行う。「ccpocket の QR を出して」「bridge をバックグラウンド起動」「Tailscale で ccpocket 接続」「8765 が使われている」などのリクエストで使用する。
---

# ccpocket Bridge QR

ccpocket bridge を macOS LaunchAgent でバックグラウンド起動し、ユーザーが読み取る QR だけを残して必要な作業を自動で行う。

## 原則

- ユーザーに依頼する作業は QR の読み取りだけにする。
- `192.168.x.x` はローカル LAN 用。Tailscale 接続では `100.x.x.x` の Tailscale IP を優先する。
- `EADDRINUSE: 0.0.0.0:8765` は既存 bridge または LaunchAgent が port 8765 を使っている状態として扱う。
- QR は bridge 起動時にだけ出る。再発行は `BRIDGE_PUBLIC_WS_URL` を設定して bridge を再起動する。
- `launchctl` の user domain は `gui/$(id -u)` を使う。UID を推測しない。

## よく使うパス

```text
~/Library/LaunchAgents/com.ccpocket.bridge.plist
/tmp/ccpocket-bridge.log
/tmp/ccpocket-bridge.err
```

作業用の QR 画像は現在の workspace 直下へ作成する。

## ワークフロー

### Step 1: 状態確認

```bash
lsof -nP -iTCP:8765 -sTCP:LISTEN
```

```bash
launchctl list
```

`launchctl list` の結果から `com.ccpocket.bridge` を探す。LaunchAgent がある場合は以下も確認する。

```bash
launchctl print gui/$(id -u)/com.ccpocket.bridge
```

```bash
sed -n '1,220p' ~/Library/LaunchAgents/com.ccpocket.bridge.plist
```

### Step 2: 接続 URL を決める

Tailscale 用なら `tailscale ip -4` を優先する。

```bash
tailscale ip -4
```

`tailscale` コマンドが使えない場合、bridge ログや `ifconfig` から `100.x.x.x` の IPv4 を探す。

LAN 用なら `192.168.x.x` などの同一ネットワークから届く IPv4 を使う。

接続 URL の形:

```text
ws://IP_ADDRESS:8765
```

### Step 3: LaunchAgent に URL を明示

`~/Library/LaunchAgents/com.ccpocket.bridge.plist` がない場合は、まず bridge の標準 setup を使う。

```bash
npx @ccpocket/bridge@latest setup
```

既存 plist に `BRIDGE_PUBLIC_WS_URL` がなければ追加する。

```bash
/usr/libexec/PlistBuddy -c "Add :EnvironmentVariables:BRIDGE_PUBLIC_WS_URL string ws://IP_ADDRESS:8765" ~/Library/LaunchAgents/com.ccpocket.bridge.plist
```

すでにある場合は更新する。

```bash
/usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:BRIDGE_PUBLIC_WS_URL ws://IP_ADDRESS:8765" ~/Library/LaunchAgents/com.ccpocket.bridge.plist
```

### Step 4: LaunchAgent を再読み込み

古い inherited environment が残ることがあるため、`kickstart` だけで済ませず `bootout` してから `bootstrap` する。

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.ccpocket.bridge.plist
```

`bootout` が「service not loaded」系で失敗しても、次の `bootstrap` に進んでよい。

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.ccpocket.bridge.plist
```

### Step 5: 起動確認

```bash
lsof -nP -iTCP:8765 -sTCP:LISTEN
```

```bash
tail -n 90 /tmp/ccpocket-bridge.log
```

ログで以下を確認する。

- `Ready. Listening on http://0.0.0.0:8765`
- `Public: ws://IP_ADDRESS:8765`
- `Deep Link: ccpocket://connect?url=...`
- `Scan QR code with ccpocket app:`

`Public` が古い URL のままなら plist の `EnvironmentVariables` と `launchctl print gui/$(id -u)/com.ccpocket.bridge` を見直し、Step 3 からやり直す。

### Step 6: QR 画像を作る

ターミナル QR が読みにくい場合、同じ Deep Link で PNG を workspace に作る。

```bash
node -e "require('qrcode').toFile('ccpocket-qr.png','ccpocket://connect?url=ENCODED_WS_URL',{margin:2,width:512})"
```

`qrcode` がカレントから解決できない場合は、bridge の npm cache 内にある `qrcode` を使う。場所は `pgrep -af ccpocket-bridge` や `ps` で bridge 実体を確認してから決める。

## 報告

完了報告には以下だけを簡潔に含める。

- bridge が port 8765 で起動中であること
- QR が指している URL
- QR 画像を作った場合は Markdown 画像リンク
- ログ確認コマンド

ユーザーに `launchctl`、`kill`、`npx` を実行させる案内で終わらない。
