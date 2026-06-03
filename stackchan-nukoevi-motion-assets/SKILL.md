---
name: stackchan-nukoevi-motion-assets
description: Use when creating, regenerating, verifying, or flashing StackChan Nukoevi blink, talk, or sleep motion assets in the stackchan-nukoevi firmware. Applies especially when adjusting mouth, eyelid, framing, 320x240 aspect ratio, 6-frame strips, source-assets cleanup, or assets_bin regeneration.
---

# StackChan Nukoevi Motion Assets

## Non-negotiables

- Final display frames are `320x240`, landscape `4:3`.
- Six-frame talk or sleep strips are `1920x240`.
- Normal blink and sleepy avatar frames are runtime raw RGB565 `.bin` assets in the firmware assets partition, not app-partition C assets.
- Do not use LZ4-compressed assets for full-screen Nukoevi avatar frames. That path caused white-screen behavior on hardware.
- Use full `flash`, not `app-flash`, after changing runtime `.bin` assets or `partitions.csv`.
- Never use forced aspect distortion such as `-resize 320x240!` or `-resize 1920x240!`.
- Use aspect-preserving resize only. For generated `4:3` images, `-resize 320x240` is enough. For uncertain inputs, use `-resize 320x240^ -gravity center -extent 320x240`.
- Do not invent the framing. Inspect the actual reference frames first.
- `nukoevi-source.png` is identity/style reference. It is not the framing reference for motion assets.
- `nukoevi-blink-frame-0..3.png` are the framing reference. The visible range is head, face, hat, ears, hair, and neck. Do not add chest or torso.
- Treat your own interpretation as suspect. If the user says the reference is neck-only, do not describe it as chest or body.

## Important Paths

Repository:

```sh
/Users/username/ghq/github.com/schroneko/stackchan-nukoevi
```

Source assets:

```sh
firmware/main/apps/app_nukoevi/source-assets
```

Runtime assets:

```sh
firmware/main/assets/assets_bin
```

Generators and verifiers:

```sh
firmware/main/apps/app_nukoevi/source-assets/generate_nukoevi_motion_assets.py
firmware/main/apps/app_nukoevi/source-assets/verify_motion_asset.py
```

## Runtime Usage

Blink runtime uses these raw RGB565 binaries:

```sh
firmware/main/assets/assets_bin/nukoevi-screen-open.bin
firmware/main/assets/assets_bin/nukoevi-screen-half-a.bin
firmware/main/assets/assets_bin/nukoevi-screen-closed.bin
firmware/main/assets/assets_bin/nukoevi-screen-half-b.bin
```

Talk runtime uses these binaries:

```sh
firmware/main/assets/assets_bin/nukoevi-talk-closed.bin
firmware/main/assets/assets_bin/nukoevi-talk-tiny.bin
firmware/main/assets/assets_bin/nukoevi-talk-medium.bin
firmware/main/assets/assets_bin/nukoevi-talk-wide.bin
firmware/main/assets/assets_bin/nukoevi-talk-small.bin
firmware/main/assets/assets_bin/nukoevi-talk-smile.bin
```

Sleep runtime uses these raw RGB565 binaries:

```sh
firmware/main/assets/assets_bin/nukoevi-sleep-drowsy.bin
firmware/main/assets/assets_bin/nukoevi-sleep-nearly-closed.bin
firmware/main/assets/assets_bin/nukoevi-sleep-nod.bin
firmware/main/assets/assets_bin/nukoevi-sleep-asleep.bin
firmware/main/assets/assets_bin/nukoevi-sleep-wobble.bin
firmware/main/assets/assets_bin/nukoevi-sleep-return.bin
```

These avatar `.bin` files use a 12 byte LVGL image header followed by `153600` bytes of RGB565 pixel data:

- magic: `LV_IMAGE_HEADER_MAGIC`
- color format: `LV_COLOR_FORMAT_RGB565`
- flags: `0`
- size: `320x240`
- stride: `0`

Talk frames can stay LZ4-compressed because they are not used as the primary full-screen avatar image path.

The firmware assets partition is `5M` in `firmware/partitions.csv`. If generated assets grow, check `firmware/build/generated_assets.bin` against that partition size before flashing.

PNG frames and strips are not read directly at runtime, but keep them because they are useful for review and regeneration.

## Generation Workflow

1. Show the framing reference before generating:

```sh
magick firmware/main/apps/app_nukoevi/source-assets/nukoevi-blink-frame-0.png firmware/main/apps/app_nukoevi/source-assets/nukoevi-blink-frame-1.png firmware/main/apps/app_nukoevi/source-assets/nukoevi-blink-frame-2.png firmware/main/apps/app_nukoevi/source-assets/nukoevi-blink-frame-3.png +append /tmp/nukoevi-blink-reference-strip.png
```

View `/tmp/nukoevi-blink-reference-strip.png`.

2. Use the built-in `image_gen` skill/tool. Generate or edit from a single base image so that the character, crop, background, hat, ears, hair, and neck placement remain stable.

3. For talk, generate exactly six frames:

- frame 0: closed mouth
- frame 1: tiny open mouth
- frame 2: medium mouth
- frame 3: wide mouth
- frame 4: small rounded mouth
- frame 5: soft closed smile

Only the mouth should change.

4. For sleep, generate exactly six frames:

- frame 0: drowsy
- frame 1: nearly closed
- frame 2: closed eyes
- frame 3: asleep
- frame 4: one eye barely peeking
- frame 5: drowsy return

Only eyelids and tiny mouth expression should change. Do not change pose, background, head scale, crop, or costume.

5. Copy generated outputs from `$CODEX_HOME/generated_images/...` into project assets after inspection.

6. Write frames and strip:

```sh
magick input0.png -auto-orient -resize 320x240 firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-frame-0.png
magick input1.png -auto-orient -resize 320x240 firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-frame-1.png
magick input2.png -auto-orient -resize 320x240 firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-frame-2.png
magick input3.png -auto-orient -resize 320x240 firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-frame-3.png
magick input4.png -auto-orient -resize 320x240 firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-frame-4.png
magick input5.png -auto-orient -resize 320x240 firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-frame-5.png
magick firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-frame-0.png firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-frame-1.png firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-frame-2.png firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-frame-3.png firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-frame-4.png firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-frame-5.png +append firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-imagegen-strip.png
```

For sleep, replace `talk` with `sleep`.

7. Regenerate blink assets after changing normal blink frames:

```sh
uv run --with pillow python firmware/main/apps/app_nukoevi/source-assets/generate_nukoevi_blink_assets.py
```

8. Regenerate talk and sleep binaries and previews:

```sh
uv run --with pillow --with lz4 python firmware/main/apps/app_nukoevi/source-assets/generate_nukoevi_motion_assets.py
```

9. Verify:

```sh
magick identify -format '%f %wx%h ratio=%[fx:w/h]\n' firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-imagegen-strip.png firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-preview.png firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-frame-0.png firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-frame-1.png firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-frame-2.png firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-frame-3.png firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-frame-4.png firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-frame-5.png
uv run --with pillow python firmware/main/apps/app_nukoevi/source-assets/verify_motion_asset.py
```

Expected:

- frames are `320x240`
- strip and preview are `1920x240`
- verifier prints `matches=True`

10. Show the preview PNG before claiming success:

```sh
firmware/main/apps/app_nukoevi/source-assets/nukoevi-talk-preview.png
firmware/main/apps/app_nukoevi/source-assets/nukoevi-sleep-preview.png
```

Check for cropping, squeezing, scale drift, background drift, and identity drift.

## Flashing

When the user asks for device reflection, build and flash from `firmware`:

```sh
. /Users/username/ghq/github.com/espressif/esp-idf/export.sh
idf.py build
idf.py -p /dev/tty.usbmodem3101 flash
```

Use full `flash` for asset or partition changes. `app-flash` is only enough for app-only changes.

Then monitor briefly:

```sh
gtimeout 20s zsh -lc '. /Users/username/ghq/github.com/espressif/esp-idf/export.sh
idf.py -p /dev/tty.usbmodem3101 monitor'
```

Confirm these lines appear when relevant:

- `[NUKOEVI] on open`
- `blink assets loaded: ok`
- `sleep assets loaded: ok`

Exit code `124` from `gtimeout` is expected if the log was captured.
