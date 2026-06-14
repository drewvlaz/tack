#!/usr/bin/env bash
# Capture a real retailer page as a parser fixture.
#
# Usage:
#   ./scripts/capture-fixture.sh <name> <url>
#
# Writes test/parser/fixtures/<name>.html and a stub
# test/parser/fixtures/<name>.expected.json the caller fills in.
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "usage: $0 <name> <url>" >&2
  exit 2
fi

name="$1"
url="$2"
dir="$(cd "$(dirname "$0")/../test/parser/fixtures" && pwd)"
html="$dir/$name.html"
exp="$dir/$name.expected.json"

if [ -e "$html" ]; then
  echo "refusing to overwrite $html" >&2
  exit 1
fi

UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
curl -sSL --max-time 30 \
  -A "$UA" \
  -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8' \
  -H 'Accept-Language: en-US,en;q=0.9' \
  "$url" \
  -o "$html"
echo "wrote $html ($(wc -c < "$html") bytes)"

if [ ! -e "$exp" ]; then
  cat > "$exp" <<EOF
{
  "url": "$url",
  "title": "TODO",
  "imageMustMatch": [],
  "imageMustNotMatch": [],
  "notes": "TODO: capture details"
}
EOF
  echo "wrote stub $exp"
fi
