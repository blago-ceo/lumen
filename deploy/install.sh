#!/usr/bin/env bash
# Установка Lumen на чистый VPS (Ubuntu 22.04 / 24.04), запускать от root:
#   curl -fsSL https://raw.githubusercontent.com/blago-ceo/lumen/main/deploy/install.sh -o install.sh && bash install.sh
#
# Что делает: Node.js 24, код из GitHub, сборка сайта, автозапуск через systemd,
# HTTPS через Caddy. Домен не обязателен — без него будет адрес вида https://1-2-3-4.sslip.io
set -euo pipefail

REPO="https://github.com/blago-ceo/lumen.git"
DIR="/opt/lumen"
APP_USER="lumen"
PORT="8790"

say() { printf '\n\033[1;37m✦ %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Запустите от root (sudo -i)"
command -v apt-get >/dev/null || die "Нужна Ubuntu или Debian"

# ───── вопросы ─────
IP="$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}')"
DEFAULT_DOMAIN="$(echo "$IP" | tr . -).sslip.io"

if [ -z "${BOT_TOKEN:-}" ]; then
  read -rp "Токен бота от @BotFather: " BOT_TOKEN </dev/tty
fi
[ -n "$BOT_TOKEN" ] || die "Токен бота обязателен"
if [ -z "${ADMIN_IDS:-}" ]; then
  read -rp "Ваш Telegram ID (узнать у @userinfobot): " ADMIN_IDS </dev/tty
fi
if [ -z "${DOMAIN:-}" ]; then
  read -rp "Домен (Enter — использовать $DEFAULT_DOMAIN): " DOMAIN </dev/tty
fi
DOMAIN="${DOMAIN:-$DEFAULT_DOMAIN}"
if [ -z "${ANTHROPIC_API_KEY+x}" ]; then
  read -rp "Ключ Anthropic для ИИ-откликов (Enter — пропустить): " ANTHROPIC_API_KEY </dev/tty
fi

# ───── swap: на 1 ГБ памяти сборке сайта может не хватить ─────
if ! swapon --show | grep -q .; then
  say "Создаю swap 2 ГБ"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ───── пакеты ─────
say "Ставлю системные пакеты"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https openssl >/dev/null

if ! node -v 2>/dev/null | grep -q '^v2[4-9]'; then
  say "Ставлю Node.js 24"
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
node -v

if ! command -v caddy >/dev/null; then
  say "Ставлю Caddy (HTTPS)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi

# ───── код ─────
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
if [ -d "$DIR/.git" ]; then
  say "Обновляю код"
  sudo -u "$APP_USER" git -C "$DIR" pull --ff-only
else
  say "Скачиваю код"
  git clone --depth 1 "$REPO" "$DIR"
fi

# ───── .env (секреты живут только на сервере) ─────
if [ ! -f "$DIR/.env" ]; then
  say "Создаю .env"
  cat > "$DIR/.env" <<ENV
BOT_TOKEN=$BOT_TOKEN
WEBAPP_URL=https://$DOMAIN
ADMIN_IDS=$ADMIN_IDS
APP_SECRET=$(openssl rand -hex 32)
PORT=$PORT
DEV_AUTH=0
PRICE_RUB=270
PRICE_STARS=180
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
AI_MODEL=claude-opus-5-5
TG_API_ID=
TG_API_HASH=
TWOGIS_KEY=
ENV
else
  say ".env уже есть — оставляю как есть"
fi
chmod 600 "$DIR/.env"
chown -R "$APP_USER:$APP_USER" "$DIR"

say "Устанавливаю зависимости и собираю сайт (пара минут)"
sudo -u "$APP_USER" bash -c "cd '$DIR' && npm ci --no-audit --no-fund && npm run build"

# ───── автозапуск ─────
say "Настраиваю автозапуск"
cat > /etc/systemd/system/lumen.service <<UNIT
[Unit]
Description=Lumen (сайт, API, парсер, Telegram-бот)
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$DIR
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now lumen >/dev/null
systemctl restart lumen

# ───── HTTPS ─────
say "Настраиваю HTTPS для $DOMAIN"
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
  encode gzip
  reverse_proxy 127.0.0.1:$PORT
}
CADDY
systemctl reload caddy 2>/dev/null || systemctl restart caddy

if command -v ufw >/dev/null && ufw status | grep -q active; then
  ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

say "Проверяю"
for _ in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null || die "Сервер не поднялся — смотрите: journalctl -u lumen -n 50"

cat <<DONE

$(printf '\033[1;32m')✓ Готово!$(printf '\033[0m')

  Сайт:   https://$DOMAIN   (сертификат выпускается ~1 минуту)
  Бот:    кнопка «Lumen» в боте уже ведёт на сайт

  Логи:        journalctl -u lumen -f
  Перезапуск:  systemctl restart lumen
  Обновление:  bash $DIR/deploy/update.sh
  Настройки:   nano $DIR/.env   (потом systemctl restart lumen)

DONE
