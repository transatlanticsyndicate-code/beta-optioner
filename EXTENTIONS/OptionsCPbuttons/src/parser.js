/**
 * ext2 — Парсер таблицы опционов (новая верстка TradingView 2026-03)
 *
 * Структура: 24 Call + 2 Central (Strike, IV) + 24 Put = 50 колонок
 * data-cell-part="call"|"central"|"put" на каждой <td>
 * data-strike на <tr>
 * data-cell-id="CME_MINI:E3D260618C6625" содержит экспирацию и тип
 */

// Динамический маппинг колонок из <th> заголовков
// Возвращает { call: { bid: index, ask: index, ... }, put: { ... } }
function buildColumnMap() {
  const headerRow = document.querySelector('thead tr:nth-child(2)');
  if (!headerRow) {
    console.warn(LOG_TAG, 'buildColumnMap: thead не найден');
    return null;
  }

  const ths = headerRow.querySelectorAll('th');
  if (ths.length < 50) {
    console.warn(LOG_TAG, 'buildColumnMap: ожидалось 50+ колонок, получено', ths.length);
  }

  const map = { call: {}, central: {}, put: {} };

  // Первые 24 th = Call (порядок: Rho, Vega, Gamma, ... Volume)
  // [24] = Strike, [25] = IV (central)
  // [26..49] = Put (порядок: Volume, Distance, ... Rho)
  const callCount = 24;
  const centralCount = 2;

  for (let i = 0; i < ths.length; i++) {
    const name = ths[i].textContent.trim().toLowerCase();
    if (i < callCount) {
      map.call[name] = i;
    } else if (i < callCount + centralCount) {
      map.central[name] = i - callCount;
    } else {
      map.put[name] = i - callCount - centralCount;
    }
  }

  return map;
}

// Парсинг данных из ячейки (может содержать <span> для Volume progressbar)
function parseCellValue(cell) {
  if (!cell) return 0;
  // Volume ячейки: <div><span class="value-...">6</span><div role="progressbar">...</div></div>
  const span = cell.querySelector('span[class*="value"]') || cell.querySelector('span');
  if (span) return parseNumber(span.textContent);
  return parseNumber(cell.textContent);
}

// Парсинг строки опциона
// row = <tr data-strike="6625">
function parseOptionRow(row, columnMap) {
  const strike = parseFloat(row.dataset.strike);

  const callCells = row.querySelectorAll('td[data-cell-part="call"]');
  const putCells = row.querySelectorAll('td[data-cell-part="put"]');

  // Экспирация из data-cell-id первой call или put ячейки
  const firstCallCell = row.querySelector('td[data-cell-id][data-cell-part="call"]');
  const firstPutCell = row.querySelector('td[data-cell-id][data-cell-part="put"]');
  const expiration = getExpirationFromCellId(firstCallCell?.dataset.cellId || firstPutCell?.dataset.cellId);

  function extractSide(cells, sideMap) {
    function get(name) {
      const idx = sideMap[name];
      return idx !== undefined ? parseCellValue(cells[idx]) : 0;
    }
    return {
      bid: get('bid'),
      ask: get('ask'),
      last: get('ltp'),
      theor: get('theor'),
      spread: get('spread'),
      volume: get('volume'),
      distance: get('distance'),
      relDist: get('rel dist'),
      bidPct: get('bid %'),
      askPct: get('ask %'),
      annBidPct: get('ann bid %'),
      annAskPct: get('ann ask %'),
      intrinsicValue: get('intr value'),
      timeValue: get('time value'),
      bidIV: get('bid iv %'),
      askIV: get('ask iv %'),
      ivSpread: get('iv spread'),
      be: get('be'),
      toBePct: get('to be %'),
      delta: get('delta'),
      theta: get('theta'),
      gamma: get('gamma'),
      vega: get('vega'),
      rho: get('rho'),
      // Вычисляемые
      iv: get('ask iv %') || get('bid iv %'),
      price: get('ltp') || (get('bid') + get('ask')) / 2
    };
  }

  const callData = columnMap ? extractSide(callCells, columnMap.call) : {};
  const putData = columnMap ? extractSide(putCells, columnMap.put) : {};

  // Чистый IV из central колонки (вторая central ячейка = IV для страйка)
  const centralCells = row.querySelectorAll('td[data-cell-part="central"]');
  const centralIV = centralCells.length >= 2 ? parseNumber(centralCells[1].textContent) : 0;
  if (centralIV > 0) {
    callData.iv = centralIV;
    putData.iv = centralIV;
  }

  return { strike, expiration, callData, putData };
}

