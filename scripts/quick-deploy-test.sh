#!/bin/bash
set -e

echo "🚀 Быстрый деплой на test сервер..."

# Переходим в директорию проекта
cd /var/www/test

# Получаем текущий коммит
OLD_COMMIT=$(git rev-parse HEAD)

# Обновляем код
echo "📥 Обновление кода..."
git fetch origin
git pull origin main

# Получаем новый коммит
NEW_COMMIT=$(git rev-parse HEAD)

# Проверяем были ли изменения
if [ "$OLD_COMMIT" = "$NEW_COMMIT" ]; then
    echo "✅ Нет новых изменений"
    exit 0
fi

# Проверяем были ли изменения в frontend
FRONTEND_CHANGED=$(git diff --name-only $OLD_COMMIT $NEW_COMMIT | grep -c "^frontend/" || true)

if [ "$FRONTEND_CHANGED" -gt 0 ]; then
    echo "🔨 Сборка frontend..."
    cd frontend
    npm install --no-audit --no-fund --prefer-offline
    npm run build
    cd ..
    echo "🔄 Перезагрузка nginx..."
    systemctl reload nginx
else
    echo "⏩ Frontend не изменился, пропускаем сборку"
fi

# Проверяем были ли изменения в backend
BACKEND_CHANGED=$(git diff --name-only $OLD_COMMIT $NEW_COMMIT | grep -c "^backend/" || true)

if [ "$BACKEND_CHANGED" -gt 0 ]; then
    echo "🔧 Обновление backend..."
    cd backend
    source venv/bin/activate
    pip install -r requirements.txt --quiet
    cd ..
    echo "🔄 Перезапуск backend..."
    pm2 restart optioner-backend-test
else
    echo "⏩ Backend не изменился, пропускаем перезапуск"
fi

echo "✅ Деплой завершен за $(($SECONDS / 60))м $(($SECONDS % 60))с"
