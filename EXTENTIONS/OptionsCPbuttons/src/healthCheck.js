/**
 * ext2 — Health-check парсера TradingView
 * ЗАЧЕМ: Фиксирует, какие именно элементы вёрстки TradingView перестали соответствовать
 *        ожиданиям парсера, и сообщает пользователю, что нужно обновить расширение.
 *        Также валидирует цену базового актива, чтобы в калькулятор не попадала цена
 *        чужого тикера из watchlist/сравнения/popup.
 */

const EXT2_EXPECTED_COLUMNS = 50;
const EXT2_REQUIRED_HEADERS_CALL = ['bid', 'ask', 'delta', 'ltp'];
const EXT2_REQUIRED_HEADERS_PUT = ['bid', 'ask', 'delta'];

// Проверка структуры страницы доски опционов
// Возвращает { issues: [{ level, msg }], severity: 'ok'|'warning'|'critical' }
function ext2CheckPageStructure() {
  const issues = [];

  // 1. Шапка таблицы — вторая строка thead содержит заголовки колонок
  const headerRow = document.querySelector('thead tr:nth-child(2)');
  if (!headerRow) {
    issues.push({ level: 'critical', msg: 'Не найдена шапка таблицы опционов (thead > tr:nth-child(2))' });
    return { issues, severity: 'critical' };
  }
  const ths = headerRow.querySelectorAll('th');
  if (ths.length < 40) {
    issues.push({
      level: 'critical',
      msg: `Число колонок в шапке (${ths.length}) сильно меньше ожидаемых ${EXT2_EXPECTED_COLUMNS} — TradingView изменил структуру таблицы`
    });
  } else if (ths.length !== EXT2_EXPECTED_COLUMNS) {
    issues.push({
      level: 'warning',
      msg: `Число колонок в шапке (${ths.length}) отличается от ожидаемых ${EXT2_EXPECTED_COLUMNS} — греки и доп. поля могут парситься неточно`
    });
  }

  // 2. Обязательные заголовки в карте колонок
  const columnMap = typeof buildColumnMap === 'function' ? buildColumnMap() : null;
  if (columnMap) {
    const missingCall = EXT2_REQUIRED_HEADERS_CALL.filter(h => columnMap.call[h] === undefined);
    const missingPut = EXT2_REQUIRED_HEADERS_PUT.filter(h => columnMap.put[h] === undefined);
    if (missingCall.length) {
      issues.push({
        level: 'warning',
        msg: `Не найдены обязательные заголовки Call: ${missingCall.join(', ')}`
      });
    }
    if (missingPut.length) {
      issues.push({
        level: 'warning',
        msg: `Не найдены обязательные заголовки Put: ${missingPut.join(', ')}`
      });
    }
  } else {
    issues.push({ level: 'warning', msg: 'buildColumnMap() не вернул карту колонок' });
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

  // 4. Разметка call/put ячеек в первой строке
  const firstRow = rows[0];
  const callCells = firstRow.querySelectorAll('td[data-cell-part="call"]');
  const putCells = firstRow.querySelectorAll('td[data-cell-part="put"]');
  if (callCells.length === 0) {
    issues.push({ level: 'critical', msg: 'В строках страйков нет ячеек с data-cell-part="call"' });
  }
  if (putCells.length === 0) {
    issues.push({ level: 'critical', msg: 'В строках страйков нет ячеек с data-cell-part="put"' });
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

  // 7. Структура Volume-ячейки
  if (columnMap && columnMap.call.volume !== undefined && callCells.length > 0) {
    const volIdx = columnMap.call.volume;
    const volCell = callCells[volIdx];
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

  // Якорь 1: диапазон страйков таблицы — гарантированно для текущего тикера
  const rows = [...document.querySelectorAll('tr[data-strike]')];
  const strikes = rows.map(r => parseFloat(r.dataset.strike)).filter(s => s > 0);
  const hasStrikes = strikes.length >= 3;
  const minStrike = hasStrikes ? Math.min(...strikes) : 0;
  const maxStrike = hasStrikes ? Math.max(...strikes) : Infinity;
  const midStrike = hasStrikes ? (minStrike + maxStrike) / 2 : null;

  // Якорь 2: текущий тикер из URL — для привязки priceWrap к нужному символу
  const ticker = typeof getTickerFromUrl === 'function' ? getTickerFromUrl() : null;

  // Собираем всех кандидатов priceWrap
  // ЗАЧЕМ: Используем селектор с дефисом (priceWrap-) — он отсекает priceWrapper-XXXX
  // из правого виджет-бара (watchlist / detailsWidget). Без этого первая цена из watchlist
  // (часто Apple) могла перебить настоящую цену чейна на свежезагруженной странице TV.
  // Дополнительно явно отрезаем элементы правой панели через isInTvSidebar (utils.js).
  const _skipSidebar = typeof isInTvSidebar === 'function' ? isInTvSidebar : () => false;
  const priceWraps = [...document.querySelectorAll('[class*="priceWrap-"]')]
    .filter(el => !_skipSidebar(el));
  const _parseNum = typeof parseNumber === 'function'
    ? parseNumber
    : (t) => {
        const n = parseFloat(String(t || '').replace(/[,\s]/g, '').replace(/−/g, '-'));
        return isNaN(n) ? 0 : n;
      };

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

  const isPlausible = (v) => !hasStrikes || (v >= minStrike * 0.5 && v <= maxStrike * 1.5);

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
