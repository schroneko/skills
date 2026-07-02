#!/usr/bin/env bash
set -euo pipefail

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
source_path="$script_dir/auto-click-cdp-popup.swift"
cache_dir="${XDG_CACHE_HOME:-$HOME/.cache}/auto-click-cdp-popup"
binary_path="$cache_dir/auto-click-cdp-popup"

mkdir -p "$cache_dir"

if [[ ! -x "$binary_path" || "$source_path" -nt "$binary_path" ]]; then
  swiftc "$source_path" -o "$binary_path"
fi

exec "$binary_path" "$@"
