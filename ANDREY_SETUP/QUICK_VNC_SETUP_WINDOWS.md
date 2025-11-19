# ⚡ Быстрый старт: VNC подключение на Windows (2 минуты)

## Если TWS не отвечает на запросы

### Шаг 1: Скачать PuTTY (если нет)

1. Скачать: https://www.chiark.greenend.org.uk/~sgtatham/putty/latest.html
2. Скачать `putty.exe` и `pageant.exe`

### Шаг 2: Загрузить SSH ключ в PuTTY

1. Открыть `pageant.exe`
2. Нажать "Add Key"
3. Выбрать файл `id_optioner` (или конвертировать в .ppk через PuTTYgen)
4. Ключ загружен в памяти

### Шаг 3: Открыть SSH туннель для VNC

1. Открыть `putty.exe`
2. В поле "Host Name": `89.117.52.143`
3. В левом меню: Connection → SSH → Tunnels
4. В "Source port": `5900`
5. В "Destination": `127.0.0.1:5900`
6. Нажать "Add"
7. Нажать "Open"
8. Оставить это окно открытым

### Шаг 4: Скачать VNC Viewer

1. Скачать: https://www.realvnc.com/download/viewer/
2. Установить

### Шаг 5: Подключиться через VNC

1. Открыть VNC Viewer
2. В адресной строке: `127.0.0.1:5900`
3. Нажать Enter

### Шаг 6: Авторизация в VNC

- **Пароль:** `9556017`

### Шаг 7: Авторизация в TWS

В окне TWS введи:
- **Username:** `bogda6172`
- **Password:** `19642014angel`

### Шаг 8: Повторить запрос

В PowerShell/CMD:
```bash
python query_es_contracts_simple.py
```

---

## Альтернатива: Использовать WSL2 (если установлен)

```bash
# В WSL2 терминале
ssh -i ~/.ssh/id_optioner -L 5900:127.0.0.1:5900 -N root@89.117.52.143
```

Потом открыть VNC Viewer и подключиться к `127.0.0.1:5900`

---

## Полная инструкция

Читай `VNC_CONNECTION_GUIDE.md` для подробностей.

---

**Время:** ~2 минуты  
**Результат:** TWS переавторизован и работает ✅
