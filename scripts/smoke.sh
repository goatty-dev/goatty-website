#!/usr/bin/env bash
# Smoke-check the built static site.
#
# Asserts the expected files landed in dist/ (no server needed) and then serves
# dist/ through `wrangler dev` to verify the Worker asset config that actually
# ships (html_handling: drop-trailing-slash, not_found_handling: 404-page).
#
# Every wait and request is bounded, and the server is always torn down, so
# this can never sit forever on a stray process like a dev server would.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"
PORT="${SMOKE_PORT:-8795}"
BASE="http://127.0.0.1:$PORT"
STARTUP_TIMEOUT="${SMOKE_STARTUP_TIMEOUT:-90}"
LOG="$(mktemp -t smoke-server.XXXXXX.log)"
SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    # Negative PID targets the process group (wrangler + workerd children).
    kill -TERM "-$SERVER_PID" 2>/dev/null || kill -TERM "$SERVER_PID" 2>/dev/null || true
    for _ in $(seq 1 20); do
      kill -0 "$SERVER_PID" 2>/dev/null || break
      sleep 0.5
    done
    kill -KILL "-$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  rm -f "$LOG"
}
trap cleanup EXIT INT TERM

fail() {
  echo "::error::$*" >&2
  if [[ -s "$LOG" ]]; then
    echo "--- server log (last 40 lines) ---" >&2
    tail -n 40 "$LOG" >&2
  fi
  exit 1
}

status_code() {
  curl -s -o /dev/null --max-time 5 -w '%{http_code}' "$BASE$1" 2>/dev/null || echo "000"
}

expect_status() {
  local path="$1" want="$2" got
  got="$(status_code "$path")"
  [[ "$got" == "$want" ]] || fail "GET $path returned $got, expected $want"
  echo "ok: GET $path -> $got"
}

expect_body() {
  local path="$1" needle="$2" body
  # No --fail: the status code is asserted separately, and the 404 page is a
  # real 404 response whose body we still want to inspect.
  body="$(curl -s --max-time 5 "$BASE$path")" || fail "GET $path failed"
  grep -q -- "$needle" <<<"$body" ||
    fail "GET $path did not contain '$needle'"
  echo "ok: GET $path contains '$needle'"
}

expect_redirect() {
  local path="$1" want="$2" got
  got="$(curl -s -o /dev/null --max-time 5 -w '%{http_code} %{redirect_url}' "$BASE$path" 2>/dev/null)" || got="000"
  [[ "$got" == "302 $want" ]] || fail "GET $path returned '$got', expected '302 $want'"
  echo "ok: GET $path -> $got"
}

echo "==> Static files in dist/"
for file in \
  index.html \
  404.html \
  _redirects \
  robots.txt \
  sitemap-index.xml \
  docs/index.html \
  docs/getting-started/index.html; do
  [[ -f "$DIST/$file" ]] || fail "missing dist/$file"
  echo "ok: dist/$file"
done

grep -q "<html" "$DIST/index.html" || fail "dist/index.html is not an HTML document"
grep -q "Sitemap:" "$DIST/robots.txt" || fail "dist/robots.txt has no Sitemap directive"
grep -q "sitemap-0.xml" "$DIST/sitemap-index.xml" || fail "dist/sitemap-index.xml has no page sitemap"

echo "==> Serving dist/ with wrangler on port $PORT"
CI=true WRANGLER_SEND_METRICS=false \
  setsid bunx wrangler dev --port "$PORT" --ip 127.0.0.1 >"$LOG" 2>&1 &
SERVER_PID=$!

ready=""
for _ in $(seq 1 "$STARTUP_TIMEOUT"); do
  kill -0 "$SERVER_PID" 2>/dev/null || fail "wrangler dev exited before serving dist/"
  # Wait for our own assets, not just any 200, so a stray server on this port
  # cannot make the checks below pass or fail for the wrong reason.
  if curl -s --max-time 5 "$BASE/robots.txt" 2>/dev/null | grep -q "Sitemap:"; then
    ready=1
    break
  fi
  sleep 1
done
[[ -n "$ready" ]] || fail "server did not respond on $BASE within ${STARTUP_TIMEOUT}s"

echo "==> HTTP assertions"
expect_status / 200
expect_status /docs/getting-started 200
expect_status /robots.txt 200
expect_status /sitemap-index.xml 200
expect_status /does-not-exist 404
expect_redirect /install.sh https://raw.githubusercontent.com/goatty-dev/goatty/main/scripts/get-goatty.sh
expect_redirect /install.ps1 https://raw.githubusercontent.com/goatty-dev/goatty/main/scripts/get-goatty.ps1

expect_body / "<html"
expect_body /docs/getting-started "getting-started"
expect_body /robots.txt "Sitemap:"
expect_body /sitemap-index.xml "sitemap-0.xml"
expect_body /does-not-exist "Page not found"

echo "==> Smoke test passed"
