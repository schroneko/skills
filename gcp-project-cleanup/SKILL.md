---
name: gcp-project-cleanup
description: Google Cloud プロジェクトの整理・削除を支援する。「GCP のプロジェクトを整理したい」「使っていない GCP プロジェクトを削除したい」「Google Cloud を掃除したい」などのリクエストで使用する。
---

# GCP Project Cleanup

Google Cloud プロジェクトの棚卸しと整理を行う。

## 前提条件

- gcloud CLI がインストール済みであること
- `gcloud auth login` で認証済みであること

## 安全ガイドライン

プロジェクト削除は不可逆な操作で、30 日後に完全削除される。誤削除を防ぐために以下の手順を守る:

1. 調査フェーズでは削除コマンドを実行しない
2. 全プロジェクトの調査完了後、一覧をユーザーに提示する
3. ユーザーが削除対象を明示的に指定するまで削除しない
4. 複数プロジェクトを一括削除しない。1 つずつユーザーに確認を取る

## ワークフロー

### Phase 1: 調査（削除コマンド禁止）

#### 1.1 プロジェクト一覧の取得

```bash
gcloud projects list --format="table(projectId,name,createTime.date('%Y-%m-%d'),lifecycleState)"
```

#### 1.2 各プロジェクトのリソース確認

プロジェクトごとに以下を確認:

- 有効な API
- 実行中のリソース（Cloud Run, Compute Engine, Cloud Functions 等）
- ストレージ
- 請求状況

詳細なコマンドは [references/gcloud-commands.md](references/gcloud-commands.md) を参照。

#### 1.3 IAM 権限の確認

削除には Owner 権限が必要。Editor 以下では削除不可。

```bash
gcloud projects get-iam-policy PROJECT_ID --format="table(bindings.role,bindings.members)"
```

#### 1.4 調査結果の提示

全プロジェクトの調査完了後、以下の形式で一覧を提示:

| プロジェクト | 作成日  | リソース有無     | 権限   | 削除可否 |
| ------------ | ------- | ---------------- | ------ | -------- |
| example-1    | 2023-01 | なし             | Owner  | 可       |
| example-2    | 2024-06 | Cloud Run 稼働中 | Owner  | 要確認   |
| example-3    | 2022-03 | なし             | Editor | 不可     |

ユーザーに「どのプロジェクトを削除しますか？」と確認を求める。

### Phase 2: 削除（ユーザー承認後のみ）

#### 2.1 プロジェクト削除

ユーザーが明示的に承認した場合のみ、1 つずつ実行:

```bash
gcloud projects delete PROJECT_ID --quiet
```

#### 2.2 削除結果の確認

```bash
gcloud projects describe PROJECT_ID --format="value(lifecycleState)"
```

DELETE_REQUESTED になっていることを確認。

復元が必要な場合（30 日以内）:

```bash
gcloud projects undelete PROJECT_ID
```

### Phase 3: IAM 整理

#### 3.1 自分を IAM から削除

Editor 権限では自分を抜けない（setIamPolicy 権限が必要）。

Owner 権限がある場合も、自分が唯一の Owner だと削除不可。

#### 3.2 Owner への削除依頼

自分で削除できない場合は Owner に依頼する。

## 補足情報

- プロジェクト削除は即時ではなく DELETE_REQUESTED 状態になる
- 30 日後に完全削除され、プロジェクト ID の再利用は不可
- 請求が無効（billingEnabled: False）でもプロジェクトは残る
- gen-lang-client-\* は Google AI Studio が自動作成するプロジェクト
