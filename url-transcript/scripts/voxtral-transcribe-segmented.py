import argparse
import asyncio
import base64
import json
import sys
import wave
from pathlib import Path

import websockets


def timestamp(seconds: float) -> str:
    whole = int(seconds)
    return f"{whole // 3600:02d}:{whole % 3600 // 60:02d}:{whole % 60:02d}"


async def transcribe_segment(endpoint: str, pcm: bytes, chunk_bytes: int, language_mode: str, timeout: float) -> str:
    full_text = ""
    done = asyncio.Event()

    async with websockets.connect(endpoint, max_size=None, ping_interval=None) as ws:
        await ws.recv()
        if language_mode != "none":
            transcription = {}
            if language_mode in {"ja", "en"}:
                transcription["allowed_languages"] = [language_mode]
                transcription["language"] = language_mode
            elif language_mode == "auto-ja-en":
                transcription["allowed_languages"] = ["ja", "en"]
            await ws.send(json.dumps({
                "type": "session.update",
                "session": {
                    "input_audio_transcription": transcription,
                },
            }))
            await ws.recv()

        async def receive() -> None:
            nonlocal full_text
            async for raw in ws:
                msg = json.loads(raw)
                msg_type = msg.get("type")
                if msg_type == "response.audio_transcript.delta":
                    full_text += msg.get("delta", "")
                elif msg_type == "response.audio_transcript.done":
                    full_text = msg.get("text", full_text)
                    done.set()
                    return
                elif msg_type == "error":
                    raise RuntimeError(json.dumps(msg, ensure_ascii=False))

        receiver = asyncio.create_task(receive())

        try:
            for offset in range(0, len(pcm), chunk_bytes):
                chunk = pcm[offset:offset + chunk_bytes]
                await ws.send(json.dumps({
                    "type": "input_audio_buffer.append",
                    "audio": base64.b64encode(chunk).decode("ascii"),
                }))
                await asyncio.sleep(0)

            await ws.send(json.dumps({"type": "input_audio_buffer.commit", "final": True}))
            await asyncio.wait_for(done.wait(), timeout=timeout)
        finally:
            receiver.cancel()

    return full_text.strip()


def write_outputs(texts: list[str], out_path: Path, timestamped_path: Path | None, segment_seconds: float) -> None:
    out_path.write_text("\n".join(part for part in texts if part), encoding="utf-8")
    if timestamped_path is None:
        return
    lines = []
    for index, text in enumerate(texts):
        if text:
            lines.append(f"[{timestamp(index * segment_seconds)}] {text}")
    timestamped_path.write_text("\n".join(lines), encoding="utf-8")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_wav")
    parser.add_argument("output")
    parser.add_argument("--timestamped-output")
    parser.add_argument("--endpoint", default="ws://127.0.0.1:53506/v1/realtime")
    parser.add_argument("--segment-seconds", type=float, default=20.0)
    parser.add_argument("--language-mode", choices=["none", "auto-ja-en", "ja", "en"], default="none")
    parser.add_argument("--timeout", type=float, default=180.0)
    args = parser.parse_args()

    wav_path = Path(args.input_wav)
    out_path = Path(args.output)
    timestamped_path = Path(args.timestamped_output) if args.timestamped_output else None

    with wave.open(str(wav_path), "rb") as wav:
        sample_rate = wav.getframerate()
        channels = wav.getnchannels()
        sample_width = wav.getsampwidth()
        frames = wav.getnframes()
        pcm = wav.readframes(frames)

    if sample_rate != 16000 or channels != 1 or sample_width != 2:
        print(f"unexpected wav format: {sample_rate}Hz {channels}ch {sample_width} bytes", file=sys.stderr)
        raise SystemExit(2)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    if timestamped_path is not None:
        timestamped_path.parent.mkdir(parents=True, exist_ok=True)

    chunk_bytes = 4096 * sample_width
    segment_bytes = int(args.segment_seconds * sample_rate) * sample_width
    total_segments = (len(pcm) + segment_bytes - 1) // segment_bytes
    texts: list[str] = []

    for index, offset in enumerate(range(0, len(pcm), segment_bytes), start=1):
        segment = pcm[offset:offset + segment_bytes]
        print(f"segment {index}/{total_segments}", file=sys.stderr)
        text = await transcribe_segment(args.endpoint, segment, chunk_bytes, args.language_mode, args.timeout)
        texts.append(text)
        write_outputs(texts, out_path, timestamped_path, args.segment_seconds)

    print(f"done {sum(len(part) for part in texts)} chars", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
