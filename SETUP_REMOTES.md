# Настройка Git Remotes

## Текущее состояние

```bash
git remote -v
```

Должно выглядеть так:

```
origin  https://github.com/transatlanticsyndicate-code/modular-code-methodology.git (fetch)
origin  https://github.com/transatlanticsyndicate-code/modular-code-methodology.git (push)
beta    https://github.com/transatlanticsyndicate-code/optioner-beta-deploy2.git (fetch)
beta    https://github.com/transatlanticsyndicate-code/optioner-beta-deploy2.git (push)
```

## Если remotes не настроены

### Добавить beta remote (если его нет)

```bash
git remote add beta https://github.com/transatlanticsyndicate-code/optioner-beta-deploy2.git
```

### Добавить test remote (для будущего использования)

```bash
git remote add test https://github.com/transatlanticsyndicate-code/optioner-test-deploy.git
```

### Добавить prod remote (для будущего использования)

```bash
git remote add prod https://github.com/transatlanticsyndicate-code/optioner-prod-deploy.git
```

## Проверка

```bash
# Проверить все remotes
git remote -v

# Проверить последний коммит в каждом remote
git log origin/main -1 --oneline
git log beta/main -1 --oneline
```

## Использование

### Пуш в оба репозитория одновременно

```bash
git push origin main
git push beta main
```

Или используйте alias (если настроена локальная конфигурация):

```bash
git push-all
```

### Пуш только в beta

```bash
git push beta main
```

### Пуш только в origin

```bash
git push origin main
```

## Автоматический деплой

После пуша в оба репозитория, запустите:

```bash
./scripts/deploy-beta.sh "Описание изменений"
```

Этот скрипт автоматически:
1. Пушит в оба репозитория
2. Обновляет код на beta сервере
3. Перестраивает frontend
4. Перезагружает сервисы

## Важно!

- **origin** = основной репозиторий разработки (modular-code-methodology)
- **beta** = репозиторий для beta сервера (optioner-beta-deploy2)
- Оба репозитория должны быть синхронизированы!
- Всегда пушьте в оба репозитория перед деплоем

## Если случайно пушили только в origin

```bash
# Синхронизировать beta с origin
git push beta main
```

## Если случайно пушили только в beta

```bash
# Синхронизировать origin с beta
git push origin main
```

## Проблемы с доступом

Если получаете ошибку доступа при пуше:

```bash
# Проверить SSH ключи
ssh -T git@github.com

# Или использовать HTTPS (если SSH не настроен)
git remote set-url origin https://github.com/transatlanticsyndicate-code/modular-code-methodology.git
git remote set-url beta https://github.com/transatlanticsyndicate-code/optioner-beta-deploy2.git
```
