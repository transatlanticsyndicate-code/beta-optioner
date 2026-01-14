# Настройка GitHub Actions для автоматического деплоя

## 📋 Что нужно сделать

GitHub Actions требует `workflow` scope в Personal Access Token для добавления workflow файлов через git. Поэтому добавляем workflow через веб-интерфейс GitHub.

## Шаг 1: Добавьте Secrets

1. Перейдите на https://github.com/transatlanticsyndicate-code/modular-code-methodology
2. Settings → Secrets and variables → Actions
3. Нажмите "New repository secret"
4. Добавьте каждый secret:

| Название | Значение |
|----------|----------|
| `BETA_DEPLOY_HOST` | `89.117.52.143` |
| `BETA_DEPLOY_USER` | `root` |
| `BETA_DEPLOY_PASSWORD` | `Z#yyJl7e34sptFij` |
| `BETA_DEPLOY_PATH` | `/var/www/beta` |

## Шаг 2: Создайте Workflow файл

1. Нажмите "Add file" → "Create new file"
2. В поле "Name your file" введите: `.github/workflows/deploy-beta.yml`
3. Скопируйте содержимое ниже в текстовое поле
4. Нажмите "Commit new file"

### Содержимое файла `.github/workflows/deploy-beta.yml`:

```yaml
name: Deploy to Beta Server

on:
  push:
    branches:
      - main
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: 'frontend/package-lock.json'
      
      - name: Install frontend dependencies
        run: npm ci
        working-directory: frontend
      
      - name: Build frontend
        run: npm run build
        working-directory: frontend
      
      - name: Deploy to Beta Server
        env:
          DEPLOY_HOST: ${{ secrets.BETA_DEPLOY_HOST }}
          DEPLOY_USER: ${{ secrets.BETA_DEPLOY_USER }}
          DEPLOY_PASSWORD: ${{ secrets.BETA_DEPLOY_PASSWORD }}
          DEPLOY_PATH: ${{ secrets.BETA_DEPLOY_PATH }}
        run: |
          apt-get update && apt-get install -y sshpass
          sshpass -p "$DEPLOY_PASSWORD" scp -o StrictHostKeyChecking=no -r frontend/build/* \
            "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PATH/frontend/build/"
          sshpass -p "$DEPLOY_PASSWORD" ssh -o StrictHostKeyChecking=no \
            "$DEPLOY_USER@$DEPLOY_HOST" \
            "cd $DEPLOY_PATH && git pull origin main && systemctl reload nginx && pm2 restart all"
      
      - name: Notify on success
        if: success()
        run: echo "✅ Deployment to beta.optioner.online completed successfully"
      
      - name: Notify on failure
        if: failure()
        run: exit 1
```

## Шаг 3: Проверьте

1. Перейдите на вкладку "Actions"
2. Должен быть workflow "Deploy to Beta Server"
3. Статус должен быть зелёный ✅

## Готово!

Теперь каждый пуш в main branch будет автоматически деплоиться на beta.optioner.online:

```bash
git add -A
git commit -m "Описание изменений"
git push origin main
```

GitHub Actions автоматически:
1. Собирает frontend
2. Копирует build на beta сервер
3. Обновляет код
4. Перезагружает nginx и PM2

## Проверка статуса деплоя

1. Actions → "Deploy to Beta Server"
2. Нажмите на последний workflow
3. Посмотрите логи в разделе "Deploy to Beta Server"

## Если что-то не сработало

### Проблема: "Secrets not found"
- Убедитесь, что все 4 secrets добавлены в Settings → Secrets

### Проблема: "SSH connection refused"
- Проверьте IP сервера (89.117.52.143)
- Проверьте пароль

### Проблема: "npm build failed"
- Проверьте, что frontend собирается локально: `npm run build`

## Альтернатива: GitHub CLI

Если у вас установлен GitHub CLI:

```bash
gh auth login
gh secret set BETA_DEPLOY_HOST -b "89.117.52.143"
gh secret set BETA_DEPLOY_USER -b "root"
gh secret set BETA_DEPLOY_PASSWORD -b "Z#yyJl7e34sptFij"
gh secret set BETA_DEPLOY_PATH -b "/var/www/beta"
```
