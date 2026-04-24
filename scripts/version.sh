#!/usr/bin/env bash
# Print the current janus version

set -euo pipefail
JANUS_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
grep '"version"' "${JANUS_ROOT}/package.json" | head -1 | awk -F'"' '{print $4}'
