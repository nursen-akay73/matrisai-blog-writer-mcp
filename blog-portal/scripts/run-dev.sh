#!/usr/bin/env bash
# Her zaman nvm Node 20+ kullan (Homebrew node@18 PATH'te olsa bile).
set -e
cd "$(dirname "$0")/.."

pick_node() {
  local c
  for c in \
    "$HOME/.nvm/versions/node/v20.20.2/bin/node" \
    "$HOME/.nvm/versions/node/v20.20.1/bin/node" \
    "$HOME/.nvm/versions/node/v20.20.0/bin/node" \
    "$HOME/.nvm/versions/node/v20.19.4/bin/node" \
    "$HOME/.nvm/versions/node/v22.22.2/bin/node"
  do
    if [ -x "$c" ]; then
      echo "$c"
      return 0
    fi
  done
  return 1
}

NODE_BIN="$(pick_node || true)"

if [ -z "$NODE_BIN" ]; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [ -s "$NVM_DIR/nvm.sh" ]; then
    # shellcheck disable=SC1090
    . "$NVM_DIR/nvm.sh"
    nvm use 20 >/dev/null 2>&1 || true
    NODE_BIN="$(command -v node)"
  fi
fi

if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then
  echo "[dev] HATA: Node 20 bulunamadı. Önce: nvm install 20"
  exit 1
fi

MAJOR="$("$NODE_BIN" -p "process.versions.node.split('.')[0]")"
if [ "$MAJOR" -lt 20 ]; then
  echo "[dev] HATA: Node 20+ gerekli. Seçilen: $("$NODE_BIN" -v) ($NODE_BIN)"
  exit 1
fi

echo "[dev] Node: $("$NODE_BIN" -v) ($NODE_BIN)"
export PATH="$(dirname "$NODE_BIN"):$PATH"
exec "$NODE_BIN" scripts/dev.mjs
