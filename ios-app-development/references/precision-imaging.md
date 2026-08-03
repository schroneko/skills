# Precision Imaging

## Contents

- [Separate The Problem Classes](#separate-the-problem-classes)
- [Prefer A Verifiable Baseline](#prefer-a-verifiable-baseline)
- [Normalize Capture Orientation Before Geometry](#normalize-capture-orientation-before-geometry)
- [Require Trustworthy Document Geometry](#require-trustworthy-document-geometry)
- [Evaluate Curved-Page Dewarping](#evaluate-curved-page-dewarping)
- [Handle Occlusion Without Inventing Content](#handle-occlusion-without-inventing-content)
- [Validate The Full Pipeline](#validate-the-full-pipeline)
- [Verify Illumination Normalization](#verify-illumination-normalization)
- [Stabilize Book Sessions](#stabilize-book-sessions)

## Separate The Problem Classes

- Perspective correction maps one planar quadrilateral through a homography. It corrects a flat page photographed at an angle.
- Curved-page dewarping estimates a non-linear surface or backward coordinate map. A perspective filter is not evidence of curved-page correction.
- Segmentation identifies pixels belonging to an object. It does not recover source content hidden behind that object.
- Inpainting synthesizes plausible pixels. It cannot prove the original text, notation, or diagram beneath an occluder.

Name each product capability by the transform it actually performs. Do not use broad labels such as AI correction as substitutes for measurable behavior.

## Prefer A Verifiable Baseline

1. Keep an Apple-framework baseline for capture, page detection, planar correction, rendering, and OCR.
2. Preserve the original capture separately from processed outputs.
3. Store transform metadata and quality measurements so a result can be reproduced or revised.
4. Let users retake or manually correct uncertain results.
5. Treat model output as a candidate until it passes a locked corpus on the minimum supported device.

## Normalize Capture Orientation Before Geometry

The preview and the captured photo have separate rotation paths. A correctly oriented `AVCaptureVideoPreviewLayer` does not prove that still-photo pixels or metadata are upright.

For an `AVCapturePhotoOutput` pipeline:

1. Create an `AVCaptureDevice.RotationCoordinator` for the active capture device.
2. Immediately before capture, read `videoRotationAngleForHorizonLevelCapture`.
3. Apply the supported angle to the photo output's video connection.
4. Preserve the original photo bytes.
5. Decode EXIF orientation and normalize the working pixels to an upright, zero-origin image before Vision requests, quadrilateral coordinates, quality scoring, manual crop, or OCR.

Lock orientation fixtures against output dimensions and pixel placement. A dimensions-only assertion cannot detect every mirrored or inverse rotation.

## Require Trustworthy Document Geometry

Prefer `VNDetectDocumentSegmentationRequest` for a document-specific candidate. Use a bounded `VNDetectRectanglesRequest` fallback when segmentation produces no acceptable document.

Evaluate every candidate with deterministic policy rather than accepting the first observation. Include confidence, convexity, normalized area, minimum pixel dimensions, aspect ratio, fill ratio, center distance, and near-frame-border rejection. Calibrate thresholds on the locked corpus so small centered documents remain valid without mistaking the camera frame or desk boundary for paper.

If no candidate passes, do not persist the uncorrected full frame as a successful scan. Require a retake or manual four-corner correction. Keep `Save Anyway` only for non-geometric quality warnings such as blur or exposure after valid page geometry exists. Reject an unchanged or nearly full-frame manual polygon.

## Evaluate Curved-Page Dewarping

Public Apple APIs provide document segmentation, rectangle observations, perspective correction, Core ML execution, and GPU warp primitives. They do not expose a controllable true curved-page dewarping model.

Before adopting an external model:

- Verify code and weight licenses separately.
- Verify that downloadable weights, conversion inputs, output semantics, color order, coordinate range, interpolation convention, and preprocessing are documented.
- Return a low-resolution deformation grid from Core ML when possible and apply the full-resolution warp with Core Image or Metal.
- Test coordinate parity against the reference implementation before testing visual quality.
- Reject maps with foldovers, invalid Jacobians, or excessive out-of-bounds sampling.
- Compare against the planar baseline on both curved and already-flat pages.
- Measure OCR character error rate, geometry, latency, peak memory, bundle growth, and thermal behavior.

A useful spike has a fixed corpus, minimum-device target, deadline, and hard pass or fail thresholds. If it fails, ship the verified planar path and remove the unproven claim.

## Handle Occlusion Without Inventing Content

For fingers, hands, staples, or other occluders:

1. Detect the uncertain region.
2. Determine whether it overlaps text, notation, lines, or diagrams.
3. Recover source pixels only from aligned clean frames when available.
4. Restrict deterministic inpainting to visually uniform non-content margins.
5. Require a retake when exact source pixels are unavailable or registration confidence is low.

Do not use generative inpainting to silently reconstruct document content. A visually convincing but incorrect character is a data-integrity failure.

Evaluate occlusion handling with pixel recall, page false-positive rate, boundary accuracy, unchanged-pixel checks outside the mask, exact text agreement against a clean frame, latency, memory, and a locked visual audit. Any saved invented text or diagram is a hard failure.

## Validate The Full Pipeline

Measure on representative physical devices and real captures:

- camera orientation and lens selection
- focus, exposure, motion, glare, and shadow conditions
- transform accuracy and output dimensions
- OCR before and after processing
- repeated pages and large batches
- interruption, cancellation, backgrounding, low storage, and thermal pressure

Synthetic unit fixtures prove coordinate and transaction behavior. They do not prove camera or model accuracy.

## Verify Illumination Normalization

Do not treat use of a highlight-shadow filter as proof that broad page shadows were corrected. Lock a deterministic fixture with uneven illumination and dark document content, then measure both:

- reduction in luminance difference between equivalent background regions
- retained contrast between dark content and its corrected local background

Estimate broad illumination separately from page detail, clamp the estimate away from zero, apply only a conservative fraction of the correction, and preserve hue by scaling channels together. Reject a change that brightens the page while weakening characters, rules, or diagrams.

Keep quality-score semantics explicit. Capture warnings should describe the source available for OCR and recovery; output validation should separately verify final dimensions, encoding, and readability.

When original image bytes are retained, use a filename extension that matches the detected image type. Do not store HEIC, PNG, or another format under a `.jpg` name.

For automatic straightening, keep confidence and angle bounds in a pure policy with boundary tests. Apply the transform only after orientation normalization and a trustworthy page geometry step, and retain the manual correction path.

## Stabilize Book Sessions

Keep scan-side guidance separate from storage order. Derive the next left or right cue from the selected starting side and the count of successfully saved pages, while retaining pages in actual capture sequence.

For stable page geometry:

1. Let the first successfully saved processed page establish the session target dimensions.
2. Aspect-fit later processed pages into an exact-size white canvas without cropping or stretching.
3. Keep each original capture unchanged.
4. Record the target only after durable save succeeds.
5. Reset the target when the camera session ends or is canceled.

Test both starting sides, failed-save behavior, exact dimensions, deterministic padding, content preservation, and session reset.
