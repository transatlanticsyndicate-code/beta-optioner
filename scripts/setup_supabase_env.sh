#!/bin/bash

# Скрипт для установки переменных окружения Supabase на beta сервере
# ЗАЧЕМ: Автоматизирует конфигурацию SSO при деплое
# ИСПОЛЬЗОВАНИЕ: ./scripts/setup_supabase_env.sh <SUPABASE_URL> <SUPABASE_ANON_KEY>

set -e

if [ $# -lt 2 ]; then
    echo "Использование: $0 <SUPABASE_URL> <SUPABASE_ANON_KEY>"
    echo ""
    echo "Пример:"
    echo "  $0 https://your-project.supabase.co your-anon-key-here"
    exit 1
fi

SUPABASE_URL="$1"
SUPABASE_ANON_KEY="$2"
SERVER_IP="89.117.52.143"
SERVER_USER="root"
SSH_KEY="~/.ssh/id_optioner_deploy"
ENV_FILE="/var/www/beta/frontend/.env"

echo "🔧 Установка переменных окружения Supabase на сервере..."
echo "   URL: $SUPABASE_URL"
echo "   Сервер: $SERVER_IP"

# Создание .env файла на сервере
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "$SERVER_USER@$SERVER_IP" "cat > $ENV_FILE << 'ENVEOF'
# Supabase Configuration for SSO Authentication
REACT_APP_SUPABASE_URL=$SUPABASE_URL
REACT_APP_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY

# Auth Configuration
REACT_APP_AUTH_DISABLED=false
ENVEOF"

echo "✅ Переменные окружения установлены в $ENV_FILE"
echo ""
echo "🔄 Перестраиваем и деплоим приложение..."

# Пересборка и деплой
ssh -o StrictHostKeyChecking=no -i "$SSH_KEY" "$SERVER_USER@$SERVER_IP" "cd /var/www/beta/frontend && npm run build && cd /var/www/beta && pm2 restart optioner-backend-beta"

echo "✅ Деплой завершен!"
