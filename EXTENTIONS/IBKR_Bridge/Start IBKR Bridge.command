#!/bin/bash
cd "$(dirname "$0")" || exit 1

# Авто-установка зависимостей при первом запуске
if ! python3 -c "import aiohttp, ib_insync" 2>/dev/null; then
    echo "Устанавливаем зависимости (только при первом запуске)..."
    pip3 install aiohttp ib_insync 2>/dev/null \
        || pip3 install --user aiohttp ib_insync 2>/dev/null \
        || pip3 install --break-system-packages aiohttp ib_insync

    if ! python3 -c "import aiohttp, ib_insync" 2>/dev/null; then
        echo ""
        echo "❌ Не удалось установить зависимости автоматически."
        echo "Откройте Терминал и выполните вручную:"
        echo "    pip3 install aiohttp ib_insync"
        echo ""
        read -p "Нажмите Enter чтобы закрыть..."
        exit 1
    fi
fi

python3 main_source_backup.py
