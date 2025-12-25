#!/bin/bash

# Скрипт развертывания beta окружения на сервере
# ЗАЧЕМ: Автоматизированное и безопасное развертывание beta.optioner.online
# Генерирует пароли, создает БД, клонирует код, настраивает окружение

set -euo pipefail

# ============== Конфигурация ==============
PROJECT_DIR="/var/www/beta"
DEPLOY_USER="deploy"
DB_USER="beta_user"
DB_NAME="beta_optioner"
DB_PORT="5432"
BACKEND_PORT="8002"
GITHUB_REPO="https://github.com/transatlanticsyndicate-code/modular-code-methodology.git"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ============== Функции ==============

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Генерация безопасного пароля (32 символа)
generate_password() {
    openssl rand -base64 24 | tr -d "=+/" | cut -c1-32
}

# ============== Начало развертывания ==============

log_info "Начинаю развертывание beta.optioner.online"

# 1. Подготовка директорий
log_info "Подготовка директорий..."
# Если директория не существует, создаем её
if [ ! -d "$PROJECT_DIR" ]; then
    sudo mkdir -p "$PROJECT_DIR"
    sudo chown "$DEPLOY_USER:$DEPLOY_USER" "$PROJECT_DIR"
    sudo chmod 755 "$PROJECT_DIR"
fi
log_info "Директория готова"

# 2. Генерация безопасного пароля для БД
log_info "Генерация безопасного пароля для базы данных..."
DB_PASSWORD=$(generate_password)
log_info "Пароль сгенерирован (сохраните его в безопасном месте)"

# 3. Создание пользователя и БД PostgreSQL
log_info "Создание пользователя и базы данных PostgreSQL..."

# Проверка существования пользователя
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    log_warn "Пользователь $DB_USER уже существует, обновляю пароль..."
    sudo -u postgres psql -c "ALTER USER $DB_USER PASSWORD '$DB_PASSWORD';"
else
    log_info "Создаю пользователя $DB_USER..."
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
fi

# Проверка существования БД
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
    log_warn "База данных $DB_NAME уже существует, пропускаю создание"
else
    log_info "Создаю базу данных $DB_NAME..."
    sudo -u postgres createdb "$DB_NAME" -O "$DB_USER"
fi

# Выдача прав
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
log_info "Права выданы"

# 4. Клонирование репозитория
log_info "Клонирование репозитория..."
TEMP_CLONE_DIR="/tmp/beta_clone_$$"

if [ -d "$PROJECT_DIR/.git" ]; then
    log_warn "Репозиторий уже существует, обновляю..."
    cd "$PROJECT_DIR"
    sudo -u "$DEPLOY_USER" git pull origin main
else
    log_info "Клонирую новый репозиторий во временную директорию..."
    sudo -u "$DEPLOY_USER" git clone "$GITHUB_REPO" "$TEMP_CLONE_DIR"
    
    log_info "Перемещаю файлы в $PROJECT_DIR..."
    sudo mv "$TEMP_CLONE_DIR"/* "$PROJECT_DIR/" 2>/dev/null || true
    sudo mv "$TEMP_CLONE_DIR"/.* "$PROJECT_DIR/" 2>/dev/null || true
    sudo rm -rf "$TEMP_CLONE_DIR"
    
    sudo chown -R "$DEPLOY_USER:$DEPLOY_USER" "$PROJECT_DIR"
fi
log_info "Репозиторий готов"

# 5. Создание .env файла для backend
log_info "Создание .env файла для backend..."
cat > "$PROJECT_DIR/backend/.env" << EOF
# Beta окружение
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:$DB_PORT/$DB_NAME
ENVIRONMENT=beta
HOST=0.0.0.0
PORT=$BACKEND_PORT
EOF

sudo chown "$DEPLOY_USER:$DEPLOY_USER" "$PROJECT_DIR/backend/.env"
sudo chmod 600 "$PROJECT_DIR/backend/.env"
log_info ".env файл создан с правильными правами доступа"

# 6. Установка зависимостей backend
log_info "Установка зависимостей backend..."
cd "$PROJECT_DIR/backend"
if [ ! -d "venv" ]; then
    sudo -u "$DEPLOY_USER" python3 -m venv venv
fi
sudo -u "$DEPLOY_USER" bash -c "source venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt"
log_info "Backend зависимости установлены"

# 7. Установка зависимостей frontend
log_info "Установка зависимостей frontend..."
cd "$PROJECT_DIR/frontend"
sudo -u "$DEPLOY_USER" npm install
log_info "Frontend зависимости установлены"

# 8. Сборка frontend
log_info "Сборка frontend..."
sudo -u "$DEPLOY_USER" npm run build
log_info "Frontend собран"

# 9. Создание логов
log_info "Инициализация логов..."
sudo touch "$PROJECT_DIR/logs/backend-error.log"
sudo touch "$PROJECT_DIR/logs/backend-out.log"
sudo chown "$DEPLOY_USER:$DEPLOY_USER" "$PROJECT_DIR/logs"/*
log_info "Логи инициализированы"

# ============== Вывод информации ==============

log_info "=========================================="
log_info "Развертывание завершено успешно!"
log_info "=========================================="
log_info ""
log_info "Информация для конфигурации:"
log_info "  Проект: $PROJECT_DIR"
log_info "  Backend порт: $BACKEND_PORT"
log_info "  База данных: $DB_NAME"
log_info "  Пользователь БД: $DB_USER"
log_info "  Пароль БД: $DB_PASSWORD"
log_info ""
log_info "Следующие шаги:"
log_info "  1. Загрузить nginx.beta.conf на сервер"
log_info "  2. Загрузить ecosystem.beta.config.js на сервер"
log_info "  3. Получить SSL сертификат: certbot --nginx -d beta.optioner.online"
log_info "  4. Запустить backend: pm2 start ecosystem.beta.config.js"
log_info "  5. Проверить: curl https://beta.optioner.online/api/health"
log_info ""
log_info "ВАЖНО: Сохраните пароль БД в безопасном месте!"
log_info "=========================================="

# Сохранение информации в файл для последующего использования
cat > "$PROJECT_DIR/.deployment-info" << EOF
# Информация о развертывании beta окружения
# Дата: $(date)
# ВАЖНО: Этот файл содержит чувствительную информацию, храните в безопасности

PROJECT_DIR=$PROJECT_DIR
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
BACKEND_PORT=$BACKEND_PORT
DEPLOY_USER=$DEPLOY_USER
EOF

sudo chmod 600 "$PROJECT_DIR/.deployment-info"
log_info "Информация о развертывании сохранена в $PROJECT_DIR/.deployment-info"
