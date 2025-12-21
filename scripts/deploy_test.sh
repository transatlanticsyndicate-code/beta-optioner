#!/usr/bin/env bash
# Скрипт деплоя на тестовый сервер test.optioner.online
# ЗАЧЕМ: Автоматизация деплоя с обработкой ошибок и логированием
# Использование: bash scripts/deploy_test.sh [branch]
# Пример: bash scripts/deploy_test.sh main

set -euo pipefail

# ============== Конфигурация ==============
PROJECT_DIR="/var/www/test"
BRANCH="${1:-main}"
PM2_APP_NAME="optioner-backend-test"

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ============== Функции ==============
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# ============== Начало деплоя ==============
echo ""
echo "========================================"
log_info "🚀 Деплой на test.optioner.online"
log_info "📌 Ветка: $BRANCH"
log_info "📁 Директория: $PROJECT_DIR"
echo "========================================"
echo ""

# Проверяем директорию
if [ ! -d "$PROJECT_DIR" ]; then
    log_error "Директория $PROJECT_DIR не существует!"
    exit 1
fi

cd "$PROJECT_DIR"

# ============== Git ==============
log_info "📥 Скачиваем изменения из GitHub..."
git fetch origin

# Проверяем наличие локальных изменений
if [ -n "$(git status --porcelain)" ]; then
    log_warn "Есть локальные изменения, сохраняем в stash..."
    git stash --include-untracked || true
fi

git checkout "$BRANCH"
git pull origin "$BRANCH"
log_success "Git обновлён"

# ============== Backend ==============
log_info "🔧 Обновляем backend..."
cd "$PROJECT_DIR/backend"

# Виртуальное окружение
if [ ! -d "venv" ]; then
    log_info "📦 Создаём виртуальное окружение..."
    python3 -m venv venv
fi

source venv/bin/activate

# Зависимости
log_info "📦 Устанавливаем зависимости backend..."
pip install -r requirements.txt --quiet

# Миграции
if [ -f "alembic.ini" ]; then
    log_info "🗄️ Применяем миграции БД..."
    alembic upgrade head || log_warn "Миграции не применены"
fi

# Перезапуск PM2
log_info "🔄 Перезапускаем backend..."
if pm2 describe "$PM2_APP_NAME" > /dev/null 2>&1; then
    pm2 restart "$PM2_APP_NAME"
else
    log_warn "Процесс $PM2_APP_NAME не найден, запускаем..."
    pm2 start "$PROJECT_DIR/ecosystem.test.config.js"
fi
log_success "Backend перезапущен"

# ============== Frontend ==============
log_info "🎨 Собираем frontend..."
cd "$PROJECT_DIR/frontend"

# Зависимости
log_info "📦 Устанавливаем зависимости frontend..."
npm install --silent

# Сборка
log_info "🏗️ Собираем production build..."
npm run build

log_success "Frontend собран"

# ============== Финал ==============
echo ""
echo "========================================"
log_info "📊 Статус PM2:"
pm2 list
echo "========================================"
log_success "✅ Деплой завершён!"
log_success "🌐 Проверь: https://test.optioner.online"
echo ""
