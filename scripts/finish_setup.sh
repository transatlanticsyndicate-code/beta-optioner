#!/bin/bash
# Финальная настройка тестового сервера
# Запускать на СЕРВЕРЕ

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🔧 Финальная настройка тестового сервера${NC}"
echo ""

# Проверка статуса PM2
echo -e "${BLUE}📊 Статус PM2:${NC}"
pm2 list

echo ""
echo -e "${BLUE}📝 Логи backend (последние 30 строк):${NC}"
pm2 logs optioner-backend-test --lines 30 --nostream

echo ""
echo -e "${BLUE}🌐 Получение SSL сертификата...${NC}"
echo -e "${YELLOW}Ответь на вопросы certbot:${NC}"
echo -e "  1. Email: твой email"
echo -e "  2. Agree to terms: Y"
echo -e "  3. Redirect HTTP to HTTPS: 2 (Yes)"
echo ""

certbot --nginx -d test.optioner.online

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🎉 Настройка завершена!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Финальная проверка
echo -e "${BLUE}🔍 Финальная проверка:${NC}"
echo ""

echo -e "${BLUE}1. Проверка API:${NC}"
curl -s https://test.optioner.online/api/health || echo -e "${YELLOW}API не отвечает (проверь логи PM2)${NC}"

echo ""
echo -e "${BLUE}2. Статус PM2:${NC}"
pm2 list

echo ""
echo -e "${BLUE}3. Статус Nginx:${NC}"
systemctl status nginx --no-pager | head -10

echo ""
echo -e "${GREEN}✅ Тестовый сервер готов!${NC}"
echo -e "${GREEN}🌐 Открой в браузере: https://test.optioner.online${NC}"
echo ""
echo -e "${YELLOW}📋 Полезные команды:${NC}"
echo -e "  pm2 logs optioner-backend-test  - логи backend"
echo -e "  pm2 restart optioner-backend-test  - перезапуск backend"
echo -e "  deploy-test  - деплой обновлений"
echo ""
