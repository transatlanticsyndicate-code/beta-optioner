/**
 * ext2 — Поддержка фичи "Стратегия СЕВЕР" в калькуляторе.
 *
 * 1. Сканирует таблицу опционов и возвращает СПИСОК доступных экспираций по
 *    бейджам "X DTE" — без парсинга строк (быстро, работает даже на свёрнутых
 *    группах).
 * 2. По команде разворачивает указанную группу экспирации (если свёрнута),
 *    ждёт появления строк и зовёт dumpFullChain() — это пишет полную цепочку
 *    в chrome.storage.local.tvc_full_chain, откуда её читает калькулятор.
 * 3. Перед раскрытием убеждается, что в фильтрах стоит "Next 90 days" и
 *    "All strikes" — без них в таблице может быть видно слишком мало дат/страйков.
 */

(function () {
  if (typeof window === 'undefined') return;

  const LOG_TAG = '[ext2/north]';

  function todayPlus(days) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
  }

  /**
   * React-friendly клик: TV использует React, и обычного .click() иногда мало —
   * добавляем mousedown+mouseup+click через dispatchEvent.
   */
  function reactClick(el) {
    if (!el) return;
    try { el.click(); } catch (e) {}
    try {
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
        const ev = type.startsWith('pointer')
          ? new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'mouse' })
          : new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 });
        el.dispatchEvent(ev);
      });
    } catch (e) {}
  }

  /**
   * Поиск всех групповых заголовков экспирации в DOM.
   * Кандидаты: короткие тексты с шаблоном "N DTE". Поднимаемся по DOM до
   * "ощутимо кликабельного" предка.
   */
  function findExpirationHeaders() {
    const results = [];
    const seen = new Set();

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

      // Кликабельный предок: aria-expanded задан, тег BUTTON, role=button,
      // cursor:pointer, либо просто <tr> заголовка группы.
      let header = el;
      let clickable = el;
      let isExpanded = null;
      for (let i = 0; i < 10; i++) {
        const aria = header.getAttribute && header.getAttribute('aria-expanded');
        if (aria === 'true' || aria === 'false') {
          isExpanded = aria === 'true';
          clickable = header;
          break;
        }
        const role = header.getAttribute && header.getAttribute('role');
        if (header.tagName === 'BUTTON' || role === 'button') {
          clickable = header;
          break;
        }
        try {
          const cs = window.getComputedStyle(header);
          if (cs && cs.cursor === 'pointer') {
            clickable = header;
            // не break — может быть ещё более очевидный предок выше
          }
        } catch (e) {}
        const parent = header.parentElement;
        if (!parent) break;
        header = parent;
      }

      if (isExpanded === null) {
        const ht = (clickable.textContent || '');
        if (ht.includes('▼') || ht.includes('⌄') || ht.includes('⏷')) isExpanded = true;
        else if (ht.includes('▶') || ht.includes('›') || ht.includes('⏵') || ht.includes('▸')) isExpanded = false;
      }

      results.push({ date, days, header: clickable, badge: el, isExpanded });
    }

    results.sort((a, b) => a.days - b.days);
    return results;
  }

  /**
   * Поиск кликабельного элемента по тексту. Используется для фильтров и пунктов меню.
   */
  function findClickableByText(textPattern, opts = {}) {
    const { container = document, maxLen = 80 } = opts;
    const regex = textPattern instanceof RegExp ? textPattern : new RegExp(textPattern, 'i');
    const all = container.querySelectorAll('button, [role="button"], [role="option"], [role="menuitem"], div, span');
    for (const el of all) {
      const text = (el.textContent || '').trim();
      if (!text || text.length > maxLen) continue;
      if (!regex.test(text)) continue;
      // Если элемент слишком жирный (много детей с разным текстом) — попробуем
      // более конкретного потомка
      if (el.children.length > 0 && el.children.length < 6) {
        for (const child of el.children) {
          const ct = (child.textContent || '').trim();
          if (ct && regex.test(ct) && ct.length <= maxLen) {
            return child;
          }
        }
      }
      return el;
    }
    return null;
  }

  /**
   * Убедиться, что фильтры "Expiration: Next 90 days" и "All strikes" активны.
   * Возвращает Promise, который резолвится после попытки установки.
   * Heuristic — если кнопок не нашли, просто молча возвращаемся.
   */
  async function ensureFilters() {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    try {
      // 1. Expiration filter
      const expChip = findClickableByText(/(Next\s+\d+\s+days|Expiration)/i);
      const expText = (expChip?.textContent || '').toLowerCase();
      if (expChip && !/next\s+90\s+days/.test(expText)) {
        reactClick(expChip);
        await sleep(300);
        // В выпадающем меню ищем "Next 90 days"
        const opt = findClickableByText(/^Next\s+90\s+days$/i);
        if (opt) {
          reactClick(opt);
          await sleep(400);
        } else {
          // Закрываем меню кликом по body
          document.body.click();
        }
      }

      // 2. Strikes filter
      const strikesChip = findClickableByText(/(All\s+strikes|strikes?)/i);
      const stText = (strikesChip?.textContent || '').toLowerCase();
      if (strikesChip && !/all\s+strikes/.test(stText)) {
        reactClick(strikesChip);
        await sleep(300);
        const opt = findClickableByText(/^All\s+strikes$/i);
        if (opt) {
          reactClick(opt);
          await sleep(400);
        } else {
          document.body.click();
        }
      }
    } catch (e) {
      console.warn(LOG_TAG, 'ensureFilters error:', e.message);
    }
  }

  /**
   * Развернуть группу указанной экспирации (если свёрнута).
   * Перед попыткой клика — ставим нужные фильтры, чтобы дата вообще была видна.
   */
  function expandExpirationByDate(targetIso, timeoutMs = 9000) {
    return new Promise((resolve) => {
      const ymd = targetIso.replace(/-/g, '').slice(2);
      const rowsSelector = `td[data-cell-id*="${ymd}C"], td[data-cell-id*="${ymd}P"]`;

      const alreadyHasRows = document.querySelector(rowsSelector) != null;
      if (alreadyHasRows) {
        resolve({ ok: true, expanded: false, date: targetIso });
        return;
      }

      ensureFilters().then(() => {
        // После фильтров — пересканируем заголовки
        const headers = findExpirationHeaders();
        const target = headers.find(h => h.date === targetIso);

        if (!target) {
          resolve({ ok: false, reason: 'header-not-found', date: targetIso, knownDates: headers.map(h => h.date) });
          return;
        }

        if (target.isExpanded !== true) {
          // Скроллим к заголовку, потом клик
          try { target.header.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
          reactClick(target.header);
          // Если есть бейдж — тоже попробуем кликнуть, на случай если кликабелен он
          if (target.badge && target.badge !== target.header) {
            setTimeout(() => reactClick(target.badge), 150);
          }
        }

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
    });
  }

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

  function handleNorthExpandAndDump(targetIso, sendResponse) {
    expandExpirationByDate(targetIso).then((result) => {
      try {
        if (result.ok && typeof injectButtons === 'function') {
          injectButtons();
        }
        if (typeof dumpFullChain === 'function') {
          dumpFullChain();
        }
        // После раскрытия дополнительно обновим список экспираций
        dumpExpirationsList();
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, reason: 'post-dump-error: ' + e.message, date: targetIso });
      }
    });
  }

  /**
   * Команда от background: установить фильтры (вызывается после открытия таба
   * или перед раскрытием группы). Прогоняем ensureFilters, потом дампим список.
   */
  function handleNorthEnsureFilters(sendResponse) {
    ensureFilters().then(() => {
      // Даём TV перерисовать заголовки
      setTimeout(() => {
        dumpExpirationsList();
        sendResponse({ ok: true });
      }, 600);
    });
  }

  window.ext2North = {
    findExpirationHeaders,
    expandExpirationByDate,
    ensureFilters,
    dumpExpirationsList,
    handleNorthExpandAndDump,
    handleNorthEnsureFilters,
  };
})();
