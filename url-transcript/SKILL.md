---
name: url-transcript
description: URL やリンク先の動画、ウェビナー、オンデマンド配信、HLS、字幕付きページから文字起こしテキストを取得する。Goldcast、YouTube、Vimeo、m3u8、mp4、vtt、srt、字幕 playlist、期限切れ署名 URL、ローカル Voxtral fallback を扱う。「このリンクの transcript を取って」「動画を文字起こしして」「字幕を取得して」「原文 transcript が欲しい」「yt-dlp で取れるか確認して」などの依頼で使用する。
---

# URL Transcript

リンク先から transcript を得る。公式字幕や埋め込み transcript を最優先し、取れない場合だけメディア音声を取得してローカル Voxtral で文字起こしする。

## 原則

- Whisper は、ユーザーが明示的に指定した場合以外は使わない。
- 「原文 transcript」は翻訳しない。音声または公式 transcript の言語を保ち、Voxtral に `language` を固定しない。
- 字幕や transcript が取れる場合は、ASR より公式テキストを優先する。
- 登録フォーム、ログイン、支払い、同意ボタンは勝手に送信しない。
- 署名付き URL は期限切れになりやすい。取得したらすぐ保存する。
- 最終成果物には、取得方法、使った入力、失敗した経路、ASR の誤認識リスクを短く残す。

## 保存先

作業ファイルは `work/` に置く。ユーザーに渡す成果物は `outputs/` に置く。

標準の成果物:

- `outputs/<slug>-transcript.txt`
- `outputs/<slug>-transcript-timestamped.txt`
- 必要に応じて `outputs/<slug>-understanding.md`

## Workflow

### 1. ページと埋め込みデータを調べる

まずリンク先 HTML や player config を保存し、transcript、caption、subtitle、m3u8、vtt、srt、json、docx を探す。

```bash
curl -L "<URL>" -o work/page.html
```

```bash
rg -n "transcript|caption|subtitle|\\.vtt|\\.srt|\\.m3u8|window\\.|uberdata" work/page.html
```

URL を作り出さない。HTML、network playlist、player config、`yt-dlp` 出力など、確認済みの URL だけを使う。

### 2. yt-dlp で字幕を試す

ページ URL または HLS master URL に対して字幕一覧を確認する。

```bash
yt-dlp --list-subs "<URL>"
```

字幕が見える場合は、まず字幕だけ保存する。

```bash
yt-dlp --skip-download --write-subs --sub-langs all --sub-format vtt -o "work/%(title)s.%(ext)s" "<URL>"
```

失敗した場合はエラー本文を見る。403、AccessDenied、Request has expired は署名切れとして扱う。

### 3. 期限切れ署名 URL を扱う

HLS subtitle playlist の中に期限切れの S3 や CloudFront URL がある場合:

1. `caption/*.m3u8` や master playlist を再取得する。
2. ユーザーが該当 Chrome タブを開いている場合だけ、既存タブを reload してから再取得を試す。
3. 署名が更新されない場合は、字幕経路を諦めて音声 ASR に進む。

Chrome 操作では既存のログイン済みプロフィールか確認する。登録フォームに架空情報を入れない。

### 4. メディアを取得する

字幕が取れない場合は、`yt-dlp -F` で format を確認し、音声を含む軽い format を保存する。

```bash
yt-dlp -F "<URL_OR_M3U8>"
```

```bash
yt-dlp -f worst -o "work/<slug>.%(ext)s" "<URL_OR_M3U8>"
```

音声が別 format の場合は、音声 format を優先する。

### 5. Voxtral 用 WAV に変換する

Voxtral fallback は 16 kHz、mono、PCM16 WAV にする。

```bash
ffmpeg -y -i "work/<slug>.mp4" -vn -ac 1 -ar 16000 "work/<slug>-16k.wav"
```

```bash
ffprobe -hide_banner -show_streams "work/<slug>-16k.wav"
```

### 6. ローカル Voxtral で文字起こしする

NiceVoice の VoxMLX server が起動している場合は、その server を使う。

```bash
pgrep -fl "voxmlx.server"
```

```bash
lsof -Pan -p <PID> -iTCP -sTCP:LISTEN
```

`ws://127.0.0.1:<PORT>/v1/realtime` を endpoint にして、バンドル script を実行する。

```bash
uv run --project /Users/username/ghq/github.com/schroneko/nicevoice-app/Server python <skill-dir>/scripts/voxtral-transcribe-segmented.py "work/<slug>-16k.wav" "outputs/<slug>-transcript.txt" --timestamped-output "outputs/<slug>-transcript-timestamped.txt" --endpoint "ws://127.0.0.1:<PORT>/v1/realtime" --segment-seconds 20 --language-mode none
```

`--language-mode none` が原文優先の標準。ユーザーが明示した場合だけ `ja`、`en`、`auto-ja-en` を使う。

### 7. 検証して報告する

先頭数行、行数、ファイルサイズを確認する。

```bash
sed -n '1,8p' "outputs/<slug>-transcript.txt"
```

```bash
wc -l "outputs/<slug>-transcript.txt" "outputs/<slug>-transcript-timestamped.txt"
```

報告には以下を含める:

- 公式字幕を取得できたか、ASR になったか
- `yt-dlp` で字幕が取れなかった理由
- Voxtral を使った場合は、言語固定の有無
- transcript と timestamped transcript のリンク
- ASR の固有名詞、句読点、英語サービス名の誤認識リスク
