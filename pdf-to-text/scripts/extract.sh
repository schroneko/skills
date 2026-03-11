#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PDF_PATH="$1"
MODE="${2:-auto}"
PAGE_RANGE="${3:-}"

get_time() {
    perl -MTime::HiRes=time -e 'printf "%.3f\n", time'
}

START_TIME=$(get_time)

if [ -z "$PDF_PATH" ]; then
    echo "Usage: $0 <pdf-file-path> [auto|ocr|pdfkit] [page-range]" >&2
    echo "" >&2
    echo "Modes:" >&2
    echo "  auto    - PDFKit first, fallback to Vision OCR if needed (default)" >&2
    echo "  ocr     - Vision OCR only (for scanned PDFs)" >&2
    echo "  pdfkit  - PDFKit only (for text-layer PDFs)" >&2
    echo "" >&2
    echo "Page range examples (ocr mode only):" >&2
    echo "  1-10    Pages 1 to 10" >&2
    echo "  5       Page 5 only" >&2
    echo "  10-     Page 10 to end" >&2
    exit 1
fi

if [ ! -f "$PDF_PATH" ]; then
    echo "Error: File not found: $PDF_PATH" >&2
    exit 1
fi

PDF_DIR=$(dirname "$PDF_PATH")
PDF_BASENAME=$(basename "$PDF_PATH")
CACHE_FILE="$PDF_DIR/${PDF_BASENAME}.txt"

calc_elapsed() {
    local start=$1
    local end=$2
    perl -e "printf '%.3f', $end - $start"
}

print_timing() {
    local method=$1
    local elapsed=$2
    echo "[TIMING] $method: ${elapsed}s" >&2
}

print_total_time() {
    local end_time=$(get_time)
    local total=$(calc_elapsed "$START_TIME" "$end_time")
    echo "[TIMING] Total: ${total}s" >&2
}

extract_with_pdfkit() {
    local method_start=$(get_time)
    local result
    result=$(osascript -e '
use framework "Foundation"
use framework "PDFKit"
use scripting additions

on run argv
    set pdfPath to item 1 of argv
    set pdfURL to current application'\''s NSURL'\''s fileURLWithPath:pdfPath
    set pdfDoc to current application'\''s PDFDocument'\''s alloc()'\''s initWithURL:pdfURL

    if pdfDoc is missing value then
        error "Failed to open PDF: " & pdfPath
    end if

    set pageCount to pdfDoc'\''s pageCount() as integer
    set allText to ""

    repeat with i from 0 to (pageCount - 1)
        set thisPage to (pdfDoc'\''s pageAtIndex:i)
        set pageText to (thisPage'\''s |string|()) as text
        set allText to allText & pageText & linefeed
    end repeat

    return allText
end run
' "$PDF_PATH")
    local method_end=$(get_time)
    print_timing "PDFKit" "$(calc_elapsed "$method_start" "$method_end")"
    echo "$result"
}

extract_with_vision() {
    local method_start=$(get_time)
    local result
    if [ -n "$PAGE_RANGE" ]; then
        result=$(swift "$SCRIPT_DIR/ocr.swift" "$PDF_PATH" "$PAGE_RANGE")
    else
        result=$(swift "$SCRIPT_DIR/ocr.swift" "$PDF_PATH")
    fi
    local method_end=$(get_time)
    print_timing "Vision OCR" "$(calc_elapsed "$method_start" "$method_end")"
    echo "$result"
}

is_garbled() {
    echo "$1" | grep -qE "ヸ|ヹ|ヺ|ずガ|ヰが|ぱが|ずピ|ヅペ|ゎペ|醎喩|蠇桵|ぼヱへ|ぢぬ|ゲトふ|犱蹼|鰆璿|めチはん|毬亻"
}

has_problematic_font() {
    grep -qa "ACCESS_Cipher" "$1"
}

if [ "$MODE" = "ocr" ]; then
    if [ -z "$PAGE_RANGE" ] && [ -f "$CACHE_FILE" ]; then
        PDF_MTIME=$(stat -f %m "$PDF_PATH")
        CACHE_MTIME=$(stat -f %m "$CACHE_FILE")
        if [ "$CACHE_MTIME" -ge "$PDF_MTIME" ]; then
            echo "[TIMING] Cache hit" >&2
            cat "$CACHE_FILE"
            print_total_time
            exit 0
        fi
    fi
    if [ -z "$PAGE_RANGE" ]; then
        extract_with_vision | tee "$CACHE_FILE"
    else
        extract_with_vision
    fi
    print_total_time
    exit 0
fi

if [ "$MODE" = "pdfkit" ]; then
    if [ -f "$CACHE_FILE" ]; then
        PDF_MTIME=$(stat -f %m "$PDF_PATH")
        CACHE_MTIME=$(stat -f %m "$CACHE_FILE")
        if [ "$CACHE_MTIME" -ge "$PDF_MTIME" ]; then
            echo "[TIMING] Cache hit" >&2
            cat "$CACHE_FILE"
            print_total_time
            exit 0
        fi
    fi
    extract_with_pdfkit | tee "$CACHE_FILE"
    print_total_time
    exit 0
fi

if [ -f "$CACHE_FILE" ]; then
    PDF_MTIME=$(stat -f %m "$PDF_PATH")
    CACHE_MTIME=$(stat -f %m "$CACHE_FILE")
    if [ "$CACHE_MTIME" -ge "$PDF_MTIME" ]; then
        CACHED_SIZE=$(wc -c < "$CACHE_FILE" | tr -d ' ')
        if [ "$CACHED_SIZE" -gt 500 ]; then
            CACHED_TEXT=$(cat "$CACHE_FILE")
            if ! is_garbled "$CACHED_TEXT"; then
                echo "[TIMING] Cache hit" >&2
                echo "$CACHED_TEXT"
                print_total_time
                exit 0
            fi
        fi
    fi
fi

if has_problematic_font "$PDF_PATH"; then
    echo "[INFO] Problematic font detected (ACCESS_Cipher). Using Vision OCR..." >&2
    extract_with_vision | tee "$CACHE_FILE"
    print_total_time
    exit 0
fi

PDFKIT_TEXT=$(extract_with_pdfkit)
PDFKIT_SIZE=$(echo "$PDFKIT_TEXT" | wc -c | tr -d ' ')

if [ "$PDFKIT_SIZE" -gt 500 ] && ! is_garbled "$PDFKIT_TEXT"; then
    echo "$PDFKIT_TEXT" | tee "$CACHE_FILE"
else
    if [ "$PDFKIT_SIZE" -le 500 ]; then
        echo "[INFO] PDFKit extracted only ${PDFKIT_SIZE} bytes. Falling back to Vision OCR..." >&2
    else
        echo "[INFO] PDFKit output appears garbled. Falling back to Vision OCR..." >&2
    fi
    extract_with_vision | tee "$CACHE_FILE"
fi

print_total_time
