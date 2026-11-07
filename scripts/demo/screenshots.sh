#!/usr/bin/env bash
# Captures every page in dark and light from a running demo instance (see README.md in this folder).
#   SERVER_ID=<id of prod-web-01> scripts/demo/screenshots.sh [out-dir]
# The browser must already be signed in to the demo (agent-browser session "7s-shots").
set -euo pipefail
export AGENT_BROWSER_SESSION=7s-shots
BASE=${BASE:-http://127.0.0.1:5301}
OUT=${1:-docs/screenshots}
S=${SERVER_ID:?set SERVER_ID to the demo web server id}
A=${API_SERVER_ID:-$S}  # the server whose docker CLI talks to the dind containers
mkdir -p "$OUT"

# name|hash route
PAGES=(
  "fleet-grid|#/fleet/grid"
  "fleet-rack|#/fleet/rack"
  "fleet-topology|#/fleet/topology"
  "fleet-matrix|#/fleet/matrix"
  "server-overview|#/servers/$S"
  "server-topology|#/servers/$S/topology"
  "templates|#/servers/$S/templates"
  "apps|#/servers/$S/webapps"
  "pm2|#/servers/$S/pm2"
  "docker|#/servers/$A/docker"
  "databases|#/servers/$A/databases"
  "cron|#/servers/$S/cron"
  "services|#/servers/$S/services"
  "nginx|#/servers/$S/nginx"
  "ssl|#/servers/$S/ssl"
  "ports|#/servers/$S/ports"
  "security|#/servers/$S/security"
  "backups|#/servers/$S/backups"
  "terminal|#/servers/$S/terminal"
  "monitoring|#/monitoring"
  "uptime|#/monitoring/uptime"
  "audit|#/monitoring/audit"
  "ai-gateway|#/ai-gateway"
  "ai-keys|#/ai-gateway/keys"
  "ai-usage|#/ai-gateway/usage"
  "users|#/users"
  "roles|#/users/roles"
  "integrations|#/settings/integrations"
)

agent-browser set viewport 1440 900 >/dev/null
for theme in dark light; do
  agent-browser eval "localStorage.setItem('vps_hub_theme','$theme'); localStorage.setItem('vps_hub_lang','en'); localStorage.setItem('vps_hub_privacy','0'); 1" >/dev/null
  for p in "${PAGES[@]}"; do
    name=${p%%|*}; route=${p#*|}
    agent-browser open "$BASE/$route" >/dev/null
    agent-browser reload >/dev/null   # theme is read on load
    agent-browser wait 3500 >/dev/null  # SSH-backed tabs fetch live data
    [ "$name" = server-overview ] && { agent-browser find role button click --name Refresh >/dev/null 2>&1 || true; agent-browser wait 5000 >/dev/null; }
    agent-browser screenshot "$OUT/$name-$theme.png" >/dev/null
    echo "$name-$theme"
  done
  agent-browser open "$BASE/#/servers/$S" >/dev/null; agent-browser wait 6000 >/dev/null
  # Copilot drawer over the server overview; the deploy wizard's first step (later steps need a real GitHub token).
  agent-browser find role button click --name "AI Copilot" >/dev/null 2>&1 || true
  agent-browser wait 2000 >/dev/null; agent-browser screenshot "$OUT/copilot-$theme.png" >/dev/null
  agent-browser open "$BASE/#/servers/$S/webapps" >/dev/null; agent-browser wait 3500 >/dev/null
  agent-browser find role button click --name "Deploy New App" >/dev/null 2>&1 || true
  agent-browser wait 3000 >/dev/null; agent-browser screenshot "$OUT/deploy-$theme.png" >/dev/null
done
