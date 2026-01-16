#!/bin/bash

# Скрипт для добавления API ключей в .env файл beta окружения
# ЗАЧЕМ: Backend требует API ключи для работы с внешними сервисами

set -euo pipefail

PROJECT_DIR="/var/www/beta"
ENV_FILE="$PROJECT_DIR/backend/.env"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_info "Добавляю API ключи в .env файл beta"

# Копирую API ключи из production окружения
log_info "Копирую API ключи из production..."

# Получаю POLYGON_API_KEY из production
PROD_POLYGON_KEY=$(grep "^POLYGON_API_KEY=" /var/www/production/backend/.env 2>/dev/null | cut -d'=' -f2 || echo "")
PROD_GEMINI_KEY=$(grep "^GEMINI_API_KEY=" /var/www/production/backend/.env 2>/dev/null | cut -d'=' -f2 || echo "")
PROD_FRED_KEY=$(grep "^FRED_API_KEY=" /var/www/production/backend/.env 2>/dev/null | cut -d'=' -f2 || echo "")
PROD_TELEGRAM_TOKEN=$(grep "^TELEGRAM_BOT_TOKEN=" /var/www/production/backend/.env 2>/dev/null | cut -d'=' -f2 || echo "")
PROD_TELEGRAM_CHANNEL=$(grep "^TELEGRAM_CHANNEL_ID=" /var/www/production/backend/.env 2>/dev/null | cut -d'=' -f2 || echo "")

# Обновляю .env файл beta с API ключами
log_info "Обновляю .env файл с API ключами..."

# Создаю новый .env файл с полной конфигурацией
cat > "$ENV_FILE" << EOF
# Beta окружение - API ключи скопированы из production
DATABASE_URL=postgresql://beta_user:$(grep "^DATABASE_URL=" "$ENV_FILE" | cut -d':' -f3 | cut -d'@' -f1)@localhost:5432/beta_optioner
ENVIRONMENT=beta
HOST=0.0.0.0
PORT=8002

# Источник данных опционов
OPTIONS_DATA_SOURCE=yahoo

# Polygon.io API Key
POLYGON_API_KEY=${PROD_POLYGON_KEY:-your_polygon_api_key_here}

# AI провайдер
AI_PROVIDER=gemini

# Google Gemini
GEMINI_API_KEY=${PROD_GEMINI_KEY:-your_gemini_api_key_here}
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TEMPERATURE=0.3
GEMINI_TOP_P=0.8
GEMINI_TOP_K=40
GEMINI_MAX_TOKENS=2048

# FRED API (Treasury Rate)
FRED_API_KEY=${PROD_FRED_KEY:-your_fred_api_key_here}

# Telegram (опционально)
TELEGRAM_BOT_TOKEN=${PROD_TELEGRAM_TOKEN:-}
TELEGRAM_CHANNEL_ID=${PROD_TELEGRAM_CHANNEL:-}

# Кэширование
CACHE_TTL=300

# Логирование
LOG_LEVEL=INFO

# CORS
ALLOWED_ORIGINS=https://beta.optioner.online,https://www.beta.optioner.online

# Base URL
BASE_URL=https://beta.optioner.online
EOF

sudo chown deploy:deploy "$ENV_FILE"
sudo chmod 600 "$ENV_FILE"

log_info "=========================================="
log_info ".env файл обновлен успешно!"
log_info "=========================================="
log_info ""
log_info "Проверка API ключей:"
if [ -n "$PROD_POLYGON_KEY" ]; then
    log_info "  ✓ POLYGON_API_KEY скопирован"
else
    log_warn "  ✗ POLYGON_API_KEY не найден в production"
fi

if [ -n "$PROD_GEMINI_KEY" ]; then
    log_info "  ✓ GEMINI_API_KEY скопирован"
else
    log_warn "  ✗ GEMINI_API_KEY не найден в production"
fi

if [ -n "$PROD_FRED_KEY" ]; then
    log_info "  ✓ FRED_API_KEY скопирован"
else
    log_warn "  ✗ FRED_API_KEY не найден в production"
fi

log_info ""
log_info "Следующий шаг: перезапустить backend"
log_info "  pm2 restart optioner-backend-beta"
log_info "=========================================="
