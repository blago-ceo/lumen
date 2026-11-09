#!/usr/bin/env bash
# Обновить Lumen на сервере до последней версии из GitHub: bash /opt/lumen/deploy/update.sh
set -euo pipefail
DIR="/opt/lumen"
sudo -u lumen bash -c "cd '$DIR' && git pull --ff-only && npm ci --no-audit --no-fund && npm run build"
systemctl restart lumen
echo "✓ Обновлено: $(sudo -u lumen git -C "$DIR" log --oneline -1)"
