/**
 * ext2 — Поддержка фичи "Стратегия СЕВЕР" в калькуляторе.
 *
 * 1. Сканирует доску опционов и возвращает СПИСОК доступных экспираций — основной
 *    источник это поповер фильтра "Expiration" (data-qa-id), он отдаёт ПОЛНЫЙ список
 *    дат без необходимости скроллить/раскрывать таблицу; резервный источник —
 *    групповые заголовки в самой таблице (только уже отрисованные даты).
 * 2. По команде разворачивает указанную группу экспирации (если свёрнута),
 *    ждёт появления строк и зовёт dumpFullChain() — это пишет полную цепочку
 *    в chrome.storage.local.tvc_full_chain, откуда её читает калькулятор.
 * 3. Перед раскрытием убеждается через ensureChainVisibility(), что нужная дата
 *    (или все даты) видна в фильтре и что страйки не обрезаны ("All strikes").
 *
 * Вёрстка TV 2026-08: фильтры — чипы с data-qa-id*="series-filter"/"strikes-filter",
 * поповеры рендерятся в портал [data-qa-id="overlap-manager-root"]. Старые эвристики
 * (regex "N DTE" по всем span/div, подъём по 10 предкам, глифы ▼▶, рамки чипов по
 * геометрии) — сломаны новой вёрсткой и полностью заменены на data-qa-id якоря.
 */

(function () {
  if (typeof window === 'undefined') return;

  const LOG = (...args) => console.log('[ext2/north]', ...args);
  const WARN = (...args) => console.warn('[ext2/north]', ...args);

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /** React-friendly клик с полным набором событий */
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

  // ---------------------------------------------------------------------
  // Якоря новой вёрстки (проверены живьём 2026-08-15)
  // ---------------------------------------------------------------------
  const SERIES_FILTER_SEL = '[data-qa-id*="series-filter"]';
  const STRIKES_FILTER_SEL = '[data-qa-id*="strikes-filter"]';
  const OVERLAY_SEL = '[data-qa-id="overlap-manager-root"]';
  const SERIES_MODE_SEL = '[data-qa-id="option-chain-series-filter-mode"]';
  const STRIKES_MODE_SEL = '[data-qa-id="option-chain-strikes-filter-mode"]';
  const SELECT_ALL_SEL = '[data-qa-id="select-all-option"]';

  /** Чип фильтра по типу — прямой селектор, без геометрии/keyword-эвристик. */
  function findFilterChip(kind) {
    return document.querySelector(kind === 'strikes' ? STRIKES_FILTER_SEL : SERIES_FILTER_SEL);
  }

  /** Ждём, пока поповер (портал в body) появится в DOM после клика по чипу. */
  async function waitForOverlay(timeoutMs = 2500) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const overlay = document.querySelector(OVERLAY_SEL);
      if (overlay) return overlay;
      await sleep(150);
    }
    return null;
  }

  /** Закрыть поповер по Escape (клик вне тоже работает, но Escape надёжнее из кода). */
  function closePopover() {
    try {
      const opts = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
      document.dispatchEvent(new KeyboardEvent('keydown', opts));
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown', opts));
      }
    } catch (e) {}
  }

  /**
   * Переключить режим внутри поповера (напр. "Specific dates"/"Ranges") — кнопки
   * role="radio" внутри контейнера modeContainerSel. Кликаем, только если желаемая
   * кнопка ещё не активна (aria-checked/aria-selected) — меньше лишних кликов.
   */
  async function setPopoverMode(modeContainerSel, desiredTextRegex) {
    const container = document.querySelector(modeContainerSel);
    if (!container) return false;
    const radios = container.querySelectorAll('[role="radio"]');
    for (const radio of radios) {
      const text = (radio.textContent || '').trim();
      if (!desiredTextRegex.test(text)) continue;
      const state = radio.getAttribute('aria-checked') ?? radio.getAttribute('aria-selected');
      if (state !== 'true') {
        reactClick(radio);
        await sleep(350);
      }
      return true;
    }
    return false;
  }

  /**
   * Пункты-даты внутри открытого поповера series-filter. qa-id вида
   * "option-NASDAQ:AAPL;AAPL;20260817" — дата машиночитаема в последнем сегменте
   * после ';'. Отфильтровываем чужие qa-id, начинающиеся с "option-" (напр.
   * переключатель режима "option-chain-series-filter-mode"), по формату 8 цифр.
   */
  function getDateOptionItems() {
    const overlay = document.querySelector(OVERLAY_SEL);
    if (!overlay) return [];
    const nodes = overlay.querySelectorAll('[data-qa-id^="option-"]');
    const items = [];
    for (const el of nodes) {
      const qa = el.getAttribute('data-qa-id') || '';
      const last = qa.split(';').pop();
      if (!/^\d{8}$/.test(last || '')) continue;
      const iso = `${last.slice(0, 4)}-${last.slice(4, 6)}-${last.slice(6, 8)}`;
      const dteMatch = (el.textContent || '').match(/(\d+)\s*DTE/i);
      const days = dteMatch ? parseInt(dteMatch[1], 10) : null;
      const selected = el.getAttribute('aria-selected') === 'true';
      items.push({ date: iso, days, selected, el });
    }
    return items;
  }

  /**
   * Пункты режима "Ranges" (страйки) без qa-id — ищем листовой элемент с точным
   * текстом внутри поповера (напр. "All strikes").
   */
  function findOverlayLeafByText(matchFn) {
    const overlay = document.querySelector(OVERLAY_SEL);
    if (!overlay) return null;
    const all = overlay.querySelectorAll('div, span');
    for (const el of all) {
      if (el.children.length > 0) continue; // только листовые ноды — сам текст пункта
      const text = (el.textContent || '').trim();
      if (!text) continue;
      if (matchFn(text)) return el;
    }
    return null;
  }

  /** Клик по пункту без qa-id: поднимаемся до ближайшего кликабельного предка. */
  function clickOverlayLeaf(el) {
    if (!el) return;
    const target = el.closest('[class*="button-"], [role="button"], button') || el;
    reactClick(target);
  }

  // ---------------------------------------------------------------------
  // Примитивы установки фильтров
  // ---------------------------------------------------------------------

  /** Выставить страйки → "All strikes". Возвращает true, если в итоге чип это подтверждает. */
  async function ensureAllStrikes() {
    const chip = findFilterChip('strikes');
    if (!chip) { WARN('ensureAllStrikes: чип страйков не найден'); return false; }
    if ((chip.textContent || '').toLowerCase().includes('all strikes')) return true;

    reactClick(chip);
    const overlay = await waitForOverlay();
    if (!overlay) { WARN('ensureAllStrikes: поповер не открылся'); return false; }
    try {
      await setPopoverMode(STRIKES_MODE_SEL, /^ranges$/i);
      await sleep(300);
      const item = findOverlayLeafByText(t => /^all strikes$/i.test(t));
      if (!item) { WARN('ensureAllStrikes: пункт "All strikes" не найден'); return false; }
      clickOverlayLeaf(item);
      await sleep(500);
      return true;
    } finally {
      closePopover();
      await sleep(200);
    }
  }

  /** Выставить в фильтре дат "все даты" (select-all-option). */
  async function ensureAllDatesSelected() {
    const chip = findFilterChip('expiration');
    if (!chip) { WARN('ensureAllDatesSelected: чип экспираций не найден'); return false; }

    reactClick(chip);
    const overlay = await waitForOverlay();
    if (!overlay) { WARN('ensureAllDatesSelected: поповер не открылся'); return false; }
    try {
      await setPopoverMode(SERIES_MODE_SEL, /^specific dates$/i);
      await sleep(300);
      const btn = document.querySelector(SELECT_ALL_SEL);
      if (!btn) { WARN('ensureAllDatesSelected: кнопка select-all не найдена'); return false; }
      reactClick(btn);
      await sleep(400);
      return true;
    } finally {
      closePopover();
      await sleep(200);
    }
  }

  /**
   * Отметить в поповере только НУЖНЫЕ даты (не снимая чужие уже выбранные — лишние
   * данные безвредны, меньше кликов). Возвращает даты, которых нет в списке пунктов.
   */
  async function ensureSpecificDatesSelected(dates) {
    const missing = [];
    const chip = findFilterChip('expiration');
    if (!chip) { WARN('ensureSpecificDatesSelected: чип экспираций не найден'); return { missing: dates.slice() }; }

    reactClick(chip);
    const overlay = await waitForOverlay();
    if (!overlay) { WARN('ensureSpecificDatesSelected: поповер не открылся'); return { missing: dates.slice() }; }
    try {
      await setPopoverMode(SERIES_MODE_SEL, /^specific dates$/i);
      await sleep(300);
      const items = getDateOptionItems();
      for (const date of dates) {
        const item = items.find(it => it.date === date);
        if (!item) { missing.push(date); continue; }
        if (!item.selected) {
          reactClick(item.el);
          await sleep(250);
        }
      }
      return { missing };
    } finally {
      closePopover();
      await sleep(200);
    }
  }

  /**
   * Публичный примитив: гарантировать, что доска показывает нужные даты и страйки.
   * dates: массив 'YYYY-MM-DD' (отметить только их) или null (выбрать все даты).
   * Никогда не бросает исключение наружу — недоступность элементов даёт {ok:false}.
   */
  async function ensureChainVisibility({ dates = null, allStrikes = true } = {}) {
    const missing = [];
    try {
      if (allStrikes) {
        const ok = await ensureAllStrikes();
        if (!ok) WARN('ensureChainVisibility: не удалось выставить All strikes');
      }
      if (dates === null) {
        const ok = await ensureAllDatesSelected();
        if (!ok) return { ok: false, missing };
      } else {
        const result = await ensureSpecificDatesSelected(dates);
        missing.push(...result.missing);
      }
    } catch (e) {
      WARN('ensureChainVisibility error:', e.message);
      return { ok: false, missing };
    }
    return { ok: missing.length === 0, missing };
  }

  /** Установить фильтры по умолчанию: все даты + все страйки. */
  async function ensureFilters() {
    try {
      await ensureChainVisibility({ dates: null, allStrikes: true });
    } catch (e) {
      WARN('ensureFilters error:', e.message);
    }
  }

  // ---------------------------------------------------------------------
  // Список экспираций (заголовки)
  // ---------------------------------------------------------------------

  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  /**
   * Разобрать текст группового заголовка таблицы ("August 17" или "Jan 15, 2027")
   * в ISO-дату. Год берём явно из текста, если он есть; иначе подбираем ближайший
   * год из {текущий-1, текущий, текущий+1}, минимизируя |разница_в_днях − DTE| —
   * НЕ просто today+DTE, это дрейфует на границах года/таймзон.
   */
  function parseGroupCellDate(text, days) {
    const m = text.match(/([A-Za-z]{3,})\s+(\d{1,2})(?:,\s*(\d{4}))?/);
    if (!m) return null;
    const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (month === undefined) return null;
    const day = parseInt(m[2], 10);

    let year = m[3] ? parseInt(m[3], 10) : null;
    if (year === null) {
      const now = new Date();
      const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      let bestYear = now.getUTCFullYear();
      let bestDiff = Infinity;
      for (const y of [now.getUTCFullYear() - 1, now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
        const candidateDays = Math.round((Date.UTC(y, month, day) - todayUTC) / 86400000);
        const diff = Math.abs(candidateDays - (Number.isFinite(days) ? days : candidateDays));
        if (diff < bestDiff) { bestDiff = diff; bestYear = y; }
      }
      year = bestYear;
    }
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  /** Признак "экспирация развёрнута и отрисована" — надёжный приём, сохранён без изменений. */
  function isExpirationExpanded(iso) {
    const ymd = iso.replace(/-/g, '').slice(2);
    return document.querySelector(`td[data-cell-id*="${ymd}C"], td[data-cell-id*="${ymd}P"]`) != null;
  }

  /** Найти групповой заголовок строки для даты (для клика сворачивания/разворачивания). */
  function findGroupCellElement(iso) {
    const groups = document.querySelectorAll('[class*="groupCell"]');
    for (const el of groups) {
      const text = (el.textContent || '').trim();
      const dteMatch = text.match(/(\d+)\s*DTE/i);
      const days = dteMatch ? parseInt(dteMatch[1], 10) : null;
      if (parseGroupCellDate(text, days) === iso) return el;
    }
    return null;
  }

  /** Клик по секции — сама строка groupCell или её button/[role=button]-потомок. */
  function groupRowClickTarget(groupCellEl) {
    // Слушатель клика TV висит на внутреннем div[class*="groupContent"], а не на
    // строке/ячейке: клик по <tr> секцию НЕ раскрывает (проверено живьём 2026-08-15).
    const content = groupCellEl.querySelector('[class*="groupContent"]');
    if (content) return content;
    const row = groupCellEl.closest('tr');
    const btn = (row || groupCellEl).querySelector('button, [role="button"]');
    return btn || groupCellEl || row;
  }

  /**
   * Основной источник: поповер series-filter отдаёт ПОЛНЫЙ список дат/DTE без
   * скролла таблицы. Открывает и сразу закрывает поповер, ничего в фильтре не меняя.
   */
  async function readExpirationsFromPopover() {
    const chip = findFilterChip('expiration');
    if (!chip) return null;
    reactClick(chip);
    const overlay = await waitForOverlay();
    if (!overlay) return null;
    try {
      await setPopoverMode(SERIES_MODE_SEL, /^specific dates$/i);
      await sleep(250);
      const items = getDateOptionItems();
      if (items.length === 0) return null;
      return items.map(it => ({ date: it.date, days: it.days }));
    } finally {
      closePopover();
      await sleep(150);
    }
  }

  /** Резервный источник: групповые заголовки в таблице — только уже отрисованные даты. */
  function readExpirationsFromTable() {
    const results = [];
    const seen = new Set();
    const groups = document.querySelectorAll('[class*="groupCell"]');
    for (const el of groups) {
      const text = (el.textContent || '').trim();
      const dteMatch = text.match(/(\d+)\s*DTE/i);
      const days = dteMatch ? parseInt(dteMatch[1], 10) : null;
      const iso = parseGroupCellDate(text, days);
      if (!iso || seen.has(iso)) continue;
      seen.add(iso);
      results.push({ date: iso, days });
    }
    return results;
  }

  // Кэш полного списка дат из поповера: без него dumpExpirationsList (вызывается на
  // КАЖДОЕ добавление строк в таблицу — виртуализация/скролл/раскрытие) открывал бы
  // поповер фильтра слишком часто и мешал бы пользователю. "expanded" при этом всегда
  // читаем заново — это дешёвая проверка DOM, без открытия поповера.
  const HEADERS_CACHE_TTL_MS = 8000;
  let headersCache = { list: null, ts: 0 };

  /** Список заголовков экспираций: {date, days, isExpanded}. Основной источник — поповер (с TTL-кэшем), резервный — таблица. */
  async function findExpirationHeaders({ forceRefresh = false } = {}) {
    const now = Date.now();
    let base;
    if (!forceRefresh && headersCache.list && (now - headersCache.ts) < HEADERS_CACHE_TTL_MS) {
      base = headersCache.list;
    } else {
      base = await readExpirationsFromPopover();
      if (base) {
        headersCache = { list: base, ts: now };
      } else {
        WARN('findExpirationHeaders: поповер недоступен, использую резервный источник (таблица)');
        base = readExpirationsFromTable(); // резервный список не кэшируем — он неполон
      }
    }
    return base
      .map(h => ({ date: h.date, days: h.days, isExpanded: isExpirationExpanded(h.date) }))
      .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
  }

  /**
   * Свернуть все ПРОЧИЕ раскрытые экспирации (кроме целевой).
   * ЗАЧЕМ: TradingView ненадёжно раскрывает вторую группу, когда первая уже
   * раскрыта — из-за этого ломался сбор второй (альтернативной) даты в режиме
   * двойной экспирации. Сворачивание возвращает таблицу в «чистое» состояние.
   */
  async function collapseOtherExpirations(targetIso) {
    const headers = await findExpirationHeaders();
    for (const h of headers) {
      if (h.date === targetIso) continue;
      if (!isExpirationExpanded(h.date)) continue; // уже свёрнута
      const groupCellEl = findGroupCellElement(h.date);
      if (!groupCellEl) continue; // группа не отрисована — сворачивать нечего
      LOG('Сворачиваю прочую экспирацию перед раскрытием цели:', h.date);
      reactClick(groupRowClickTarget(groupCellEl));
      const start = Date.now();
      while (Date.now() - start < 2500) {
        if (!isExpirationExpanded(h.date)) break;
        await sleep(150);
      }
    }
  }

  /** Развернуть группу указанной экспирации (если свёрнута). */
  async function expandExpirationByDate(targetIso, timeoutMs = 12000) {
    const rowsSelector = () => {
      const ymd = targetIso.replace(/-/g, '').slice(2);
      return `td[data-cell-id*="${ymd}C"], td[data-cell-id*="${ymd}P"]`;
    };

    if (document.querySelector(rowsSelector())) {
      return { ok: true, expanded: false, date: targetIso };
    }

    // Гарантируем, что нужная дата видна в фильтре, и что страйки не обрезаны —
    // иначе групповой строки для этой даты вообще не будет в DOM.
    const visibility = await ensureChainVisibility({ dates: [targetIso], allStrikes: true });
    if (visibility.missing.includes(targetIso)) {
      WARN('expandExpirationByDate: дата отсутствует в списке фильтра', targetIso);
    }
    await sleep(300);

    // Чистое состояние: сворачиваем прочие раскрытые экспирации, иначе вторую
    // группу TradingView раскрывает ненадёжно (ломался сбор альтернативной даты).
    await collapseOtherExpirations(targetIso);
    await sleep(300);

    if (document.querySelector(rowsSelector())) {
      return { ok: true, expanded: false, date: targetIso };
    }

    const groupCellEl = findGroupCellElement(targetIso);
    if (!groupCellEl) {
      const headers = await findExpirationHeaders();
      return { ok: false, reason: 'header-not-found', date: targetIso, knownDates: headers.map(h => h.date) };
    }

    const waitForRows = async (ms) => {
      const start = Date.now();
      while (Date.now() - start < ms) {
        if (document.querySelector(rowsSelector())) return true;
        await sleep(150);
      }
      return false;
    };

    LOG('Кликаю по секции экспирации', targetIso);
    reactClick(groupRowClickTarget(groupCellEl));
    if (await waitForRows(2500)) {
      return { ok: true, expanded: true, date: targetIso };
    }
    // Повторный клик — иногда первый клик не долетает из-за незавершённого рендера
    // сразу после смены фильтра дат.
    reactClick(groupRowClickTarget(groupCellEl));
    if (await waitForRows(Math.max(timeoutMs - 2500, 1000))) {
      return { ok: true, expanded: true, date: targetIso, via: 'retry' };
    }
    return { ok: false, reason: 'timeout-waiting-rows', date: targetIso };
  }

  async function dumpExpirationsList() {
    try {
      if (!chrome?.runtime?.id) return;
      const headers = await findExpirationHeaders();
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
    expandExpirationByDate(targetIso).then(async (result) => {
      try {
        if (result.ok && typeof injectButtons === 'function') {
          injectButtons();
        }
        if (typeof dumpFullChain === 'function') {
          dumpFullChain();
        }
        await dumpExpirationsList();
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
      setTimeout(async () => {
        await dumpExpirationsList();
        // Иногда первый ensureFilters не успевает: даём странице ещё кружок
        setTimeout(async () => {
          await dumpExpirationsList();
          sendResponse({ ok: true });
        }, 1200);
      }, 800);
    });
  }

  window.ext2North = {
    findExpirationHeaders,
    expandExpirationByDate,
    ensureFilters,
    ensureChainVisibility,
    dumpExpirationsList,
    handleNorthExpandAndDump,
    handleNorthEnsureFilters,
  };

  LOG('northSupport.js загружен');
})();
