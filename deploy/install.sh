#!/usr/bin/env bash
# Развёртывание SpendTrack на сервере (Ubuntu). Идемпотентно: можно повторять.
# Запуск из корня репозитория:  sudo bash deploy/install.sh
set -euo pipefail

APP_DIR=/opt/spendtrack
DATA_DIR=/var/lib/spendtrack
ETC_DIR=/etc/spendtrack
USER=spendtrack

echo "==> Пользователь $USER"
id -u "$USER" &>/dev/null || useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$USER"

echo "==> Каталоги"
mkdir -p "$APP_DIR" "$DATA_DIR" "$ETC_DIR"

echo "==> Код в $APP_DIR"
# Копируем пакет и веб (без venv/data/тестов).
rsync -a --delete \
  --exclude venv --exclude data --exclude '__pycache__' --exclude '.git' \
  ./spendtrack ./web ./requirements.txt "$APP_DIR/"

echo "==> Виртуальное окружение"
python3 -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install --upgrade pip
"$APP_DIR/venv/bin/pip" install -r "$APP_DIR/requirements.txt"

echo "==> Переменные окружения"
if [ ! -f "$ETC_DIR/spendtrack.env" ]; then
  cp deploy/spendtrack.env.example "$ETC_DIR/spendtrack.env"
  echo "    создан $ETC_DIR/spendtrack.env — впишите токен, id и PIN!"
fi
chmod 600 "$ETC_DIR/spendtrack.env"

echo "==> Права"
chown -R "$USER:$USER" "$APP_DIR" "$DATA_DIR"
chown root:"$USER" "$ETC_DIR/spendtrack.env"

echo "==> systemd-юниты"
cp deploy/spendtrack.service deploy/spendtrack-web.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now spendtrack spendtrack-web

echo "==> Готово. Статус:"
systemctl --no-pager --lines=0 status spendtrack spendtrack-web || true
echo "Логи: journalctl -u spendtrack -f   |   journalctl -u spendtrack-web -f"
