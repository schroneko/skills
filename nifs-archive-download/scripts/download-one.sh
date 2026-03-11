#!/bin/bash
identifier="$1"
catalog_id="$2"
token="$3"
output_dir="$4"
outfile="${output_dir}/${identifier}.pdf"

if [ -f "$outfile" ]; then
    size=$(stat -f%z "$outfile" 2>/dev/null || echo 0)
    if [ "$size" -gt 100 ]; then
        echo "CACHED|${identifier}"
        exit 0
    fi
    rm -f "$outfile"
fi

signed_url=$(curl -s -H "Authorization: Bearer ${token}" "https://archives.nifs.ac.jp/api/catalogs/${catalog_id}/url")

if [ -z "$signed_url" ]; then
    echo "SKIP|${identifier}|empty-response"
    exit 0
fi

if echo "$signed_url" | grep -q "404\|error\|Error"; then
    echo "SKIP|${identifier}|no-pdf"
    exit 0
fi

curl -sL -o "$outfile" "$signed_url"

if [ ! -f "$outfile" ]; then
    echo "FAIL|${identifier}|no-file"
    exit 0
fi

size=$(stat -f%z "$outfile" 2>/dev/null || echo 0)
if [ "$size" -lt 100 ]; then
    rm -f "$outfile"
    echo "FAIL|${identifier}|${size}B"
    exit 0
fi

echo "OK|${identifier}|${size}"
