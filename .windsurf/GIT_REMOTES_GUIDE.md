# Git Remotes Structure

## Структура репозиториев

Этот workspace работает с **двумя git remote репозиториями**:

### 1. Origin (Основной репозиторий)
- **Remote name**: `origin`
- **URL**: `https://github.com/transatlanticsyndicate-code/modular-code-methodology.git`
- **Назначение**: Основной репозиторий для разработки и документации
- **Использование**: Для сохранения истории разработки, архитектурных решений

### 2. Beta (Деплой репозиторий)
- **Remote name**: `beta`
- **URL**: `https://github.com/transatlanticsyndicate-code/optioner-beta-deploy2.git`
- **Назначение**: Репозиторий для деплоя на beta сервер
- **Сервер**: `89.117.52.143` (`/var/www/beta`)
- **Использование**: Для деплоя изменений на https://beta.optioner.online

## Правила работы

### ⚠️ ВАЖНО: Какой remote использовать

**Для beta деплоя:**
```bash
git push beta main
```

**Для сохранения в основной репозиторий:**
```bash
git push origin main
```

### Workflows и их назначение

| Workflow | Remote | Назначение |
|----------|--------|------------|
| `/commit` | - | Только коммит без пуша |
| `/commit-push-deploy` | `beta` | Коммит + пуш в beta + деплой на сервер |
| `/commit-push-pull` | `beta` | Коммит + пуш в beta + pull на сервере |

## Проверка текущих remotes

```bash
git remote -v
```

Вывод должен быть:
```
beta    https://github.com/transatlanticsyndicate-code/optioner-beta-deploy2.git (fetch)
beta    https://github.com/transatlanticsyndicate-code/optioner-beta-deploy2.git (push)
origin  https://github.com/transatlanticsyndicate-code/modular-code-methodology.git (fetch)
origin  https://github.com/transatlanticsyndicate-code/modular-code-methodology.git (push)
```

## Типичные ошибки

### ❌ Ошибка: Пуш в origin вместо beta
```bash
git push origin main  # НЕПРАВИЛЬНО для beta деплоя
```

### ✅ Правильно: Пуш в beta для деплоя
```bash
git push beta main  # ПРАВИЛЬНО для beta деплоя
```

## Синхронизация между репозиториями

Если нужно синхронизировать оба репозитория:

```bash
# 1. Пуш в основной репозиторий
git push origin main

# 2. Пуш в beta репозиторий
git push beta main
```

## Для AI ассистента

**ВСЕГДА проверяй перед деплоем:**
1. Какой сервер является целевым (beta/test/prod)
2. Какой remote соответствует этому серверу
3. Используй правильный remote в команде `git push`

**Правило:** Beta сервер = `beta` remote, НЕ `origin`!
