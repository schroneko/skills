#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXTRACT_SCRIPT="$SCRIPT_DIR/extract.sh"

PDF_DIR="${1:-.}"
PARALLEL_JOBS="${2:-12}"
LOG_FILE="${PDF_DIR}/batch-processing.log"

get_time() {
    perl -MTime::HiRes=time -e 'printf "%.3f\n", time'
}

calc_elapsed() {
    local start=$1
    local end=$2
    perl -e "printf '%.1f', $end - $start"
}

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

process_single_pdf() {
    local pdf_path="$1"
    local extract_script="$2"
    local basename=$(basename "$pdf_path")
    local txt_path="${pdf_path}.txt"

    if [ -f "$txt_path" ]; then
        echo "SKIP|$basename|cached"
        return 0
    fi

    local start_time=$(perl -MTime::HiRes=time -e 'printf "%.3f\n", time')

    if "$extract_script" "$pdf_path" > /dev/null 2>&1; then
        local end_time=$(perl -MTime::HiRes=time -e 'printf "%.3f\n", time')
        local elapsed=$(perl -e "printf '%.1f', $end_time - $start_time")
        echo "OK|$basename|${elapsed}s"
    else
        echo "FAIL|$basename|error"
    fi
}

export -f process_single_pdf

if [ "$PDF_DIR" = "-h" ] || [ "$PDF_DIR" = "--help" ]; then
    echo "Usage: $0 <pdf-directory> [parallel-jobs]" >&2
    echo "" >&2
    echo "Arguments:" >&2
    echo "  pdf-directory   Directory containing PDF files (default: current dir)" >&2
    echo "  parallel-jobs   Number of parallel processes (default: 12)" >&2
    echo "" >&2
    echo "Output:" >&2
    echo "  Creates .txt files alongside PDFs" >&2
    echo "  Writes log to <pdf-directory>/batch-processing.log" >&2
    exit 0
fi

if [ ! -d "$PDF_DIR" ]; then
    echo "Error: Directory not found: $PDF_DIR" >&2
    exit 1
fi

: > "$LOG_FILE"

log "=== PDF Batch Processing Started ==="
log "Directory: $PDF_DIR"
log "Parallel jobs: $PARALLEL_JOBS"
log "Extract script: $EXTRACT_SCRIPT"

total_count=$(find "$PDF_DIR" -maxdepth 1 -name "*.pdf" | wc -l | tr -d ' ')
log "Total PDFs: $total_count"

if [ "$total_count" -eq 0 ]; then
    log "No PDF files found!"
    exit 0
fi

cached_count=$(find "$PDF_DIR" -maxdepth 1 -name "*.pdf.txt" | wc -l | tr -d ' ')
remaining=$((total_count - cached_count))
log "Already cached: $cached_count"
log "To process: $remaining"

if [ "$remaining" -eq 0 ]; then
    log "All files already processed!"
    exit 0
fi

log ""
log "--- Processing ---"

overall_start=$(get_time)

ok_count=0
fail_count=0
skip_count=0

while IFS='|' read -r status name elapsed; do
    log "$status: $name ($elapsed)"
    case "$status" in
        OK) ((ok_count++)) ;;
        FAIL) ((fail_count++)) ;;
        SKIP) ((skip_count++)) ;;
    esac
done < <(find "$PDF_DIR" -maxdepth 1 -name "*.pdf" -print0 | \
    xargs -0 -P "$PARALLEL_JOBS" -I {} bash -c 'process_single_pdf "$@"' _ {} "$EXTRACT_SCRIPT")

overall_end=$(get_time)
overall_elapsed=$(calc_elapsed "$overall_start" "$overall_end")

log ""
log "--- Summary ---"
log "Processed: $ok_count"
log "Skipped (cached): $skip_count"
log "Failed: $fail_count"
log "Total time: ${overall_elapsed}s"

if [ "$ok_count" -gt 0 ]; then
    avg=$(perl -e "printf '%.1f', $overall_elapsed / $ok_count")
    log "Average per file: ${avg}s"
fi

log "=== Processing Complete ==="
