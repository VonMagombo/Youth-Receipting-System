#!/usr/bin/env bash
# Run a build command and retry it only when it failed while downloading something.
#   retry-on-network.sh <attempts> <delay-seconds> -- <command...>
# Real build errors (compile failures, bad config) fail at once; only network failures retry,
# since those come from outages upstream (e.g. a 504 from a mirror) and pass minutes later.
# Gradle keeps what it already downloaded, so each retry only fetches what is still missing.
set -uo pipefail

attempts=$1 delay=$2
[ "${3:-}" = "--" ] || { echo "usage: $0 <attempts> <delay-seconds> -- <command...>" >&2; exit 2; }
shift 3

NETWORK='Could not (GET|HEAD|download) |Received status code 5[0-9][0-9]|Read timed out|Connect(ion)? (reset|refused|timed out)|Remote host terminated|UnknownHostException|SSLHandshakeException'

log=$(mktemp)
trap 'rm -f "$log"' EXIT
status=1
for ((i = 1; i <= attempts; i++)); do
  "$@" 2>&1 | tee "$log"
  status=${PIPESTATUS[0]}
  [ "$status" -eq 0 ] && exit 0
  if ! grep -qE "$NETWORK" "$log"; then
    echo "Build failed, and not on a download: not retrying."
    exit "$status"
  fi
  if [ "$i" -lt "$attempts" ]; then
    echo "::warning::Build failed on a network download (attempt $i of $attempts). Retrying in ${delay}s."
    sleep "$delay"
  fi
done
echo "::error::Build still failing on network downloads after $attempts attempts. The outage is upstream; re-run later."
exit "$status"
