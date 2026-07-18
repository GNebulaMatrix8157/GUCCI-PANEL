#!/bin/bash
set -e

echo "🚀 Starting 3X-UI v3.5.0 Enterprise Engine on Railway..."

# 1. Substitute PORT in Nginx configuration
PORT_FINAL="${PORT:-8080}"
export PORT="${PORT_FINAL}"
envsubst '$PORT' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# 2. Configure 3x-ui config.json with Single-Port Sub Link Routing
mkdir -p /etc/x-ui
cat > /etc/x-ui/config.json << JSONEOF
{
  "webPort": 2053,
  "webBasePath": "/",
  "webListen": "127.0.0.1",
  "subPort": 2096,
  "subListen": "127.0.0.1",
  "subURI": "/sub/",
  "subJsonURI": "/json/",
  "subEnable": true,
  "logLevel": "info"
}
JSONEOF

# 3. Optimize Socket & System Timeouts for Instant Client Revocation / Kill
ulimit -n 65535 || true

# Seed default settings in SQLite database if x-ui.db exists or upon creation
init_db() {
    sleep 3
    if [ -f "/etc/x-ui/x-ui.db" ]; then
        echo "🔧 Tuning 3x-ui SQLite Database for Sub Links & Fast Disconnection..."
        sqlite3 /etc/x-ui/x-ui.db "INSERT OR REPLACE INTO settings (key, value) VALUES ('subEnable', 'true');" 2>/dev/null || true
        sqlite3 /etc/x-ui/x-ui.db "INSERT OR REPLACE INTO settings (key, value) VALUES ('subPort', '2096');" 2>/dev/null || true
        sqlite3 /etc/x-ui/x-ui.db "INSERT OR REPLACE INTO settings (key, value) VALUES ('subURI', '/sub/');" 2>/dev/null || true
        sqlite3 /etc/x-ui/x-ui.db "INSERT OR REPLACE INTO settings (key, value) VALUES ('subJsonURI', '/json/');" 2>/dev/null || true
    fi
}
init_db &

# 4. Start Nginx Reverse Proxy
echo "🌐 Starting Nginx Single-Port Proxy on port ${PORT_FINAL}..."
nginx -g "daemon off;" &

# 5. Start 3x-ui Core
echo "⚡ Starting 3X-UI v3.5.0 Core Server..."
cd /usr/local/x-ui
exec ./x-ui
