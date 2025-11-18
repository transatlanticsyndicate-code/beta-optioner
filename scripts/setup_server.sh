#!/bin/bash
# Скрипт для первоначальной настройки тестового сервера
# Запускать на СЕРВЕРЕ (после подключения по SSH)

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🚀 Настройка тестового сервера test.optioner.online${NC}"
echo ""

# Шаг 1: Создание директорий
echo -e "${BLUE}📁 Шаг 1: Создание директорий...${NC}"
mkdir -p /var/www/test
mkdir -p /var/www/test/logs
echo -e "${GREEN}✅ Директории созданы${NC}"
echo ""

# Шаг 2: Копирование проекта из production
echo -e "${BLUE}📥 Шаг 2: Копирование проекта из production...${NC}"
if [ -d "/var/www/test/.git" ]; then
    echo -e "${YELLOW}⚠️  Проект уже существует, обновляем из production...${NC}"
    rsync -av --exclude 'node_modules' --exclude 'venv' --exclude '.env' --exclude 'build' /home/deploy/app/ /var/www/test/
else
    # Проверяем, пустая ли директория
    if [ "$(ls -A /var/www/test)" ]; then
        echo -e "${YELLOW}⚠️  Директория не пустая, очищаем...${NC}"
        rm -rf /var/www/test/*
        rm -rf /var/www/test/.[!.]*
    fi
    # Копируем из production (исключая тяжелые папки)
    echo -e "${BLUE}Копируем файлы из /home/deploy/app...${NC}"
    rsync -av --exclude 'node_modules' --exclude 'venv' --exclude '.env' --exclude 'build' /home/deploy/app/ /var/www/test/
fi
echo -e "${GREEN}✅ Проект скопирован${NC}"
echo ""

# Шаг 3: Создание тестовой БД
echo -e "${BLUE}🗄️  Шаг 3: Создание тестовой базы данных...${NC}"
sudo -u postgres psql << EOF
-- Проверяем, существует ли пользователь
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_user WHERE usename = 'test_user') THEN
        CREATE USER test_user WITH PASSWORD '$(openssl rand -base64 12)';
    END IF;
END
\$\$;

-- Проверяем, существует ли БД
SELECT 'CREATE DATABASE test_optioner OWNER test_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'test_optioner')\gexec

-- Даем права
GRANT ALL PRIVILEGES ON DATABASE test_optioner TO test_user;
EOF

# Настройка прав на схему
sudo -u postgres psql -d test_optioner << EOF
GRANT ALL ON SCHEMA public TO test_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO test_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO test_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO test_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO test_user;
EOF

echo -e "${GREEN}✅ База данных test_optioner создана${NC}"
echo -e "   Пользователь: test_user"
echo -e "   Пароль: (сгенерирован автоматически)"
echo ""

# Шаг 4: Настройка Backend
echo -e "${BLUE}🔧 Шаг 4: Настройка Backend...${NC}"
cd /var/www/test/backend

# Создание виртуального окружения
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

# Активация и установка зависимостей
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Копирование .env файла
cp .env.test .env

echo -e "${YELLOW}⚠️  ВАЖНО: Нужно добавить OPENAI_API_KEY в .env${NC}"
echo -e "${YELLOW}   Выполни: nano /var/www/test/backend/.env${NC}"
echo -e "${YELLOW}   И добавь строку с ключом из production${NC}"
echo ""

# Шаг 5: Настройка Frontend
echo -e "${BLUE}🎨 Шаг 5: Настройка Frontend...${NC}"
cd /var/www/test/frontend

# Проверка наличия Node.js
if ! command -v node &> /dev/null; then
    echo -e "${YELLOW}⚠️  Node.js не установлен. Устанавливаю...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Установка зависимостей
npm install

# Создание .env для production
cat > .env.production.local << EOF
REACT_APP_API_URL=https://test.optioner.online/api
EOF

# Сборка
npm run build

echo -e "${GREEN}✅ Frontend собран${NC}"
echo ""

# Шаг 6: Настройка Nginx
echo -e "${BLUE}🌐 Шаг 6: Настройка Nginx...${NC}"
sudo cp /var/www/test/nginx.test.conf /etc/nginx/sites-available/test.optioner.online

# Создание симлинка
if [ ! -L "/etc/nginx/sites-enabled/test.optioner.online" ]; then
    sudo ln -s /etc/nginx/sites-available/test.optioner.online /etc/nginx/sites-enabled/
fi

# Проверка конфигурации
sudo nginx -t

# Перезагрузка Nginx
sudo systemctl reload nginx

echo -e "${GREEN}✅ Nginx настроен${NC}"
echo ""

# Шаг 7: Настройка прав на скрипт деплоя
echo -e "${BLUE}📝 Шаг 7: Настройка скрипта деплоя...${NC}"
chmod +x /var/www/test/scripts/deploy_test.sh
sudo ln -sf /var/www/test/scripts/deploy_test.sh /usr/local/bin/deploy-test
echo -e "${GREEN}✅ Скрипт деплоя готов (команда: deploy-test)${NC}"
echo ""

# Шаг 8: Запуск Backend через PM2
echo -e "${BLUE}🚀 Шаг 8: Запуск Backend через PM2...${NC}"

# Проверка наличия PM2
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}⚠️  PM2 не установлен. Устанавливаю...${NC}"
    sudo npm install -g pm2
fi

cd /var/www/test

# Остановка если уже запущен
pm2 delete optioner-backend-test 2>/dev/null || true

# Запуск
pm2 start ecosystem.test.config.js
pm2 save

echo -e "${GREEN}✅ Backend запущен через PM2${NC}"
echo ""

# Итоговая информация
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 Настройка завершена!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${YELLOW}📋 Что нужно сделать дальше:${NC}"
echo ""
echo -e "1. ${YELLOW}Добавь OPENAI_API_KEY в .env:${NC}"
echo -e "   nano /var/www/test/backend/.env"
echo -e "   Скопируй ключ из: /home/deploy/app/backend/.env"
echo ""
echo -e "2. ${YELLOW}Перезапусти backend:${NC}"
echo -e "   pm2 restart optioner-backend-test"
echo ""
echo -e "3. ${YELLOW}Получи SSL сертификат:${NC}"
echo -e "   sudo certbot --nginx -d test.optioner.online"
echo ""
echo -e "4. ${YELLOW}Проверь работу:${NC}"
echo -e "   curl https://test.optioner.online/api/health"
echo -e "   Открой в браузере: https://test.optioner.online"
echo ""
echo -e "${BLUE}📊 Статус PM2:${NC}"
pm2 list
echo ""
