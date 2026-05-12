/**
 * Background Module: Pending Parser
 * ЗАЧЕМ: Inline-скрипт для парсинга одной строки TV Chain View с bid/ask/volume.
 * Передаётся как `func` в `chrome.scripting.executeScript` — выполняется в DOM вкладки TradingView.
 *
 * Источник: handoff_calc_team_refresh / extension_source / background / pendingParser.js (без изменений)
 *
 * @param {string} optDate   — ISO-дата экспирации 'YYYY-MM-DD'
 * @param {number} optStrike — страйк (число)
 * @param {string} optType   — тип опциона 'C'/'CALL'/'P'/'PUT'
 * @returns {object|null} — { strike, iv, ivText, expirationISO, delta, gamma, theta, vega, bid, ask, volume }
 */
function parseTvOptionRow(optDate, optStrike, optType) {
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const dc = optDate.replace(/-/g, '');
  const prefix = months[parseInt(dc.substring(4, 6), 10) - 1] + ' ' + parseInt(dc.substring(6, 8), 10);

  // innerText предпочтительнее textContent — TV дублирует текст во вложенных span
  const cellText = (cell) => {
    if (!cell) return '';
    const t = (cell.innerText || '').trim();
    return t || (cell.textContent || '').trim();
  };

  // Единый хелпер чтения числа — обрабатывает юникодный минус U+2212
  const readCell = (idx, cellsArr) => {
    if (idx == null || idx < 0 || idx >= cellsArr.length) return { num: null, text: null };
    const raw = cellText(cellsArr[idx]);
    if (!raw || raw === '—' || raw === '-' || raw === '−') return { num: null, text: null };
    const normalized = raw.replace(/−/g, '-');
    const cleaned = normalized.replace(/[^\d.+\-eE]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '+') return { num: null, text: null };
    const n = parseFloat(cleaned);
    if (isNaN(n)) return { num: null, text: null };
    return { num: n, text: normalized };
  };
  const parseNumCell = (idx, arr) => readCell(idx, arr).num;

  // Карта колонок по заголовкам th — строится один раз
  const findColumnMap = (table) => {
    if (!table) return null;
    let maxTh = 0, bestRow = null;
    for (const r of table.querySelectorAll('tr')) {
      const tc = r.querySelectorAll('th').length;
      if (tc > maxTh) { maxTh = tc; bestRow = r; }
    }
    if (!bestRow) return null;
    const ths = bestRow.querySelectorAll('th');
    const map = { call: {}, put: {}, strikeIndex: -1, ivIndex: -1 };
    let afterStrike = false;
    for (let i = 0; i < ths.length; i++) {
      const t = (ths[i].textContent || '').trim().toLowerCase();
      if (t === 'strike') { map.strikeIndex = i; afterStrike = true; continue; }
      const side = afterStrike ? 'put' : 'call';
      if (t === 'iv' && afterStrike && map.ivIndex === -1) map.ivIndex = i;
      if (t === 'delta')       map[side].delta = i;
      else if (t === 'gamma')  map[side].gamma = i;
      else if (t === 'theta')  map[side].theta = i;
      else if (t === 'vega')   map[side].vega = i;
      else if (t === 'bid')    map[side].bid = i;
      else if (t === 'ask')    map[side].ask = i;
      else if (t === 'volume') map[side].volume = i;
    }
    return (map.strikeIndex >= 0) ? map : null;
  };

  // Fallback — жёсткие смещения для греков (старая 28-колоночная раскладка)
  const fallbackGreekIdx = (sIdx, side, greek) => {
    if (side === 'call') {
      if (greek === 'delta') return sIdx - 5;
      if (greek === 'gamma') return sIdx - 6;
      if (greek === 'theta') return sIdx - 7;
      if (greek === 'vega')  return sIdx - 8;
    } else {
      if (greek === 'delta') return sIdx + 6;
      if (greek === 'gamma') return sIdx + 7;
      if (greek === 'theta') return sIdx + 8;
      if (greek === 'vega')  return sIdx + 9;
    }
    return null;
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
    if (cells.length < 30) continue;

    if (columnMap === null) {
      columnMap = findColumnMap(cells[0]?.closest('table')) || false;
    }

    // Ищем страйк: сначала по карте, затем по маркерам +P/-C, затем по кнопкам
    let sVal = null, sIdx = -1;
    if (columnMap && columnMap.strikeIndex >= 0) {
      sIdx = columnMap.strikeIndex;
      sVal = parseNumCell(sIdx, cells);
      if (sVal !== null && !(sVal >= 1 && sVal < 100000)) sVal = null;
    }
    if (sVal === null) {
      for (let i = 0; i < cells.length; i++) {
        const t = cellText(cells[i]);
        if (t.includes('+P') || t.includes('-C')) {
          const m = t.match(/([\d,]+\.?\d*)/);
          if (m) { sVal = parseFloat(m[1].replace(/,/g, '')); sIdx = i; break; }
        }
      }
    }
    if (sVal === null) {
      for (let i = 0; i < cells.length; i++) {
        const btn = cells[i].querySelector('button');
        if (btn) {
          const num = parseFloat((btn.innerText || '').trim().replace(/,/g, ''));
          if (num >= 1 && num < 100000) { sVal = num; sIdx = i; break; }
        }
      }
    }
    if (sVal === null || Math.abs(sVal - optStrike) >= 1) continue;

    const ivIdx = (columnMap && columnMap.ivIndex >= 0) ? columnMap.ivIndex : (sIdx + 1);
    const ivCell = readCell(ivIdx, cells);
    if (ivCell.num === null) return null;

    const side = (optType === 'C' || optType === 'CALL') ? 'call' : 'put';
    const sideMap = columnMap ? columnMap[side] : null;
    const pickIdx = (field) => {
      if (sideMap && typeof sideMap[field] === 'number') return sideMap[field];
      return fallbackGreekIdx(sIdx, side, field);
    };

    return {
      strike: sVal,
      iv: ivCell.num, ivText: ivCell.text,
      expirationISO: optDate,
      delta:  readCell(pickIdx('delta'),  cells).num,
      gamma:  readCell(pickIdx('gamma'),  cells).num,
      theta:  readCell(pickIdx('theta'),  cells).num,
      vega:   readCell(pickIdx('vega'),   cells).num,
      // bid/ask/volume — только из карты заголовков (план UpdatePending запрещает fallback)
      bid:    readCell(pickIdx('bid'),    cells).num,
      ask:    readCell(pickIdx('ask'),    cells).num,
      volume: readCell(pickIdx('volume'), cells).num
    };
  }
  return null;
}
