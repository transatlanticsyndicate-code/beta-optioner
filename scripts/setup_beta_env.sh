#!/bin/bash

# Скрипт настройки beta окружения после загрузки кода
# ЗАЧЕМ: Установка зависимостей, создание .env, сборка приложения

set -euo pipefail

PROJECT_DIR="/var/www/beta"
DEPLOY_USER="deploy"
DB_USER="beta_user"
DB_NAME="beta_optioner"
DB_PORT="5432"
BACKEND_PORT="8002"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Генерация безопасного пароля
generate_password() {
    openssl rand -base64 24 | tr -d "=+/" | cut -c1-32
}

log_info "Начинаю настройку beta окружения"

# 1. Генерация пароля БД
log_info "Генерация пароля для базы данных..."
DB_PASSWORD=$(generate_password)

# 2. Обновление пароля пользователя БД
log_info "Обновление пароля пользователя БД..."
sudo -u postgres psql -c "ALTER USER $DB_USER PASSWORD '$DB_PASSWORD';"

# 3. Создание .env для backend
log_info "Создание .env файла..."
cat > "$PROJECT_DIR/backend/.env" << EOF
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:$DB_PORT/$DB_NAME
ENVIRONMENT=beta
HOST=0.0.0.0
PORT=$BACKEND_PORT
EOF

sudo chown "$DEPLOY_USER:$DEPLOY_USER" "$PROJECT_DIR/backend/.env"
sudo chmod 600 "$PROJECT_DIR/backend/.env"

# 4. Установка backend зависимостей
log_info "Установка backend зависимостей..."
cd "$PROJECT_DIR/backend"
if [ ! -d "venv" ]; then
    sudo -u "$DEPLOY_USER" python3 -m venv venv
fi
sudo -u "$DEPLOY_USER" bash -c "source venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt" || {
    log_warn "Ошибка при установке backend зависимостей"
}

# 5. Установка frontend зависимостей
log_info "Установка frontend зависимостей..."
cd "$PROJECT_DIR/frontend"
sudo -u "$DEPLOY_USER" npm install || {
    log_warn "Ошибка при установке frontend зависимостей"
}

# 6. Сборка frontend
log_info "Сборка frontend..."
sudo -u "$DEPLOY_USER" npm run build || {
    log_warn "Ошибка при сборке frontend"
}

# 7. Создание логов
log_info "Инициализация логов..."
sudo mkdir -p "$PROJECT_DIR/logs"
sudo touch "$PROJECT_DIR/logs/backend-error.log"
sudo touch "$PROJECT_DIR/logs/backend-out.log"
sudo chown -R "$DEPLOY_USER:$DEPLOY_USER" "$PROJECT_DIR/logs"

# 8. Сохранение информации о развертывании
log_info "Сохранение информации о развертывании..."
cat > "$PROJECT_DIR/.deployment-info" << EOF
# Информация о развертывании beta окружения
# Дата: $(date)
# ВАЖНО: Этот файл содержит чувствительную информацию

PROJECT_DIR=$PROJECT_DIR
DB_NAME=$DB_NAME
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
BACKEND_PORT=$BACKEND_PORT
DEPLOY_USER=$DEPLOY_USER
EOF

sudo chmod 600 "$PROJECT_DIR/.deployment-info"

log_info "=========================================="
log_info "Настройка завершена!"
log_info "=========================================="
log_info ""
log_info "Информация для конфигурации:"
log_info "  Пароль БД: $DB_PASSWORD"
log_info "  Backend порт: $BACKEND_PORT"
log_info ""
log_info "Следующие шаги:"
log_info "  1. Загрузить nginx.beta.conf"
log_info "  2. Загрузить ecosystem.beta.config.js"
log_info "  3. Получить SSL: certbot --nginx -d beta.optioner.online"
log_info "  4. Запустить: pm2 start ecosystem.beta.config.js"
log_info "=========================================="
