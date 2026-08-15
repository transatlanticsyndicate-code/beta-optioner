/**
 * ext2 — Health-check парсера TradingView
 * ЗАЧЕМ: Фиксирует, какие именно элементы вёрстки TradingView перестали соответствовать
 *        ожиданиям парсера, и сообщает пользователю, что нужно обновить расширение.
 *        Также валидирует цену базового актива, чтобы в калькулятор не попадала цена
 *        чужого тикера из watchlist/сравнения/popup.
 *
 * Обновлено 2026-08-15: TradingView заменил ~50 отдельных <th> в шапке доски опционов
 * на 16 ГРУППИРОВАННЫХ колонок (напр. подколонки Bid и Ask теперь один <th> "Bid × Ask",
 * Delta и Gamma — один <th> "DeltaGamma"). Число этих групп почти не меняется при
 * включении/выключении полей в Customize columns — меняется состав токенов в тексте th.
 * Поэтому пороги колонок ослаблены, а обязательные поля ищутся подстрокой по тексту
 * th нужной стороны (Call/Put), а не по точному имени/индексу колонки.
 */

const EXT2_EXPECTED_COLUMNS = 16;       // ожидаемое число th в дефолтной раскладке TV (сгруппированные колонки)
const EXT2_MIN_COLUMNS_CRITICAL = 10;   // меньше этого — TV точно сломал структуру таблицы, не просто перегруппировал поля
const EXT2_REQUIRED_TOKENS_CALL = ['bid', 'ask', 'iv', 'delta'];
const EXT2_REQUIRED_TOKENS_PUT = ['bid', 'ask', 'iv', 'delta'];

// Проверка структуры страницы доски опционов
// Возвращает { issues: [{ level, msg }], severity: 'ok'|'warning'|'critical' }
function ext2CheckPageStructure() {
  const issues = [];

  // 0. Канарейка на смену вёрстки TV: якорь data-qa-id="options-chain" — контейнер доски опционов.
  // Не critical: страница могла ещё не дорисоваться (первый вызов из mainInit.js идёт через
  // setTimeout, а повторные — при каждом клике по кнопке, так что временное отсутствие само
  // "рассосётся" при следующем вызове без блокировки пользователя).
  if (window.location.pathname.includes('/options/') && !document.querySelector('[data-qa-id="options-chain"]')) {
    issues.push({
      level: 'warning',
      msg: 'Не найден контейнер доски опционов ([data-qa-id="options-chain"]) — возможно, TradingView снова сменил вёрстку, либо страница ещё не загрузилась'
    });
  }

  // 1. Шапка таблицы — вторая строка thead содержит заголовки колонок
  const headerRow = document.querySelector('thead tr:nth-child(2)');
  if (!headerRow) {
    issues.push({ level: 'critical', msg: 'Не найдена шапка таблицы опционов (thead > tr:nth-child(2))' });
    return { issues, severity: 'critical' };
  }
  const ths = [...headerRow.querySelectorAll('th')];
  const strikeIdx = ths.findIndex(th => th.textContent.trim().toLowerCase() === 'strike');

  if (ths.length < EXT2_MIN_COLUMNS_CRITICAL || strikeIdx === -1) {
    issues.push({
      level: 'critical',
      msg: `Шапка таблицы опционов не похожа на ожидаемую (колонок: ${ths.length}${strikeIdx === -1 ? ', колонка Strike не найдена' : ''}) — TradingView, вероятно, снова изменил структуру таблицы`
    });
  } else if (ths.length !== EXT2_EXPECTED_COLUMNS) {
    issues.push({
      level: 'warning',
      msg: `Число колонок в шапке (${ths.length}) отличается от ожидаемых ${EXT2_EXPECTED_COLUMNS} — пользователь включил/выключил доп. поля в Customize columns TradingView`
    });
  }

  // 2. Обязательные поля Bid/Ask/IV/Delta в группах Call и Put.
  // ЗАЧЕМ: TV сливает подколонки в один <th> (напр. "Bid × Ask", "DeltaGamma"), поэтому
  // токен ищем подстрокой в тексте th, а не по точному имени колонки через buildColumnMap()
  // (parser.js) — та функция всё ещё ждёт старую раскладку 24 call + 2 central + 24 put и
  // на 16 колонках отдаёт все th в map.call, ломая деление на call/put.
  if (strikeIdx > 0) {
    const callText = ths.slice(0, strikeIdx).map(th => th.textContent.trim().toLowerCase()).join(' | ');
    const putText = ths.slice(strikeIdx + 1).map(th => th.textContent.trim().toLowerCase()).join(' | ');

    const missingCall = EXT2_REQUIRED_TOKENS_CALL.filter(t => !callText.includes(t));
    const missingPut = EXT2_REQUIRED_TOKENS_PUT.filter(t => !putText.includes(t));
    if (missingCall.length) {
      issues.push({
        level: 'critical',
        msg: `В колонках Call не хватает полей: ${missingCall.join(', ')} — включите их через Customize columns на TradingView`
      });
    }
    if (missingPut.length) {
      issues.push({
        level: 'critical',
        msg: `В колонках Put не хватает полей: ${missingPut.join(', ')} — включите их через Customize columns на TradingView`
      });
    }
    // LTP выключен по умолчанию в новой раскладке — это не критично, парсер честно
    // считает цену опциона как середину bid/ask, но пользователь должен об этом знать
    if (!callText.includes('ltp') && !putText.includes('ltp')) {
      issues.push({
        level: 'warning',
        msg: 'Колонка LTP (цена последней сделки) не включена — цена опциона будет считаться как середина bid/ask'
      });
    }
  } else if (strikeIdx === 0) {
    issues.push({ level: 'critical', msg: 'Колонка Strike стоит первой в шапке — слева от неё нет колонок Call' });
  }

  // 3. Строки страйков
  const rows = document.querySelectorAll('tr[data-strike]');
  if (rows.length === 0) {
    issues.push({
      level: 'critical',
      msg: 'На странице нет ни одной строки с атрибутом data-strike — чейн опционов не найден'
    });
    return { issues, severity: 'critical' };
  }

  // 4. Разметка call/central/put ячеек в первой строке
  const firstRow = rows[0];
  const callCells = firstRow.querySelectorAll('td[data-cell-part="call"]');
  const centralCells = firstRow.querySelectorAll('td[data-cell-part="central"]');
  const putCells = firstRow.querySelectorAll('td[data-cell-part="put"]');
  if (callCells.length === 0) {
    issues.push({ level: 'critical', msg: 'В строках страйков нет ячеек с data-cell-part="call"' });
  }
  if (putCells.length === 0) {
    issues.push({ level: 'critical', msg: 'В строках страйков нет ячеек с data-cell-part="put"' });
  }
  // Раньше central нёс 2 ячейки (Strike + IV), в новой раскладке по умолчанию — только Strike (1 ячейка)
  if (centralCells.length === 0) {
    issues.push({
      level: 'warning',
      msg: 'В строках страйков нет ячейки data-cell-part="central" (Strike) — возможно, TradingView снова изменил разметку центральной колонки'
    });
  }

  // 5. data-cell-id и парсинг экспирации из него
  const firstCallCell = firstRow.querySelector('td[data-cell-id][data-cell-part="call"]');
  const firstPutCell = firstRow.querySelector('td[data-cell-id][data-cell-part="put"]');
  const cellId = firstCallCell?.dataset.cellId || firstPutCell?.dataset.cellId;
  if (!cellId) {
    issues.push({
      level: 'critical',
      msg: 'На ячейках опционов нет атрибута data-cell-id — невозможно определить экспирацию'
    });
  } else {
    const exp = typeof getExpirationFromCellId === 'function' ? getExpirationFromCellId(cellId) : null;
    if (!exp) {
      issues.push({
        level: 'critical',
        msg: `Не удалось разобрать экспирацию из data-cell-id "${cellId}" — формат изменился`
      });
    }
  }

  // 6. Тикер из URL
  const ticker = typeof getTickerFromUrl === 'function' ? getTickerFromUrl() : null;
  if (!ticker) {
    issues.push({
      level: 'critical',
      msg: 'Не удалось определить тикер из URL страницы TradingView (параметр ?symbol= или pathname)'
    });
  }

  // 7. Структура Volume-ячейки — колонку Volume ищем напрямую по заголовкам Call
  // (без buildColumnMap, см. пояснение в п.2)
  if (strikeIdx > 0 && callCells.length > 0) {
    const callThs = ths.slice(0, strikeIdx);
    const volIdx = callThs.findIndex(th => th.textContent.trim().toLowerCase().includes('volume'));
    const volCell = volIdx >= 0 ? callCells[volIdx] : null;
    if (volCell && !volCell.querySelector('span')) {
      issues.push({
        level: 'warning',
        msg: 'В ячейке Volume отсутствует элемент <span> — Volume может парситься неточно'
      });
    }
  }

  const severity = issues.some(i => i.level === 'critical') ? 'critical'
    : issues.some(i => i.level === 'warning') ? 'warning'
      : 'ok';
  return { issues, severity };
}

// Извлечение цены базового актива с оценкой уверенности
// Возвращает { price: number|null, confidence: 'high'|'low'|'none', issues: [...] }
function ext2GetUnderlyingPriceWithConfidence() {
  const issues = [];

  // Диапазон страйков таблицы — гарантированно для текущего тикера, используется и
  // приоритетным якорем ниже, и старой цепочкой fallback'ов
  const rows = [...document.querySelectorAll('tr[data-strike]')];
  const strikes = rows.map(r => parseFloat(r.dataset.strike)).filter(s => s > 0);
  const hasStrikes = strikes.length >= 3;
  const minStrike = hasStrikes ? Math.min(...strikes) : 0;
  const maxStrike = hasStrikes ? Math.max(...strikes) : Infinity;
  const midStrike = hasStrikes ? (minStrike + maxStrike) / 2 : null;
  const isPlausible = (v) => !hasStrikes || (v >= minStrike * 0.5 && v <= maxStrike * 1.5);

  const _parseNum = typeof parseNumber === 'function'
    ? parseNumber
    : (t) => {
        const n = parseFloat(String(t || '').replace(/[,\s]/g, '').replace(/−/g, '-'));
        return isNaN(n) ? 0 : n;
      };

  // Якорь 0 (высший приоритет): строка цены БА внутри самой доски опционов.
  // ЗАЧЕМ: data-qa-id="option-chain-underlying-row" — новый стабильный якорь TradingView,
  // лежит в tbody чейна текущего тикера, поэтому цена гарантированно относится к нему
  // и не может быть перепутана с watchlist/сайдбаром/чужим сравнением на графике.
  // Вся цепочка ниже (priceWrap- по документу, отсечение сайдбара, привязка по тикеру,
  // правдоподобие по страйкам) остаётся нетронутым fallback'ом на случай, если TV уберёт
  // и этот якорь в очередной A/B-раскатке вёрстки.
  const underlyingRow = document.querySelector('[data-qa-id="option-chain-underlying-row"]');
  if (underlyingRow) {
    const wrapEl = underlyingRow.querySelector('[class*="priceWrap-"]');
    const rawText = wrapEl ? wrapEl.textContent : underlyingRow.textContent;
    let rowValue = _parseNum(rawText);
    if (!(rowValue > 0)) {
      // Без priceWrap- текст строки — "AAPL 305.93 USD +0.67 +0.22%": тикер спереди мешает
      // parseFloat, поэтому вытаскиваем первое десятичное число явным регэкспом
      const m = String(rawText || '').match(/([\d,]+\.\d+)/);
      if (m) rowValue = _parseNum(m[1]);
    }
    if (rowValue > 0) {
      if (isPlausible(rowValue)) {
        return { price: rowValue, confidence: 'high', issues };
      }
      issues.push({
        level: 'warning',
        msg: `Цена ${rowValue} из строки БА доски опционов не попадает в диапазон страйков [${minStrike}-${maxStrike}] — используем резервный способ поиска цены`
      });
    }
  }

  // Якорь 1: текущий тикер из URL — для привязки priceWrap к нужному символу
  const ticker = typeof getTickerFromUrl === 'function' ? getTickerFromUrl() : null;

  // Собираем всех кандидатов priceWrap
  // ЗАЧЕМ: Используем селектор с дефисом (priceWrap-) — он отсекает priceWrapper-XXXX
  // из правого виджет-бара (watchlist / detailsWidget). Без этого первая цена из watchlist
  // (часто Apple) могла перебить настоящую цену чейна на свежезагруженной странице TV.
  // Дополнительно явно отрезаем элементы правой панели через isInTvSidebar (utils.js).
  const _skipSidebar = typeof isInTvSidebar === 'function' ? isInTvSidebar : () => false;
  const priceWraps = [...document.querySelectorAll('[class*="priceWrap-"]')]
    .filter(el => !_skipSidebar(el));

  const candidates = priceWraps
    .map(el => ({ el, value: _parseNum(el.textContent) }))
    .filter(c => c.value > 0);

  if (candidates.length === 0) {
    issues.push({
      level: 'critical',
      msg: 'На странице не найдено ни одного элемента с классом priceWrap- вне правого сайдбара — селектор цены базового актива сломан или цена ещё не отрисована'
    });
    return { price: null, confidence: 'none', issues };
  }

  // Попытка 1: кандидат, у которого кто-то из предков (до 8 уровней) содержит текущий тикер
  // ЗАЧЕМ: Это самая надёжная привязка к текущему символу
  let bestByTicker = null;
  if (ticker) {
    for (const c of candidates) {
      let parent = c.el.parentElement;
      for (let i = 0; i < 8 && parent; i++) {
        const text = parent.textContent || '';
        if (text.includes(ticker)) {
          bestByTicker = c;
          break;
        }
        parent = parent.parentElement;
      }
      if (bestByTicker) break;
    }
  }

  if (bestByTicker) {
    if (isPlausible(bestByTicker.value)) {
      return { price: bestByTicker.value, confidence: 'high', issues };
    }
    issues.push({
      level: 'warning',
      msg: `Цена ${bestByTicker.value} рядом с тикером ${ticker} не попадает в диапазон страйков [${minStrike}-${maxStrike}] — возможно, хедер ещё не обновился после смены символа`
    });
  }

  // Попытка 2: кандидат в диапазоне страйков, ближайший к центру (≈ATM)
  if (hasStrikes) {
    const plausible = candidates.filter(c => isPlausible(c.value));
    if (plausible.length > 0) {
      plausible.sort((a, b) => Math.abs(a.value - midStrike) - Math.abs(b.value - midStrike));
      if (!bestByTicker) {
        issues.push({
          level: 'warning',
          msg: `Не удалось однозначно привязать цену к тикеру ${ticker || '?'} через ближайшие элементы — цена выбрана по диапазону страйков чейна`
        });
      }
      return { price: plausible[0].value, confidence: 'low', issues };
    }
  }

  // Ни один кандидат не прошёл валидацию — возвращаем первого с пометкой low
  issues.push({
    level: 'warning',
    msg: `Ни один кандидат цены (${candidates.map(c => c.value).join(', ')}) не проходит валидацию по диапазону страйков — возвращаем первого без гарантий`
  });
  return { price: candidates[0].value, confidence: 'low', issues };
}

// Комплексная проверка: структура + цена
// Возвращает { severity, issues, price, priceConfidence }
function ext2RunHealthCheck() {
  const structure = ext2CheckPageStructure();
  const priceInfo = ext2GetUnderlyingPriceWithConfidence();

  const allIssues = [...structure.issues, ...priceInfo.issues];
  const severity = allIssues.some(i => i.level === 'critical') ? 'critical'
    : allIssues.some(i => i.level === 'warning') ? 'warning'
      : 'ok';

  if (allIssues.length > 0) {
    const ticker = typeof getTickerFromUrl === 'function' ? getTickerFromUrl() : '?';
    console.warn(LOG_TAG, `HealthCheck [${severity}] ticker=${ticker}:`, allIssues.map(i => `[${i.level}] ${i.msg}`));
  }

  return {
    severity,
    issues: allIssues,
    price: priceInfo.price,
    priceConfidence: priceInfo.confidence
  };
}
