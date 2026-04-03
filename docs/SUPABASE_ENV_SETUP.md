# Установка переменных окружения Supabase на beta сервере

## Быстрый способ (рекомендуется)

Используйте готовый скрипт:

```bash
./scripts/setup_supabase_env.sh https://your-project.supabase.co your-anon-key-here
```

Замените:
- `https://your-project.supabase.co` — URL вашего Supabase проекта
- `your-anon-key-here` — ваш анонимный ключ Supabase

Скрипт автоматически:
1. Создаст файл `.env` на сервере
2. Пересоберет frontend
3. Перезапустит PM2 процесс

## Ручной способ

Если скрипт не работает, установите переменные вручную:

```bash
sshpass -p 'Z#yyJl7e34sptFij' ssh -o StrictHostKeyChecking=no root@89.117.52.143 "cat > /var/www/beta/frontend/.env << 'EOF'
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key-here
REACT_APP_AUTH_DISABLED=false
EOF"
```

Затем пересоберите и деплойте:

```bash
sshpass -p 'Z#yyJl7e34sptFij' ssh -o StrictHostKeyChecking=no root@89.117.52.143 "cd /var/www/beta/frontend && npm run build && cd /var/www/beta && pm2 restart optioner-backend-beta"
```

## Где получить Supabase ключи?

1. Перейдите на https://app.supabase.com
2. Выберите ваш проект
3. Перейдите в **Settings → API**
4. Скопируйте:
   - **Project URL** → `REACT_APP_SUPABASE_URL`
   - **anon public** → `REACT_APP_SUPABASE_ANON_KEY`

## Проверка установки

После установки переменных, проверьте, что приложение загружается без ошибок:

```bash
# Проверьте логи на сервере
sshpass -p 'Z#yyJl7e34sptFij' ssh -o StrictHostKeyChecking=no root@89.117.52.143 "pm2 logs optioner-backend-beta --lines 50"
```

Если видите ошибку "supabaseUrl is required", значит переменные не установлены корректно.

## Проверка на локальной машине

Перед деплоем на сервер, проверьте локально:

```bash
cd frontend
REACT_APP_SUPABASE_URL=https://your-project.supabase.co \
REACT_APP_SUPABASE_ANON_KEY=your-anon-key-here \
npm start
```

Если приложение загружается без ошибок, значит ключи верные.
