import argparse

import cv2


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("region", metavar="X0,Y0,X1,Y1")
    parser.add_argument("--zoom", type=int, default=2)
    args = parser.parse_args()

    img = cv2.imread(args.input)
    if img is None:
        raise SystemExit(f"failed to load {args.input}")
    x0, y0, x1, y1 = (int(v) for v in args.region.split(","))
    crop = img[y0:y1, x0:x1]
    crop = cv2.resize(
        crop,
        (crop.shape[1] * args.zoom, crop.shape[0] * args.zoom),
        interpolation=cv2.INTER_LANCZOS4,
    )
    cv2.imwrite(args.output, crop, [cv2.IMWRITE_JPEG_QUALITY, 90])
    print(args.output)


main()
