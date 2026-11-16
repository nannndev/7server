#!/usr/bin/env bash
# 7Server Linux VPS Installer (installs Node 22+ if needed, downloads the GitHub Release tarball,
# sets up /opt/sevenserver + /usr/local/bin/7server, and registers a systemd service).
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/nannndev/7server/main/install.sh | sudo bash
# Optional env vars:
#   SEVENSERVER_VERSION=0.3.1   (default: latest GitHub release)
#   SEVENSERVER_PORT=5001       (default: 5001)
#   SEVENSERVER_HOST=0.0.0.0    (default: 0.0.0.0)
set -euo pipefail

REPO="nannndev/7server"
INSTALL_DIR="/opt/sevenserver"
DATA_DIR="/var/lib/7server"
PORT="${SEVENSERVER_PORT:-5001}"
HOST="${SEVENSERVER_HOST:-0.0.0.0}"
REQ_NODE_MAJ=22
REQ_NODE_MIN=13

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root (e.g. curl -fsSL ... | sudo bash)" >&2
  exit 1
fi

log() { printf '\033[1;32m==>\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

need_cmd() { command -v "$1" >/dev/null 2>&1; }

install_node() {
  log "Installing Node.js 22 LTS..."
  if need_cmd apt-get; then
    apt-get update -qq
    apt-get install -y -qq curl ca-certificates gnupg >/dev/null
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
  elif need_cmd dnf; then
    dnf install -y -q curl ca-certificates >/dev/null
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - >/dev/null
    dnf install -y -q nodejs >/dev/null
  elif need_cmd yum; then
    yum install -y -q curl ca-certificates >/dev/null
    curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - >/dev/null
    yum install -y -q nodejs >/dev/null
  else
    err "Unsupported package manager. Please install Node.js >= ${REQ_NODE_MAJ}.${REQ_NODE_MIN} manually."
  fi
}

check_node() {
  if ! need_cmd node; then
    install_node
    return
  fi
  local ver maj min
  ver=$(node -v | sed 's/^v//')
  maj=${ver%%.*}
  min=$(echo "$ver" | cut -d. -f2)
  if [ "$maj" -lt "$REQ_NODE_MAJ" ] || { [ "$maj" -eq "$REQ_NODE_MAJ" ] && [ "$min" -lt "$REQ_NODE_MIN" ]; }; then
    log "Found Node.js v$ver (need >= ${REQ_NODE_MAJ}.${REQ_NODE_MIN})"
    install_node
  fi
}

resolve_version() {
  if [ -n "${SEVENSERVER_VERSION:-}" ]; then
    echo "${SEVENSERVER_VERSION#v}"
    return
  fi
  local tag
  tag=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log((d.tag_name||'').replace(/^v/i,''))")
  [ -n "$tag" ] || err "Could not resolve latest release version from GitHub."
  echo "$tag"
}

check_node
need_cmd curl || err "curl is required."
need_cmd tar || err "tar is required."

VERSION=$(resolve_version)
TARBALL_URL="https://github.com/${REPO}/releases/download/v${VERSION}/sevenserver-${VERSION}.tgz"
TMP_TGZ=$(mktemp /tmp/sevenserver-XXXXXX.tgz)
trap 'rm -f "$TMP_TGZ"' EXIT

log "Downloading 7Server v${VERSION} from GitHub Releases..."
curl -fL "$TARBALL_URL" -o "$TMP_TGZ" || err "Failed to download ${TARBALL_URL}"

log "Installing into ${INSTALL_DIR}..."
rm -rf "${INSTALL_DIR}.new"
mkdir -p "${INSTALL_DIR}.new" "$DATA_DIR"
tar -xzf "$TMP_TGZ" --strip-components=1 -C "${INSTALL_DIR}.new"
cd "${INSTALL_DIR}.new"
npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1

rm -rf "$INSTALL_DIR"
mv "${INSTALL_DIR}.new" "$INSTALL_DIR"
chmod +x "${INSTALL_DIR}/bin/7server.js"
ln -sf "${INSTALL_DIR}/bin/7server.js" /usr/local/bin/7server

if need_cmd systemctl && [ -d /run/systemd/system ]; then
  log "Configuring systemd service (sevenserver.service)..."
  cat > /etc/systemd/system/sevenserver.service <<EOF
[Unit]
Description=7Server Self-Hosted VPS & AI Gateway Dashboard
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/7server --host ${HOST} --port ${PORT} --data ${DATA_DIR} --no-open --no-update-check
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now sevenserver
  log "7Server v${VERSION} is running! Open http://$(hostname -I | awk '{print $1}'):${PORT}"
else
  log "7Server v${VERSION} installed! Start it with: 7server --host ${HOST} --port ${PORT}"
fi
