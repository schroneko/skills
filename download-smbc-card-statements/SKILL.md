---
name: download-smbc-card-statements
description: SMBC 三井住友カード Vpass の Web 明細ページから、ログイン済み Chrome タブを使ってカード別ディレクトリへ直接ダウンロード可能な CSV 明細を保存する。クレジットカード明細、SMBC カード明細、Vpass 明細、三井住友カードの利用明細を取得・整理したい場合に使用する。
---

# Download SMBC Card Statements

## Purpose

SMBC 三井住友カード Vpass の Web 明細から、サイトが直接提供する CSV 明細だけを保存する。

この skill はログイン済み Chrome タブを前提にする。パスワード、ワンタイムコード、認証情報は入力しない。

## Safety Rules

- 明細本文、金額、店名、カード番号、個人名を会話に出さない
- `Page.printToPDF` やブラウザ印刷による PDF 生成は使わない
- サイトが直接ダウンロードした CSV/PDF だけ保存する
- 保存先はカード別ディレクトリに分ける
- 作業後に一時フォルダと Downloads に CSV の取り残しがないか確認する
- 認証、CAPTCHA、追加確認、ログイン切れが出たらユーザーに操作を依頼して止まる

## Preconditions

1. Chrome で Vpass にログイン済みであること。
2. SMBC Web 明細ページが Chrome タブで開いていること。
3. Chrome DevTools MCP または Chrome DevTools Protocol autoConnect が使えること。

入口 URL:

```text
https://www.smbc-card.com/memx/web_meisai/top/index.html?dk=hp_005_0021918_hd
```

## Recommended Workflow

1. `mcp__chrome_devtools__list_pages` で SMBC タブがあるか確認する。
2. なければユーザーに Chrome で Vpass 明細ページを開いてもらう。
3. 保存先ルートを決める。標準は次の形:

```text
/Users/username/My Drive/クレジットカード明細
```

4. 同梱スクリプトで CSV を取得する。

```bash
node /Users/username/ghq/github.com/schroneko/skills/download-smbc-card-statements/scripts/download-smbc-card-statements.mjs --target-dir "/Users/username/My Drive/クレジットカード明細" --card all
```

カードを片方だけ取得する場合:

```bash
node /Users/username/ghq/github.com/schroneko/skills/download-smbc-card-statements/scripts/download-smbc-card-statements.mjs --target-dir "/Users/username/My Drive/クレジットカード明細" --card smbc-gold-v-nl
```

```bash
node /Users/username/ghq/github.com/schroneko/skills/download-smbc-card-statements/scripts/download-smbc-card-statements.mjs --target-dir "/Users/username/My Drive/クレジットカード明細" --card smbc-owners-v-g
```

特定月だけ再試行する場合:

```bash
node /Users/username/ghq/github.com/schroneko/skills/download-smbc-card-statements/scripts/download-smbc-card-statements.mjs --target-dir "/Users/username/My Drive/クレジットカード明細" --card smbc-owners-v-g --months 202608,202607
```

## Output Layout

スクリプトはカード別に保存する。

```text
<target-dir>/smbc-gold-v-nl/smbc-gold-v-nl-YYYYMM.csv
<target-dir>/smbc-owners-v-g/smbc-owners-v-g-YYYYMM.csv
```

## Validation

実行後に確認する。

```bash
find "<target-dir>" -maxdepth 2 -type f -name '*.csv' -print
find "<target-dir>" -maxdepth 2 -type f -name '*.pdf' -print
find "$HOME/Downloads" -maxdepth 1 -name '*.csv' -mmin -20 -print
```

PDF が混ざっていたら、その PDF がサイトから直接落ちた原本か確認する。エージェントが印刷生成した PDF は成果物に含めない。

## Failure Handling

- `no direct csv`: 対象月ページに CSV リンクがない
- `no download`: CSV リンクはあるが Chrome のダウンロードイベントと一時フォルダにファイルが出なかった
- `month selector not found`: 入口ページへ戻れていない、またはログイン状態が変わった
- `card selector not found`: ログイン切れ、システムエラー画面、または対象ページではない

`month selector not found` や `card selector not found` は未取得確定ではない。入口 URL に戻してから再試行する。

`no download` はサイト側で対象月の直接 CSV が提供されない場合がある。再試行しても同じなら、保存できなかった月として報告する。
