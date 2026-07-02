---
name: bluetooth-keyboard-pairing
description: Linux で Bluetooth キーボード（Apple Magic Keyboard など）を bluetoothctl でペアリングする。「Magic Keyboard を無線接続」「Bluetooth キーボードのペアリング」「bluetoothctl でペアリング」などのリクエストで使用する。
---

# Bluetooth キーボードのペアリング（Linux）

bluetoothctl で HID キーボードをペアリングする手順。DGX Spark と Magic Keyboard with Touch ID の組み合わせで検証済み。

## 前提確認

```
bluetoothctl show
rfkill list
```

Powered: yes、Soft/Hard blocked: no を確認する。

## 手順

1. キーボードを USB から抜く。USB 接続中は Bluetooth の電波を出さない
2. 電源スイッチをオフ→2〜3 秒→オンでペアリングモードに入る。ペアリングモードは短時間で切れるので、スキャン開始後に電源を入れ直すのが確実
3. bluetoothctl の対話モードで以下を実行する

```
agent KeyboardDisplay
default-agent
scan on
pair <MAC>
trust <MAC>
connect <MAC>
```

## 注意点

- agent を登録せずに一発コマンド `bluetoothctl pair <MAC>` を使うと Just Works ペアリングになり、HID キーボードは Pairing successful の直後にペアリングを解除してくる。必ず KeyboardDisplay agent を default-agent にしてから pair する
- Magic Keyboard with Touch ID は `Confirm passkey NNNNNN (yes/no)` を要求する。数秒以内に yes を返さないと `org.bluez.Error.AuthenticationCanceled` で失敗する。キーボード側での数字入力は不要
- ペアリングに失敗するとキーボードはペアリングモードから抜けるので、電源オフ→オンからやり直す
- スクリプトで自動化する場合は fifo 経由で bluetoothctl の対話モードに流し込み、ログに Confirm passkey が出たら即座に yes を送る
- 対象キーボードが唯一の入力デバイスでも、失敗したら USB を挿し直せば有線で復帰できる
- 成功時は `info <MAC>` で Paired、Bonded、Trusted、Connected がすべて yes になる
