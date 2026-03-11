# gcloud コマンドリファレンス

## プロジェクト一覧

```bash
gcloud projects list --format="table(projectId,name,createTime.date('%Y-%m-%d'),lifecycleState)"
```

削除済みも含める:

```bash
gcloud projects list --filter="lifecycleState=ACTIVE OR lifecycleState=DELETE_REQUESTED"
```

## 有効な API 確認

```bash
gcloud services list --project=PROJECT_ID --enabled --format="value(config.name)"
```

## リソース確認

### Cloud Run

```bash
gcloud run services list --project=PROJECT_ID --format="table(name,region,status)"
```

### App Engine

```bash
gcloud app describe --project=PROJECT_ID
```

### Cloud Functions

```bash
gcloud functions list --project=PROJECT_ID --format="table(name,status,runtime)"
```

### Compute Engine

```bash
gcloud compute instances list --project=PROJECT_ID --format="table(name,zone,status)"
```

### Cloud Storage

```bash
gsutil ls -p PROJECT_ID
```

サイズ確認:

```bash
gsutil du -sh gs://BUCKET_NAME/
```

### Artifact Registry

```bash
gcloud artifacts repositories list --project=PROJECT_ID --format="table(name,format,location)"
```

## 請求情報

請求アカウント一覧:

```bash
gcloud billing accounts list
```

プロジェクトの請求状況:

```bash
gcloud billing projects describe PROJECT_ID --format="value(billingAccountName,billingEnabled)"
```

## IAM

権限確認:

```bash
gcloud projects get-iam-policy PROJECT_ID --format="table(bindings.role,bindings.members)"
```

自分を削除（Owner 権限が必要）:

```bash
gcloud projects remove-iam-policy-binding PROJECT_ID \
  --member="user:EMAIL" \
  --role="roles/editor"
```

## プロジェクト削除・復元

削除:

```bash
gcloud projects delete PROJECT_ID --quiet
```

復元（30 日以内）:

```bash
gcloud projects undelete PROJECT_ID
```

## 便利な URL

| ページ         | URL                                                                         |
| -------------- | --------------------------------------------------------------------------- |
| ダッシュボード | `https://console.cloud.google.com/home/dashboard?project=PROJECT_ID`        |
| IAM            | `https://console.cloud.google.com/iam-admin/iam?project=PROJECT_ID`         |
| 請求           | `https://console.cloud.google.com/billing/linkedaccount?project=PROJECT_ID` |
