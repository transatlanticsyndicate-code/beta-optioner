#!/bin/bash
set -e

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Начинаем деплой на test2.optioner.online...${NC}"

# Переходим в директорию проекта
cd /var/www/test2

# Pull последних изменений
echo -e "${BLUE}📥 Скачиваем изменения из GitHub...${NC}"
git pull origin main

# Backend
echo -e "${BLUE}🔧 Обновляем backend...${NC}"
cd backend

# Активируем виртуальное окружение
if [ ! -d "venv" ]; then
    echo -e "${BLUE}📦 Создаем виртуальное окружение...${NC}"
    python3 -m venv venv
fi

source venv/bin/activate

# Устанавливаем зависимости
echo -e "${BLUE}📦 Устанавливаем зависимости backend...${NC}"
pip install -r requirements.txt

# Применяем миграции (если есть)
if [ -f "alembic.ini" ]; then
    echo -e "${BLUE}🗄️  Применяем миграции БД...${NC}"
    alembic upgrade head
fi

# Перезапускаем backend через PM2
echo -e "${BLUE}🔄 Перезапускаем backend...${NC}"
pm2 restart optioner-backend-test2 || pm2 start /var/www/test2/ecosystem.test.config.js --name optioner-backend-test2

# Frontend
echo -e "${BLUE}🎨 Собираем frontend...${NC}"
cd ../frontend

# Устанавливаем зависимости
echo -e "${BLUE}📦 Устанавливаем зависимости frontend...${NC}"
npm install

# Собираем production build
echo -e "${BLUE}🏗️  Собираем production build...${NC}"
npm run build

# Проверяем статус PM2
echo -e "${BLUE}📊 Статус PM2:${NC}"
pm2 list

echo -e "${GREEN}✅ Деплой завершен!${NC}"
echo -e "${GREEN}🌐 Проверь: https://test2.optioner.online${NC}"
