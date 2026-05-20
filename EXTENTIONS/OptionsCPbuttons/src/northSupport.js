/**
 * ext2 — Поддержка фичи "Стратегия СЕВЕР" в калькуляторе.
 *
 * 1. Сканирует таблицу опционов и возвращает СПИСОК доступных экспираций по
 *    бейджам "X DTE" — без парсинга строк (работает даже на свёрнутых группах).
 * 2. По команде разворачивает указанную группу экспирации (если свёрнута),
 *    ждёт появления строк и зовёт dumpFullChain() — это пишет полную цепочку
 *    в chrome.storage.local.tvc_full_chain, откуда её читает калькулятор.
 * 3. Перед раскрытием убеждается, что в фильтрах стоит "Next 90 days" и
 *    "All strikes" — без них в таблице может быть слишком мало дат/страйков.
 */

(function () {
  if (typeof window === 'undefined') return;

  const LOG = (...args) => console.log('[ext2/north]', ...args);
  const WARN = (...args) => console.warn('[ext2/north]', ...args);

  function todayPlus(days) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().split('T')[0];
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /** React-friendly клик с polный набором событий */
  function reactClick(el) {
    if (!el) return;
    try { el.scrollIntoView({ block: 'center', behavior: 'instant' }); } catch (e) {}
    try {
      const events = ['pointerover', 'pointerenter', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
      for (const type of events) {
        const ev = type.startsWith('pointer')
          ? new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'mouse', isPrimary: true, button: 0 })
          : new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0 });
        el.dispatchEvent(ev);
      }
    } catch (e) {
      WARN('reactClick dispatchEvent error:', e.message);
    }
    try { el.click(); } catch (e) {}
  }

  /** Поиск группового заголовка экспирации по бейджу "N DTE" */
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
          if (cs && cs.cursor === 'pointer') clickable = header;
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
   * Поиск чипа фильтра по ключевым словам. TV рендерит чипы как кликабельные
   * блоки с подписью + значением + крестиком. Ищем самый внешний кликабельный
   * блок, содержащий все ключевые слова. Игнорируем крестик-кнопку (закрытие).
   */
  function findFilterChip(keywords) {
    const lowerKeywords = keywords.map(k => k.toLowerCase());
    // Кандидаты — кликабельные элементы (button, role=button, cursor:pointer)
    const candidates = [];
    const all = document.querySelectorAll('button, [role="button"], [tabindex]');
    for (const el of all) {
      const text = ((el.textContent || '').toLowerCase()).trim();
      if (!text || text.length > 80) continue;
      // Все ключевые слова должны присутствовать
      const matchAll = lowerKeywords.every(k => text.includes(k));
      if (!matchAll) continue;
      // Игнорируем сам крестик — у него обычно роль 'close' или короткий текст
      if (text.length < 3) continue;
      // Фильтруем по размеру: чип — небольшая прямоугольная штука
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.width > 500 || r.height < 16 || r.height > 80) continue;
      candidates.push({ el, text, area: r.width * r.height });
    }
    if (candidates.length === 0) return null;
    // Берём кандидат с минимальной площадью, чтобы не зацепить контейнер
    candidates.sort((a, b) => a.area - b.area);
    LOG('findFilterChip:', keywords, '→', candidates[0].text);
    return candidates[0].el;
  }

  /** Поиск пункта меню по точному (или почти точному) тексту */
  function findMenuItem(textPattern) {
    const regex = textPattern instanceof RegExp ? textPattern : new RegExp(`^${textPattern}\\s*$`, 'i');
    const all = document.querySelectorAll('[role="option"], [role="menuitem"], li, button, [tabindex]');
    for (const el of all) {
      const text = (el.textContent || '').trim();
      if (!text || text.length > 60) continue;
      if (regex.test(text)) {
        LOG('findMenuItem:', textPattern, '→', text);
        return el;
      }
    }
    return null;
  }

  /**
   * Установить один фильтр: найти чип по ключевым словам, проверить значение,
   * если не то — кликнуть и выбрать нужный пункт меню. Возвращает true если
   * после операции значение совпадает с ожидаемым (или уже было).
   */
  async function setOneFilter({ chipKeywords, valueKeyword, menuMatchers }) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const chip = findFilterChip(chipKeywords);
      if (!chip) {
        LOG(`setOneFilter[${chipKeywords.join('/')}] чип не найден (попытка ${attempt + 1}), жду 800мс`);
        await sleep(800);
        continue;
      }
      const chipText = (chip.textContent || '').toLowerCase();
      if (chipText.includes(valueKeyword)) {
        LOG(`setOneFilter[${chipKeywords.join('/')}] уже стоит "${valueKeyword}"`);
        return true;
      }
      LOG(`setOneFilter[${chipKeywords.join('/')}] открываю меню, текущий чип: "${chipText}"`);
      reactClick(chip);
      await sleep(600);
      let opt = null;
      for (const matcher of menuMatchers) {
        opt = findMenuItem(matcher);
        if (opt) break;
      }
      if (opt) {
        LOG(`setOneFilter[${chipKeywords.join('/')}] кликаю по пункту: "${opt.textContent}"`);
        reactClick(opt);
        await sleep(800);
        // Проверим, изменился ли чип
        const newChip = findFilterChip(chipKeywords);
        const newText = (newChip?.textContent || '').toLowerCase();
        if (newText.includes(valueKeyword)) {
          LOG(`setOneFilter[${chipKeywords.join('/')}] ОК, новое значение: "${newText}"`);
          return true;
        }
        WARN(`setOneFilter[${chipKeywords.join('/')}] клик не привёл к нужному значению, было "${chipText}" стало "${newText}"`);
      } else {
        WARN(`setOneFilter[${chipKeywords.join('/')}] пункт меню не найден, закрываю меню`);
        document.body.click();
        await sleep(300);
      }
    }
    return false;
  }

  /**
   * Установить фильтр Expiration → Next 90 days, Strikes → All strikes.
   * Многократные эвристики, ничего не ломаем при неудаче.
   */
  async function ensureFilters() {
    try {
      await setOneFilter({
        chipKeywords: ['expiration'],
        valueKeyword: 'next 90 days',
        menuMatchers: [
          /^next\s+90\s+days$/i,
          /^next\s+90\b/i,
          /\bnext\s+90\s+days\b/i,
          /^90\s+days$/i,
        ],
      });
      await setOneFilter({
        chipKeywords: ['strikes'],
        valueKeyword: 'all strikes',
        menuMatchers: [
          /^all\s+strikes$/i,
          /^all\b/i,
        ],
      });
    } catch (e) {
      WARN('ensureFilters error:', e.message);
    }
  }

  /**
   * Развернуть группу указанной экспирации (если свёрнута).
   * Если её нет в DOM, перед попыткой выставит фильтры и пересканирует.
   * Если всё равно нет — возвращает ошибку с списком известных дат, чтобы
   * вызывающий код мог выбрать ближайшую.
   */
  function expandExpirationByDate(targetIso, timeoutMs = 9000) {
    return new Promise((resolve) => {
      const ymd = targetIso.replace(/-/g, '').slice(2);
      const rowsSelector = `td[data-cell-id*="${ymd}C"], td[data-cell-id*="${ymd}P"]`;

      if (document.querySelector(rowsSelector)) {
        resolve({ ok: true, expanded: false, date: targetIso });
        return;
      }

      ensureFilters().then(() => {
        // Даём TV дорисовать после фильтров
        setTimeout(() => {
          const headers = findExpirationHeaders();
          LOG('Найдено заголовков экспираций:', headers.length, headers.map(h => h.date));
          const target = headers.find(h => h.date === targetIso);

          if (!target) {
            resolve({
              ok: false,
              reason: 'header-not-found',
              date: targetIso,
              knownDates: headers.map(h => h.date),
            });
            return;
          }

          if (target.isExpanded !== true) {
            LOG('Раскрываю группу:', targetIso);
            reactClick(target.header);
            if (target.badge && target.badge !== target.header) {
              setTimeout(() => reactClick(target.badge), 200);
            }
          } else {
            LOG('Группа уже развёрнута:', targetIso);
          }

          const start = Date.now();
          const check = () => {
            if (document.querySelector(rowsSelector)) {
              resolve({ ok: true, expanded: true, date: targetIso });
              return;
            }
            if (Date.now() - start > timeoutMs) {
              resolve({ ok: false, reason: 'timeout-waiting-rows', date: targetIso });
              return;
            }
            setTimeout(check, 200);
          };
          check();
        }, 400);
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
      LOG('dumpExpirationsList:', list.length, 'дат, ticker=', ticker);
    } catch (e) {
      WARN('dumpExpirationsList error:', e.message);
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
        dumpExpirationsList();
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, reason: 'post-dump-error: ' + e.message, date: targetIso });
      }
    });
  }

  /**
   * Установить фильтры и обновить список экспираций. Вызывается из background
   * сразу после открытия таба TV.
   */
  function handleNorthEnsureFilters(sendResponse) {
    LOG('handleNorthEnsureFilters старт');
    ensureFilters().then(() => {
      // Подождать перерисовки + дополнительный круг — если TV рендерит асинхронно
      setTimeout(() => {
        dumpExpirationsList();
        // Иногда первый ensureFilters не успевает: даём странице ещё кружок
        setTimeout(() => {
          dumpExpirationsList();
          sendResponse({ ok: true });
        }, 1200);
      }, 800);
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

  LOG('northSupport.js загружен');
})();
