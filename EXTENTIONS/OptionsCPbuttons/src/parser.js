/**
 * ext2 — Парсер таблицы опционов (вёрстка TradingView 2026-08, сгруппированные колонки)
 *
 * Структура thead (вторая строка, 16 <th>): 7 call-групп + Strike + 7 put-групп + 1 пустой
 * служебный th в конце. Каждая группа (напр. "Bid × Ask", "IV", "DeltaGamma" при включённой
 * Gamma) — ОДИН <th> и ОДНА <td data-cell-part="call|put">, внутри которой может быть
 * несколько под-значений (TV больше не рисует их отдельными колонками). Разделитель
 * под-значений внутри ячейки: перевод строки (\n) или "×" (для пар вида "12.05 × 15.15").
 * ВАЖНО: порядок под-значений внутри ячейки НЕ зеркалится между call/put — он всегда
 * совпадает с порядком токенов в заголовке этой же группы (проверено живьём: put "Bid × Ask"
 * = "0.03 × 0.05", bid первым, как и в заголовке "Bid × Ask").
 *
 * Central-часть раньше содержала 2 ячейки (Strike + "чистый" IV), теперь — только Strike
 * (td[data-cell-part="central"] ×1). "Чистого" IV больше нет, IV читается из group-токена
 * 'iv' на каждой стороне отдельно.
 *
 * data-cell-part="call"|"central"|"put" на каждой <td>
 * data-strike на <tr>
 * data-cell-id="OPRA:AAPL260817C292.5" содержит экспирацию и тип
 */

// Словарь токенов заголовков группы. Порядок ВАЖЕН: более длинные/специфичные токены
// должны стоять раньше более коротких, иначе, например, "bid iv" будет по ошибке распознан
// как "bid" (жадное сопоставление префиксов, см. описание задачи). Точные сокращения TV
// для ещё не встречавшихся комбинаций под-колонок неизвестны — словарь намеренно толерантен:
// нераспознанный остаток заголовка просто обрывает разбор, не роняя парсер.
const HEADER_TOKEN_DICT = [
  ['annualized', 'annualized'],
  ['time value', 'timeValue'],
  ['iv spread', 'ivSpread'],
  ['rel dist', 'relDist'],
  ['distance', 'distance'],
  ['to be %', 'toBePct'],
  ['bid iv', 'bidIV'],
  ['ask iv', 'askIV'],
  ['volume', 'volume'],
  ['spread', 'spread'],
  ['theor', 'theor'],
  ['delta', 'delta'],
  ['gamma', 'gamma'],
  ['theta', 'theta'],
  ['bid %', 'bidPct'],
  ['ask %', 'askPct'],
  ['vega', 'vega'],
  ['intr', 'intrinsicValue'],
  ['ltp', 'ltp'],
  ['bid', 'bid'],
  ['ask', 'ask'],
  ['rho', 'rho'],
  ['be', 'be'],
  ['iv', 'iv'],
];

// Точное совпадение токена (используется для частей, разбитых по "×", напр. "Bid × Ask")
function matchToken(part) {
  const found = HEADER_TOKEN_DICT.find(([raw]) => raw === part);
  return found ? found[1] : null;
}

// "annualized" — не самостоятельное значение, а модификатор предыдущего bidPct/askPct
// (полное имя колонки в TV — "Bid % annualized" / "Ask % annualized").
function mergeAnnualizedTokens(tokens) {
  const result = [];
  for (const token of tokens) {
    if (token === 'annualized') {
      const prev = result[result.length - 1];
      if (prev === 'bidPct') { result[result.length - 1] = 'annBidPct'; continue; }
      if (prev === 'askPct') { result[result.length - 1] = 'annAskPct'; continue; }
      continue; // модификатор без известного контекста — игнорируем
    }
    result.push(token);
  }
  return result;
}

// Разбор текста заголовка одной группы в упорядоченный список токенов
// (порядок = порядок под-значений внутри соответствующей td).
function tokenizeHeader(text) {
  const normalized = (text || '').trim().toLowerCase();
  if (!normalized) return [];

  // "Bid × Ask" — TV явно разделяет пару символом "×"
  if (normalized.includes('×')) {
    return normalized.split('×').map(part => matchToken(part.trim())).filter(Boolean);
  }

  // Иначе заголовок — конкатенация сокращений без разделителя (напр. "deltagamma"),
  // разбираем жадным сопоставлением по словарю (длинные токены раньше коротких).
  const tokens = [];
  let rest = normalized;
  while (rest.length > 0) {
    const found = HEADER_TOKEN_DICT.find(([raw]) => rest.startsWith(raw));
    if (!found) break; // неизвестный остаток — сохраняем то, что успели распознать
    rest = rest.slice(found[0].length).trimStart();
    tokens.push(found[1]);
  }
  return mergeAnnualizedTokens(tokens);
}

// Разбор заголовков одной стороны (call или put) в lookup «токен → {cellIdx, subIdx}».
// cellIdx — индекс td[data-cell-part=сторона] в строке (1:1 с индексом th этой стороны),
// subIdx — позиция значения внутри ячейки, если в одном th объединено несколько под-колонок.
function buildSideMap(ths) {
  const sideMap = {};
  ths.forEach((th, cellIdx) => {
    const tokens = tokenizeHeader(th.textContent);
    tokens.forEach((key, subIdx) => {
      // Первое вхождение токена побеждает — на случай дублей в неизвестных сочетаниях TV
      if (key && sideMap[key] === undefined) {
        sideMap[key] = { cellIdx, subIdx };
      }
    });
  });
  return sideMap;
}

// Динамический маппинг колонок из <th> заголовков.
// Возвращает { call: { токен: {cellIdx, subIdx}, ... }, central: {}, put: { ... } }
// Имя и сигнатура сохранены — используется buttonsHandlers.js и healthCheck.js.
function buildColumnMap() {
  const headerRow = document.querySelector('thead tr:nth-child(2)');
  if (!headerRow) {
    console.warn(LOG_TAG, 'buildColumnMap: thead не найден');
    return null;
  }

  const ths = Array.from(headerRow.querySelectorAll('th'));

  // Граница call/put — заголовок "Strike", а не фиксированное число колонок: TV теперь
  // рисует 16 сгруппированных th (число не меняется от вкл/выкл под-колонок — они просто
  // расширяют текст и содержимое уже существующей группы, не добавляя новый th).
  const strikeIdx = ths.findIndex(th => th.textContent.trim().toLowerCase() === 'strike');
  if (strikeIdx === -1) {
    console.warn(LOG_TAG, 'buildColumnMap: заголовок Strike не найден — структура таблицы изменилась');
    return null;
  }

  const callThs = ths.slice(0, strikeIdx);
  // Хвостовой пустой служебный th (последний элемент) даёт tokenizeHeader([]) → пустой
  // список токенов, поэтому соответствующая ему пустая put-ячейка сама по себе никогда
  // не попадёт в sideMap — отдельно отрезать её не нужно.
  const putThs = ths.slice(strikeIdx + 1);

  return {
    call: buildSideMap(callThs),
    central: {},
    put: buildSideMap(putThs),
  };
}

// Значения внутри группированной ячейки, в порядке, соответствующем токенам заголовка.
function readCellSubValues(cell) {
  if (!cell) return [];

  // Volume-ячейка: <span class="value-...">6</span><div role="progressbar">...</div> —
  // прогресс-бар может подмешать в innerText лишние пробельные символы, поэтому если
  // ячейка не групповая (нет \n и ×) и содержит value-span, читаем его напрямую
  // (сохранена логика старого parseCellValue).
  const valueSpan = cell.querySelector('span[class*="value"]');
  const raw = (cell.innerText || cell.textContent || '').trim();
  if (valueSpan && !raw.includes('\n') && !raw.includes('×')) {
    return [valueSpan.textContent.trim()];
  }

  if (!raw) return [];
  return raw
    .split('\n')
    .flatMap(line => line.split('×'))
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

// Чтение одного под-значения стороны по токену через карту колонок
function getSideValue(cells, sideMap, token) {
  const loc = sideMap ? sideMap[token] : undefined;
  if (!loc) return 0;
  const subvalues = readCellSubValues(cells[loc.cellIdx]);
  const raw = subvalues[loc.subIdx];
  return raw !== undefined ? parseNumber(raw) : 0;
}

// Парсинг строки опциона
// row = <tr data-strike="292.5">
function parseOptionRow(row, columnMap) {
  const strike = parseFloat(row.dataset.strike);

  const callCells = row.querySelectorAll('td[data-cell-part="call"]');
  const putCells = row.querySelectorAll('td[data-cell-part="put"]');

  // Экспирация из data-cell-id первой call или put ячейки
  const firstCallCell = row.querySelector('td[data-cell-id][data-cell-part="call"]');
  const firstPutCell = row.querySelector('td[data-cell-id][data-cell-part="put"]');
  const expiration = getExpirationFromCellId(firstCallCell?.dataset.cellId || firstPutCell?.dataset.cellId);

  function extractSide(cells, sideMap) {
    const get = (token) => getSideValue(cells, sideMap, token);
    return {
      bid: get('bid'),
      ask: get('ask'),
      last: get('ltp'),
      theor: get('theor'),
      spread: get('spread'),
      volume: get('volume'),
      distance: get('distance'),
      relDist: get('relDist'),
      bidPct: get('bidPct'),
      askPct: get('askPct'),
      annBidPct: get('annBidPct'),
      annAskPct: get('annAskPct'),
      intrinsicValue: get('intrinsicValue'),
      timeValue: get('timeValue'),
      bidIV: get('bidIV'),
      askIV: get('askIV'),
      ivSpread: get('ivSpread'),
      be: get('be'),
      toBePct: get('toBePct'),
      delta: get('delta'),
      theta: get('theta'),
      gamma: get('gamma'),
      vega: get('vega'),
      rho: get('rho'),
      // Вычисляемые: IV — основной токен группы "IV", фолбэк на Ask/Bid IV, если вместо
      // дефолтной колонки IV включены отдельные Bid IV / Ask IV.
      iv: get('iv') || get('askIV') || get('bidIV'),
      price: get('ltp') || (get('bid') + get('ask')) / 2
    };
  }

  const callData = columnMap ? extractSide(callCells, columnMap.call) : {};
  const putData = columnMap ? extractSide(putCells, columnMap.put) : {};

  return { strike, expiration, callData, putData };
}

/**
 * Парсинг всей видимой таблицы опционов и запись в chrome.storage.local.tvc_full_chain.
 * ЗАЧЕМ: Калькулятор может читать готовую цепочку (одна выбранная экспирация со всеми
 * страйками, bid/ask/IV/греки) через bridge optioner.js, который синкает tvc_full_chain
 * из chrome.storage в localStorage. Используется фичей "Стратегия СЕВЕР".
 *
 * Вызывается после каждого injectButtons() — то есть при появлении/обновлении строк.
 * Дебаунс не требуется: chrome.storage сам по себе быстр, а перезаписывать одну запись
 * с тем же содержимым безвредно.
 */
function dumpFullChain() {
  try {
    if (!chrome?.runtime?.id) return;

    const columnMap = buildColumnMap();
    if (!columnMap) return;

    const rows = document.querySelectorAll('tr[data-strike]');
    if (rows.length === 0) return;

    const ticker = typeof getTickerFromUrl === 'function' ? (getTickerFromUrl() || '') : '';
    const chain = [];

    for (const row of rows) {
      const parsed = parseOptionRow(row, columnMap);
      if (!parsed.strike || !parsed.expiration) continue;

      const baseEntry = {
        ticker,
        strike: parsed.strike,
        expirationISO: parsed.expiration,
        date: parsed.expiration,
      };

      const callData = parsed.callData || {};
      const putData = parsed.putData || {};

      // CALL — берём только если есть ASK (иначе для расчётов всё равно непригоден)
      if (callData.ask > 0) {
        chain.push({
          ...baseEntry,
          type: 'CALL',
          bid: callData.bid || 0,
          ask: callData.ask || 0,
          last: callData.last || 0,
          price: callData.price || callData.last || ((callData.bid + callData.ask) / 2) || 0,
          volume: callData.volume || 0,
          iv: callData.iv || 0,
          impliedVolatility: callData.iv || 0,
          askIV: callData.askIV || 0,
          bidIV: callData.bidIV || 0,
          delta: callData.delta || 0,
          gamma: callData.gamma || 0,
          theta: callData.theta || 0,
          vega: callData.vega || 0,
          rho: callData.rho || 0,
        });
      }

      // PUT — аналогично
      if (putData.ask > 0) {
        chain.push({
          ...baseEntry,
          type: 'PUT',
          bid: putData.bid || 0,
          ask: putData.ask || 0,
          last: putData.last || 0,
          price: putData.price || putData.last || ((putData.bid + putData.ask) / 2) || 0,
          volume: putData.volume || 0,
          iv: putData.iv || 0,
          impliedVolatility: putData.iv || 0,
          askIV: putData.askIV || 0,
          bidIV: putData.bidIV || 0,
          delta: putData.delta || 0,
          gamma: putData.gamma || 0,
          theta: putData.theta || 0,
          vega: putData.vega || 0,
          rho: putData.rho || 0,
        });
      }
    }

    // Дампим ВСЕГДА, даже пустую цепочку — это сигнал калькулятору, что
    // расширение отработало, просто в видимой таблице нет котировок (премаркет /
    // выходной). Без этого сигнала калькулятор зависает на 25 секунд таймаута.
    // Однако если в DOM вообще нет ни одной строки опционов — не перезаписываем
    // предыдущий полезный дамп (это может быть промежуточный пересчёт при
    // навигации, когда таблица ещё не отрисована).
    const hasRowsInDom = document.querySelector('tr[data-strike]') != null;
    if (chain.length === 0 && !hasRowsInDom) return;

    chrome.storage.local.set({
      tvc_full_chain: {
        ticker,
        options: chain,
        timestamp: Date.now(),
      },
    });
  } catch (e) {
    if (typeof console !== 'undefined') {
      console.warn('[ext2] dumpFullChain error:', e.message);
    }
  }
}
