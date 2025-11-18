# 🐛 Bug Report для Левона

## Проблема: Неправильные импорты в UI компонентах

### Описание
После `git pull` проект не компилируется из-за неправильных путей импорта в UI компонентах.

### Ошибка
```
Module not found: Error: Can't resolve '../../lib/utils' in 'frontend/src/components/ui'
```

### Причина
UI компоненты импортируют `utils` из несуществующего пути:
```javascript
import { cn } from '../../lib/utils'  // ❌ Неправильно
```

Но файл `utils.js` находится в той же папке:
```javascript
import { cn } from './utils'  // ✅ Правильно
```

### Файлы с проблемой (10 штук)
1. `frontend/src/components/ui/dialog.jsx`
2. `frontend/src/components/ui/popover.jsx`
3. `frontend/src/components/ui/progress.jsx`
4. `frontend/src/components/ui/select.jsx`
5. `frontend/src/components/ui/separator.jsx`
6. `frontend/src/components/ui/skeleton.jsx`
7. `frontend/src/components/ui/slider.jsx`
8. `frontend/src/components/ui/switch.jsx`
9. `frontend/src/components/ui/tabs.jsx`
10. `frontend/src/components/ui/tooltip.jsx`

### Решение
Во всех этих файлах заменить:
```javascript
// Было:
import { cn } from '../../lib/utils'
// или
import { cn } from "../../lib/utils"

// Должно быть:
import { cn } from './utils'
// или
import { cn } from "./utils"
```

### Почему это важно
- Проект не компилируется после `git pull`
- Андрею приходится каждый раз исправлять эти импорты вручную
- Это блокирует локальную разработку

### Предложение
Исправить эти импорты в main ветке один раз, чтобы проблема не повторялась.

---

**Создано:** 15 октября 2025  
**Автор:** Андрей (Frontend)
