/**
 * Background Module: Pending Parser
 * ЗАЧЕМ: Inline-скрипт для парсинга одной строки TV Chain View с bid/ask/volume/греками.
 * Передаётся как `func` в `chrome.scripting.executeScript` — выполняется в DOM вкладки TradingView.
 *
 * ВАЖНО (ограничение MV3): функция инжектится как `func:` в executeScript — она обязана
 * быть ПОЛНОСТЬЮ САМОДОСТАТОЧНОЙ. Никаких замыканий на внешние константы/функции модуля:
 * весь словарь токенов и все хелперы объявлены ВНУТРИ тела функции.
 *
 * Вёрстка TradingView 2026-08 (сгруппированные колонки, см. src/parser.js — образец той же
 * логики для контент-скрипта): thead — 16 <th> (7 call-групп + Strike + 7 put-групп + 1 пустой
 * служебный). Включённые доп. подколонки склеиваются в один th и одну ячейку, разделитель
 * под-значений внутри ячейки — перевод строки (\n) или "×" (напр. "12.05 × 15.15").
 * Строка данных — tr[data-strike], ячейки td[data-cell-part="call|central|put"],
 * td[data-cell-id] вида "OPRA:AAPL260817C292.5" содержит экспирацию+тип+страйк.
 *
 * @param {string} optDate   — ISO-дата экспирации 'YYYY-MM-DD'
 * @param {number} optStrike — страйк (число)
 * @param {string} optType   — тип опциона 'C'/'CALL'/'P'/'PUT'
 * @returns {object|null} — { strike, iv, ivText, expirationISO,
 *   delta, deltaText, gamma, gammaText, theta, thetaText, vega, vegaText,
 *   bid, ask, volume }
 */
function parseTvOptionRow(optDate, optStrike, optType) {
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const dc = optDate.replace(/-/g, '');
  const prefix = months[parseInt(dc.substring(4, 6), 10) - 1] + ' ' + parseInt(dc.substring(6, 8), 10);
  // Для сверки с data-cell-id (YYMMDD, 2-значный год) — защита от совпадения префикса
  // месяца/дня в разных годах (напр. "August 17" 2026 и 2027).
  const expectedYmd6 = dc.slice(2);

  // SYNC: словарь токенов заголовков — копия src/parser.js HEADER_TOKEN_DICT, менять синхронно.
  // Порядок важен: более длинные/специфичные токены раньше более коротких (жадное
  // сопоставление префиксов заголовка группы, напр. "bid iv" не должен быть распознан как "bid").
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

  // Точное совпадение токена (для частей, разбитых по "×", напр. "Bid × Ask")
  const matchToken = (part) => {
    const found = HEADER_TOKEN_DICT.find(([raw]) => raw === part);
    return found ? found[1] : null;
  };

  // "annualized" — модификатор предыдущего bidPct/askPct, не самостоятельное значение
  const mergeAnnualizedTokens = (tokens) => {
    const result = [];
    for (const token of tokens) {
      if (token === 'annualized') {
        const prev = result[result.length - 1];
        if (prev === 'bidPct') { result[result.length - 1] = 'annBidPct'; continue; }
        if (prev === 'askPct') { result[result.length - 1] = 'annAskPct'; continue; }
        continue;
      }
      result.push(token);
    }
    return result;
  };

  // Разбор текста заголовка одной группы в упорядоченный список токенов
  const tokenizeHeader = (text) => {
    const normalized = (text || '').trim().toLowerCase();
    if (!normalized) return [];
    if (normalized.includes('×')) {
      return normalized.split('×').map(part => matchToken(part.trim())).filter(Boolean);
    }
    const tokens = [];
    let rest = normalized;
    while (rest.length > 0) {
      const found = HEADER_TOKEN_DICT.find(([raw]) => rest.startsWith(raw));
      if (!found) break; // неизвестный остаток — сохраняем то, что успели распознать
      rest = rest.slice(found[0].length).trimStart();
      tokens.push(found[1]);
    }
    return mergeAnnualizedTokens(tokens);
  };

  // Разбор заголовков одной стороны в lookup «токен → {cellIdx, subIdx}»
  const buildSideMap = (ths) => {
    const sideMap = {};
    ths.forEach((th, cellIdx) => {
      const tokens = tokenizeHeader(th.textContent);
      tokens.forEach((key, subIdx) => {
        if (key && sideMap[key] === undefined) {
          sideMap[key] = { cellIdx, subIdx };
        }
      });
    });
    return sideMap;
  };

  // innerText предпочтительнее textContent — TV дублирует текст во вложенных span
  const cellText = (cell) => {
    if (!cell) return '';
    const t = (cell.innerText || '').trim();
    return t || (cell.textContent || '').trim();
  };

  // Единый хелпер нормализации одного под-значения: юникодный минус, тысячи, "%",
  // "—"/"-" → null. Возвращает и число (для калькулятора), и текст-как-на-доске
  // (для оверлея сравнения — без округлений, trailing zeros сохраняются).
  const normalizeValue = (raw) => {
    if (raw === undefined || raw === null) return { num: null, text: null };
    const trimmed = String(raw).trim();
    if (!trimmed || trimmed === '—' || trimmed === '-' || trimmed === '−') return { num: null, text: null };
    const normalized = trimmed.replace(/−/g, '-');
    const cleaned = normalized.replace(/[^\d.+\-eE]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '+') return { num: null, text: null };
    const n = parseFloat(cleaned);
    if (isNaN(n)) return { num: null, text: null };
    return { num: n, text: normalized };
  };

  // Значения внутри группированной ячейки, в порядке токенов заголовка группы
  const readCellSubValues = (cell) => {
    if (!cell) return [];
    const raw = cellText(cell);
    if (!raw) return [];
    return raw
      .split('\n')
      .flatMap(line => line.split('×'))
      .map(s => s.trim())
      .filter(s => s.length > 0);
  };

  // Карта колонок по заголовкам th — групповая модель (см. src/parser.js buildColumnMap)
  const findColumnMap = (table) => {
    if (!table) return null;
    let maxTh = 0, bestRow = null;
    for (const r of table.querySelectorAll('tr')) {
      const tc = r.querySelectorAll('th').length;
      if (tc > maxTh) { maxTh = tc; bestRow = r; }
    }
    if (!bestRow) return null;
    const ths = Array.from(bestRow.querySelectorAll('th'));
    const strikeIdx = ths.findIndex(th => (th.textContent || '').trim().toLowerCase() === 'strike');
    if (strikeIdx === -1) return null;
    const callThs = ths.slice(0, strikeIdx);
    const putThs = ths.slice(strikeIdx + 1);
    return { call: buildSideMap(callThs), put: buildSideMap(putThs) };
  };

  // Чтение под-значения стороны по токену через карту колонок
  const getSideValue = (cells, sideMap, token) => {
    const loc = sideMap ? sideMap[token] : undefined;
    if (!loc || !cells[loc.cellIdx]) return { num: null, text: null };
    const subvalues = readCellSubValues(cells[loc.cellIdx]);
    return normalizeValue(subvalues[loc.subIdx]);
  };

  let columnMap = null;
  const allTrs = document.querySelectorAll('tr');
  let inSection = false;

  for (const tr of allTrs) {
    const gc = tr.querySelector('[class*="groupCell"]');
    if (gc) {
      if (gc.textContent?.trim().startsWith(prefix)) { inSection = true; continue; }
      if (inSection) break;
      continue;
    }
    if (!inSection) continue;

    const cells = tr.querySelectorAll('td');
    if (cells.length < 10) continue;

    if (columnMap === null) {
      columnMap = findColumnMap(cells[0]?.closest('table')) || false;
    }

    // Страйк: приоритет tr[data-strike], затем td[data-row-id], затем маркеры +P/-C,
    // затем кнопка с числом в central-ячейке.
    let sVal = null;
    if (tr.dataset && tr.dataset.strike) {
      const n = parseFloat(tr.dataset.strike);
      if (!isNaN(n)) sVal = n;
    }
    if (sVal === null) {
      const rowIdCell = tr.querySelector('td[data-row-id]');
      if (rowIdCell) {
        const n = parseFloat(rowIdCell.dataset.rowId);
        if (!isNaN(n)) sVal = n;
      }
    }
    if (sVal === null) {
      for (const cell of cells) {
        const t = cellText(cell);
        if (t.includes('+P') || t.includes('-C')) {
          const m = t.match(/([\d,]+\.?\d*)/);
          if (m) { sVal = parseFloat(m[1].replace(/,/g, '')); break; }
        }
      }
    }
    if (sVal === null) {
      for (const cell of cells) {
        const btn = cell.querySelector('button');
        if (btn) {
          const num = parseFloat((btn.innerText || '').trim().replace(/,/g, ''));
          if (num >= 1 && num < 100000) { sVal = num; break; }
        }
      }
    }
    if (sVal === null || Math.abs(sVal - optStrike) >= 1) continue;

    // Защита от совпадения префикса месяца/дня в разных годах: сверяем YYMMDD из data-cell-id
    const cellWithId = tr.querySelector('td[data-cell-id]');
    if (cellWithId) {
      const idMatch = (cellWithId.dataset.cellId || '').match(/(\d{6})[CP][\d.]+$/);
      if (idMatch && idMatch[1] !== expectedYmd6) continue;
    }

    // Ячейки нужной стороны: приоритет td[data-cell-part] (надёжно), fallback — деление
    // по позиции central-ячейки (кнопка с числом, равным найденному страйку).
    const side = (optType === 'C' || optType === 'CALL') ? 'call' : 'put';
    const cellsArr = Array.from(cells);
    let sideCells = Array.from(tr.querySelectorAll(`td[data-cell-part="${side}"]`));
    if (sideCells.length === 0) {
      let centralIdx = cellsArr.findIndex(c => {
        const btn = c.querySelector('button');
        if (!btn) return false;
        const n = parseFloat((btn.innerText || '').trim().replace(/,/g, ''));
        return Math.abs(n - sVal) < 0.001;
      });
      if (centralIdx === -1) centralIdx = Math.floor(cellsArr.length / 2);
      sideCells = side === 'call' ? cellsArr.slice(0, centralIdx) : cellsArr.slice(centralIdx + 1);
    }

    const sideMap = columnMap ? columnMap[side] : null;
    const get = (token) => getSideValue(sideCells, sideMap, token);

    // IV — основной токен группы, фолбэк на Ask/Bid IV если дефолтная колонка IV отключена.
    // Без IV строка непригодна для сравнения — прекращаем разбор (как и раньше).
    const ivRes = get('iv');
    const finalIV = ivRes.num !== null ? ivRes : (get('askIV').num !== null ? get('askIV') : get('bidIV'));
    if (finalIV.num === null) return null;

    const deltaRes = get('delta');
    const gammaRes = get('gamma');
    const thetaRes = get('theta');
    const vegaRes = get('vega');
    const bidRes = get('bid');
    const askRes = get('ask');
    const volumeRes = get('volume');

    return {
      strike: sVal,
      iv: finalIV.num, ivText: finalIV.text,
      expirationISO: optDate,
      delta: deltaRes.num, deltaText: deltaRes.text,
      gamma: gammaRes.num, gammaText: gammaRes.text,
      theta: thetaRes.num, thetaText: thetaRes.text,
      vega:  vegaRes.num,  vegaText:  vegaRes.text,
      // bid/ask/volume — только из карты заголовков, fallback не вводим (см. план UpdatePending)
      bid:    bidRes.num,
      ask:    askRes.num,
      volume: volumeRes.num
    };
  }
  return null;
}
