# X 報告フロー詳細

投稿の報告 UI 操作の詳細手順。操作手段は `x-report/SKILL.md` の実行環境に従う。

## Step 1: 投稿ページに移動

Chrome のアドレスバーに投稿 URL を入力して移動する。既存タブを使う場合も、対象 URL 以外へ移動しない。

## Step 2: 投稿内容を確認

Chrome の表示状態を確認する。

対象ユーザーの article 要素内にある投稿テキストを確認する。

## Step 3: More メニューを開く

対象投稿の article 内にある `button "More"` (expandable, haspopup="menu") をクリックする。

注意: ページ上に複数の「More」ボタンがある。対象ユーザーの投稿 article 内のものを選ぶ。

## Step 4: Report post をクリック

メニューが展開されたら `menuitem "Report post"` をクリックする。

## Step 5: カテゴリ選択ダイアログ

ダイアログが表示されるまで Chrome の表示状態を確認する。

ダイアログ内の radio ボタンからカテゴリを選択。主なカテゴリ:

| カテゴリ                   | 用途               |
| -------------------------- | ------------------ |
| Spam                       | スパム             |
| Hate, Abuse, or Harassment | 誹謗中傷、嫌がらせ |
| Child Safety               | 児童の安全         |
| Violent Speech             | 暴力的な発言       |
| Impersonation              | なりすまし         |

誹謗中傷の報告では通常「Hate, Abuse, or Harassment」を選択する。

## Step 6: Next をクリック

カテゴリ選択後「Next」ボタンが有効化される。実報告では、ユーザーがその投稿とカテゴリを明示承認している場合だけクリックする。テストではクリックしない。

## Step 7: 送信確認

ダイアログのタイトルが「Submitted」「Thanks for helping make X better for everyone」に変わる。Chrome の表示状態を確認する。

## Step 8: Done をクリック

「Done」をクリックして報告フローを閉じる。

## Step 9: 次の投稿へ

複数投稿を報告する場合は Step 1 に戻る。

## トラブルシューティング

### ダイアログの中身が見えない

Next クリック後にダイアログ内容が空に見える場合がある。Chrome の表示状態を再取得し、必要なら少し待ってから再確認する。

### ダイアログが見つからない

ダイアログのテキストは英語。`"What are you reporting?"` または `"What type of issue are you reporting?"` が見つからなければ、Chrome の表示状態を再取得して確認する。

### 既に報告済みの投稿

「You reported this Post.」と表示されている投稿は既に報告済み。スキップする。
