# Настройка GitHub Actions Secrets

## Что нужно сделать

Добавьте следующие secrets в GitHub репозиторий:

1. Перейдите на https://github.com/transatlanticsyndicate-code/modular-code-methodology
2. Settings → Secrets and variables → Actions
3. Нажмите "New repository secret"
4. Добавьте каждый secret из таблицы ниже

## Secrets для Beta сервера

| Название | Значение | Описание |
|----------|----------|---------|
| `BETA_DEPLOY_HOST` | `89.117.52.143` | IP адрес beta сервера |
| `BETA_DEPLOY_USER` | `root` | SSH пользователь |
| `BETA_DEPLOY_PASSWORD` | `Z#yyJl7e34sptFij` | SSH пароль |
| `BETA_DEPLOY_PATH` | `/var/www/beta` | Путь к проекту на сервере |

## Как добавить secret

1. Нажмите "New repository secret"
2. В поле "Name" введите название (например, `BETA_DEPLOY_HOST`)
3. В поле "Secret" введите значение (например, `89.117.52.143`)
4. Нажмите "Add secret"

## Проверка

После добавления всех secrets, они будут использоваться автоматически в GitHub Actions workflow.

Проверить можно так:
1. Сделайте коммит и пуш в main branch
2. Перейдите на вкладку "Actions" в GitHub
3. Должен запуститься workflow "Deploy to Beta Server"
4. Проверьте логи деплоя

## Безопасность

⚠️ **Важно:**
- Secrets не видны в логах GitHub Actions
- Secrets не передаются в форках репозитория
- Secrets шифруются и хранятся безопасно на GitHub

## Если нужно изменить secret

1. Settings → Secrets and variables → Actions
2. Найдите secret в списке
3. Нажмите на него и выберите "Update"
4. Введите новое значение
5. Нажмите "Update secret"
