/**
 * ext2 — Поддержка фичи "Стратегия СЕВЕР" в калькуляторе.
 *
 * 1. Сканирует таблицу опционов и возвращает СПИСОК доступных экспираций по
 *    бейджам "X DTE" — без парсинга строк (быстро, работает даже на свёрнутых
 *    группах).
 * 2. По команде разворачивает указанную группу экспирации (если свёрнута),
 *    ждёт появления строк и зовёт dumpFullChain() — это пишет полную цепочку
 *    в chrome.storage.local.tvc_full_chain, откуда её читает калькулятор.
 */

(function () {
  if (typeof window === 'undefined') return;

  const LOG_TAG = '[ext2/north]';

  /**
   * Вычисление ISO-даты "сегодня + N дней" в UTC.
   */
  function todayPlus(days) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
  }

  /**
   * Поиск всех групповых заголовков экспирации в DOM.
   * Ищем по DTE-бейджу — он есть на каждой группе и однозначно идентифицирует дату.
   * Для каждого находим ближайший кликабельный предок (для разворачивания).
   */
  function findExpirationHeaders() {
    const results = [];
    const seen = new Set();

    // Кандидаты — короткие текстовые ноды с шаблоном "N DTE"
    const all = document.querySelectorAll('span, div, td, button');
    for (const el of all) {
      const text = (el.textContent || '').trim();
      if (text.length > 40) continue;
      const m = text.match(/^(\d{1,4})\s*DTE\b/i);
      if (!m) continue;

      const days = parseInt(m[1], 10);
      if (!Number.isFinite(days) || days < 0 || days > 3650) continue;

      const date = todayPlus(days);
      if (seen.has(date)) continue;
      seen.add(date);

      // Поднимаемся по DOM до элемента, который выглядит как кликабельный заголовок:
      //  - aria-expanded задан (true/false)
      //  - role=button / tagName=BUTTON
      //  - cursor:pointer
      let header = el;
      let isExpanded = null;
      for (let i = 0; i < 8; i++) {
        const aria = header.getAttribute && header.getAttribute('aria-expanded');
        if (aria === 'true' || aria === 'false') {
          isExpanded = aria === 'true';
          break;
        }
        if (header.tagName === 'BUTTON' || (header.getAttribute && header.getAttribute('role') === 'button')) {
          break;
        }
        const parent = header.parentElement;
        if (!parent) break;
        header = parent;
      }

      // Если aria не нашли — пытаемся понять по визуальным признакам стрелки в тексте
      if (isExpanded === null) {
        const ht = (header.textContent || '');
        if (ht.includes('▼') || ht.includes('⌄') || ht.includes('⏷')) isExpanded = true;
        else if (ht.includes('▶') || ht.includes('›') || ht.includes('⏵') || ht.includes('▸')) isExpanded = false;
      }

      results.push({ date, days, header, isExpanded });
    }

    results.sort((a, b) => a.days - b.days);
    return results;
  }

  /**
   * Развернуть группу указанной экспирации (если свёрнута).
   * Возвращает Promise, который резолвится когда строки этой даты появились в DOM
   * (или по таймауту).
   */
  function expandExpirationByDate(targetIso, timeoutMs = 7000) {
    return new Promise((resolve) => {
      const headers = findExpirationHeaders();
      const target = headers.find(h => h.date === targetIso);

      // Селектор строк с нужной экспирацией — data-cell-id содержит YYMMDD
      const ymd = targetIso.replace(/-/g, '').slice(2); // 2026-07-17 → 260717
      const rowsSelector = `td[data-cell-id*="${ymd}C"], td[data-cell-id*="${ymd}P"]`;

      const alreadyHasRows = document.querySelector(rowsSelector) != null;
      if (alreadyHasRows) {
        resolve({ ok: true, expanded: false, date: targetIso });
        return;
      }

      if (!target) {
        resolve({ ok: false, reason: 'header-not-found', date: targetIso });
        return;
      }

      if (target.isExpanded === true) {
        // Заголовок говорит "развёрнут", но строк нет — может быть виртуализация
        // или ошибка определения. Просто подождём.
      } else {
        try {
          target.header.click();
        } catch (e) {
          resolve({ ok: false, reason: 'click-failed: ' + e.message, date: targetIso });
          return;
        }
      }

      // Ждём появления строк
      const start = Date.now();
      const check = () => {
        if (document.querySelector(rowsSelector)) {
          resolve({ ok: true, expanded: true, date: targetIso });
          return;
        }
        if (Date.now() - start > timeoutMs) {
          resolve({ ok: false, reason: 'timeout', date: targetIso });
          return;
        }
        setTimeout(check, 200);
      };
      check();
    });
  }

  /**
   * Дамп списка доступных экспираций в chrome.storage.local (для калькулятора).
   * Это лёгкая операция, можно делать часто.
   */
  function dumpExpirationsList() {
    try {
      if (!chrome?.runtime?.id) return;
      const headers = findExpirationHeaders();
      const list = headers.map(h => ({ date: h.date, days: h.days, expanded: h.isExpanded }));
      const ticker = typeof getTickerFromUrl === 'function' ? (getTickerFromUrl() || '') : '';
      chrome.storage.local.set({
        tvc_expirations_list: {
          ticker,
          expirations: list,
          timestamp: Date.now(),
        },
      });
    } catch (e) {
      console.warn(LOG_TAG, 'dumpExpirationsList error:', e.message);
    }
  }

  /**
   * Обработчик команды от калькулятора: развернуть указанную дату и сделать полный
   * дамп цепочки. Регистрируется в mainInit.js.
   */
  function handleNorthExpandAndDump(targetIso, sendResponse) {
    expandExpirationByDate(targetIso).then((result) => {
      try {
        if (result.ok && typeof injectButtons === 'function') {
          // На случай если строки появились новые — обновим кнопки и дампим
          injectButtons();
        }
        if (typeof dumpFullChain === 'function') {
          dumpFullChain();
        }
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, reason: 'post-dump-error: ' + e.message, date: targetIso });
      }
    });
  }

  // Экспортируем в window — содержательные скрипты загружаются в один realm.
  window.ext2North = {
    findExpirationHeaders,
    expandExpirationByDate,
    dumpExpirationsList,
    handleNorthExpandAndDump,
  };
})();
