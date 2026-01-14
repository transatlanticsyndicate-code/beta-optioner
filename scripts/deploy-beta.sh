#!/bin/bash

# Скрипт для автоматического деплоя на beta сервер
# Использование: ./scripts/deploy-beta.sh "Описание коммита"

set -e

# Конфигурация
BETA_HOST="89.117.52.143"
BETA_USER="root"
BETA_PATH="/var/www/beta"
BETA_SSH_PASSWORD="${BETA_SSH_PASSWORD:-Z#yyJl7e34sptFij}"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функция для вывода сообщений
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Проверка аргументов
if [ -z "$1" ]; then
    log_error "Использование: ./scripts/deploy-beta.sh \"Описание коммита\""
    exit 1
fi

COMMIT_MSG="$1"

log_info "=== ДЕПЛОЙ НА BETA СЕРВЕР ==="
log_info "Сервер: $BETA_HOST"
log_info "Путь: $BETA_PATH"
log_info "Сообщение коммита: $COMMIT_MSG"
echo ""

# Шаг 1: Коммит и пуш в origin (modular-code-methodology)
log_info "Шаг 1: Коммит в origin (modular-code-methodology)"
git add -A
git commit -m "$COMMIT_MSG" || log_warn "Нет изменений для коммита"
git push origin main
log_info "✓ Пушил в origin"
echo ""

# Шаг 2: Пуш в beta (optioner-beta-deploy2)
log_info "Шаг 2: Пуш в beta (optioner-beta-deploy2)"
git push beta main
log_info "✓ Пушил в beta"
echo ""

# Шаг 3: Обновление на сервере
log_info "Шаг 3: Обновление на сервере"
log_info "Подключение к $BETA_HOST..."

# Используем sshpass для автоматического ввода пароля
if ! command -v sshpass &> /dev/null; then
    log_error "sshpass не установлен. Установите: brew install sshpass"
    exit 1
fi

# Команда для выполнения на сервере
DEPLOY_CMD="
cd $BETA_PATH && \
git pull origin main && \
log_info 'Git pull завершён' && \
npm --prefix frontend run build && \
log_info 'Frontend build завершён' && \
systemctl reload nginx && \
log_info 'Nginx перезагружен' && \
pm2 restart all && \
log_info 'PM2 процессы перезагружены'
"

# Выполняем команду на сервере
sshpass -p "$BETA_SSH_PASSWORD" ssh -o StrictHostKeyChecking=no \
    "$BETA_USER@$BETA_HOST" \
    "cd $BETA_PATH && git pull origin main && npm --prefix frontend run build && systemctl reload nginx && pm2 restart all"

if [ $? -eq 0 ]; then
    log_info "✓ Сервер обновлён успешно"
else
    log_error "Ошибка при обновлении сервера"
    exit 1
fi

echo ""
log_info "=== ДЕПЛОЙ ЗАВЕРШЁН ==="
log_info "Проверьте: https://beta.optioner.online"
log_info "Очистите кэш браузера: Ctrl+Shift+Delete → 'Все время'"
