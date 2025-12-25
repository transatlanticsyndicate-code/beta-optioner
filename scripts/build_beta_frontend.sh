#!/bin/bash

# Скрипт сборки frontend для beta окружения
# ЗАЧЕМ: Установка зависимостей и сборка React приложения

set -euo pipefail

PROJECT_DIR="/var/www/beta"
DEPLOY_USER="deploy"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_info "Начинаю сборку frontend для beta"

# 1. Исправление прав доступа npm
log_info "Исправление прав доступа npm..."
sudo mkdir -p /home/deploy/.npm
sudo chown -R deploy:deploy /home/deploy/.npm
sudo chmod -R 755 /home/deploy/.npm

# 2. Очистка npm кэша
log_info "Очистка npm кэша..."
sudo -u deploy npm cache clean --force 2>/dev/null || true

# 3. Установка зависимостей frontend
log_info "Установка зависимостей frontend (это может занять 5-10 минут)..."
cd "$PROJECT_DIR/frontend"

# Используем --no-optional для ускорения установки
sudo -u deploy npm install --prefer-offline --no-audit 2>&1 | grep -E "(added|up to date|npm error)" || true

# Проверка успешности установки
if [ -d "node_modules" ] && [ -f "node_modules/.bin/react-scripts" ]; then
    log_info "Зависимости установлены успешно"
else
    log_warn "Проблема с установкой зависимостей, пытаюсь еще раз..."
    sudo -u deploy npm install --legacy-peer-deps 2>&1 | tail -20
fi

# 4. Сборка frontend
log_info "Сборка frontend (это может занять 3-5 минут)..."
cd "$PROJECT_DIR/frontend"

# Установка переменной окружения для сборки
export GENERATE_SOURCEMAP=false
export CI=false

sudo -u deploy bash -c "export GENERATE_SOURCEMAP=false && export CI=false && npm run build 2>&1" | tail -50

# Проверка результата сборки
if [ -d "build" ] && [ -f "build/index.html" ]; then
    log_info "Frontend успешно собран!"
    log_info "Размер build: $(du -sh build | cut -f1)"
else
    log_warn "Ошибка при сборке frontend"
    exit 1
fi

log_info "=========================================="
log_info "Сборка frontend завершена!"
log_info "=========================================="
