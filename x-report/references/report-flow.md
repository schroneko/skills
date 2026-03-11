# X 報告フロー詳細

投稿の報告 UI 操作の詳細手順。

## Step 1: 投稿ページに移動

```
mcp__chrome-devtools__navigate_page(type="url", url="https://x.com/<username>/status/<id>")
```

## Step 2: 投稿内容を確認

```
mcp__chrome-devtools__take_snapshot()
```

対象ユーザーの article 要素内にある投稿テキストを確認する。

## Step 3: More メニューを開く

対象投稿の article 内にある `button "More"` (expandable, haspopup="menu") をクリック:

```
mcp__chrome-devtools__click(uid="<more_button_uid>")
```

注意: ページ上に複数の「More」ボタンがある。対象ユーザーの投稿 article 内のものを選ぶ。

## Step 4: Report post をクリック

メニューが展開され `menuitem "Report post"` が表示される:

```
mcp__chrome-devtools__take_snapshot()
mcp__chrome-devtools__click(uid="<report_post_uid>")
```

## Step 5: カテゴリ選択ダイアログ

ダイアログが表示されるまで待機:

```
mcp__chrome-devtools__wait_for(text="What are you reporting?", timeout=5000)
```

ダイアログ内の radio ボタンからカテゴリを選択。主なカテゴリ:

| カテゴリ                   | 用途               |
| -------------------------- | ------------------ |
| Spam                       | スパム             |
| Hate, Abuse, or Harassment | 誹謗中傷、嫌がらせ |
| Child Safety               | 児童の安全         |
| Violent Speech             | 暴力的な発言       |
| Impersonation              | なりすまし         |

誹謗中傷の報告では通常「Hate, Abuse, or Harassment」を選択:

```
mcp__chrome-devtools__click(uid="<hate_radio_uid>")
```

## Step 6: Next をクリック

カテゴリ選択後「Next」ボタンが有効化される:

```
mcp__chrome-devtools__click(uid="<next_button_uid>", includeSnapshot=true)
```

## Step 7: 送信確認

ダイアログのタイトルが「Submitted」「Thanks for helping make X better for everyone」に変わる。
通常のスナップショットでは dialog 内が見えないことがある。verbose モードで確認:

```
mcp__chrome-devtools__take_snapshot(verbose=true)
```

## Step 8: Done をクリック

```
mcp__chrome-devtools__click(uid="<done_button_uid>")
```

## Step 9: 次の投稿へ

複数投稿を報告する場合は Step 1 に戻る。

## トラブルシューティング

### ダイアログの中身が見えない

Next クリック後にダイアログ内容が空に見える場合がある。`verbose=true` でスナップショットを取ると dialog 内の要素が確認できる。

### wait_for がタイムアウトする

ダイアログのテキストは英語。`"What are you reporting?"` または `"What type of issue are you reporting?"` で待機する。見つからなければ直接 `take_snapshot()` で確認する。

### 既に報告済みの投稿

「You reported this Post.」と表示されている投稿は既に報告済み。スキップする。
