#!/bin/bash
TOKEN="$1"
TSV_FILE="$2"
OUTPUT_DIR="$3"
START_LINE="${4:-1}"
END_LINE="${5:-99999}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

total=$(awk -v s="$START_LINE" -v e="$END_LINE" 'NR>=s && NR<=e' "$TSV_FILE" | wc -l | tr -d ' ')
echo "=== NIFS Batch Download ==="
echo "Lines: ${START_LINE}-${END_LINE} (${total} items)"
echo "Output: ${OUTPUT_DIR}"
echo "=========================="

count=0
ok=0
fail=0
skip=0
cached=0

awk -v s="$START_LINE" -v e="$END_LINE" 'NR>=s && NR<=e' "$TSV_FILE" | while IFS=$'\t' read -r identifier catalog_id; do
    count=$((count + 1))
    result=$("${SCRIPT_DIR}/download-one.sh" "$identifier" "$catalog_id" "$TOKEN" "$OUTPUT_DIR")
    status="${result%%|*}"
    case "$status" in
        OK) ok=$((ok + 1)) ;;
        FAIL) fail=$((fail + 1)) ;;
        SKIP) skip=$((skip + 1)) ;;
        CACHED) cached=$((cached + 1)) ;;
    esac
    echo "[${count}/${total}] ${result}"
done

echo ""
echo "=== Done ==="
