import argparse
import urllib.request
from pathlib import Path

import cv2

MODEL_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
MODEL_PATH = Path.home() / ".cache" / "blur-faces" / "face_detection_yunet_2023mar.onnx"


def ensure_model(path):
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(MODEL_URL, path)
    return str(path)


def detect(img, model, scale, threshold):
    h, w = img.shape[:2]
    scaled = img
    if scale != 1:
        scaled = cv2.resize(
            img, (w * scale, h * scale), interpolation=cv2.INTER_LANCZOS4
        )
    detector = cv2.FaceDetectorYN.create(
        model, "", (w * scale, h * scale), threshold, 0.3, 5000
    )
    detector.setInputSize((w * scale, h * scale))
    _, faces = detector.detect(scaled)
    if faces is None:
        return []
    return [(f[0] / scale, f[1] / scale, f[2] / scale, f[3] / scale) for f in faces]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--model", default=str(MODEL_PATH))
    parser.add_argument("--manual", action="append", default=[], metavar="X,Y,W,H")
    parser.add_argument("--pad", type=float, default=0.25)
    args = parser.parse_args()

    model = ensure_model(Path(args.model))
    img = cv2.imread(args.input)
    if img is None:
        raise SystemExit(f"failed to load {args.input}")
    h, w = img.shape[:2]

    boxes = detect(img, model, 1, 0.35) + detect(img, model, 2, 0.4)
    detected = len(boxes)
    for spec in args.manual:
        x, y, fw, fh = (float(v) for v in spec.split(","))
        boxes.append((x, y, fw, fh))

    for x, y, fw, fh in boxes:
        x0 = max(0, int(x - fw * args.pad))
        y0 = max(0, int(y - fh * args.pad))
        x1 = min(w, int(x + fw * (1 + args.pad)))
        y1 = min(h, int(y + fh * (1 + args.pad)))
        if x1 <= x0 or y1 <= y0:
            continue
        roi = img[y0:y1, x0:x1]
        k = max(11, (int((x1 - x0) * 0.5) // 2) * 2 + 1)
        img[y0:y1, x0:x1] = cv2.GaussianBlur(roi, (k, k), 0)

    ext = Path(args.output).suffix.lower()
    params = [cv2.IMWRITE_JPEG_QUALITY, 92] if ext in (".jpg", ".jpeg") else []
    cv2.imwrite(args.output, img, params)
    print(
        f"detected: {detected}, manual: {len(args.manual)}, total blurred: {len(boxes)}"
    )


main()
