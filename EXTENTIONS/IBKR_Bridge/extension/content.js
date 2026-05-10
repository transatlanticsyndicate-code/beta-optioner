// content.js - TradingView to IBKR Bridge (Dynamic Mapping V2)
console.log('%c IBKR Bridge v5.0: LOADED ', 'background: #222; color: #bada55');

const BRIDGE_URL = CONFIG.BRIDGE_URL;

// State
let mappingData = null;   // { "strike": {"C": conId, "P": conId}, ... }
let currentSymbol = null; // e.g. "AMD"
let currentSecType = null; // e.g. "STK"
let currentDate = null;   // e.g. "20260221"
let cachedCallAskIndex = -1;
let cachedPutAskIndex = -1;
let cachedCallBidIndex = -1;
let cachedPutBidIndex = -1;
let fetchInProgress = false;

// ─── 1. Symbol & Date Detection ───

function detectSymbolFromURL() {
    const match = window.location.href.match(/\/options\/chain\/([^\/]+)/);
    if (!match) return null;

    const raw = match[1];
    const parts = raw.split('-');
    if (parts.length < 2) return null;

    const exchange = parts[0].toUpperCase();
    let symbol = parts.slice(1).join('-').toUpperCase().replace(/[^A-Z0-9!]/g, '');

    const futuresExchanges = ['CME', 'CME_MINI', 'NYMEX', 'COMEX', 'CBOT', 'ICE'];
    let secType = 'STK';
    if (futuresExchanges.includes(exchange)) {
        secType = 'FUT';
    } else if (['CBOE'].includes(exchange) && ['SPX', 'VIX', 'NDX', 'RUT'].includes(symbol)) {
        secType = 'IND';
    }

    if (secType === 'FUT') {
        const rootMatch = symbol.match(/^([A-Z0-9]+)[FGHJKMNQUVXZ]\d{4}$/);
        if (rootMatch) {
            symbol = rootMatch[1];
        } else {
            const futRoot = symbol.match(/^([A-Z0-9]{2,4})/);
            if (futRoot) symbol = futRoot[1];
        }
    }

    return { symbol, secType, exchange };
}

function detectDateFromTab() {
    const seriesMatch = window.location.href.match(/series=[^&]+%3B(\d{8})/);
    if (seriesMatch) return seriesMatch[1];

    const activeTab = document.querySelector('button[aria-selected="true"][title*="202"]');
    if (activeTab) {
        const title = activeTab.getAttribute('title');
        const match = title.match(/([A-Za-z\u0430-\u044f]{3})\s(\d{1,2}),\s(202\d)/i);
        if (match) {
            const months = {
                'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'may': '05', 'jun': '06',
                'jul': '07', 'aug': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12',
                'янв': '01', 'фев': '02', 'мар': '03', 'апр': '04', 'май': '05', 'июн': '06',
                'июл': '07', 'авг': '08', 'сен': '09', 'окт': '10', 'ноя': '11', 'дек': '12'
            };
            const m = months[match[1].toLowerCase()];
            if (m) return `${match[3]}${m}${match[2].padStart(2, '0')}`;
        }
    }

    const urlMatch = window.location.href.match(/(202\d{5})/);
    if (urlMatch) return urlMatch[1];

    return null;
}

// ─── 1. Utilities ───

function showStatus(state, text = '') {
    let pill = document.getElementById('ibkr-bridge-status');
    const titleHeader = document.querySelector('h1[class*="title-"]');

    if (!pill) {
        pill = document.createElement('div');
        pill.id = 'ibkr-bridge-status';
    }

    if (titleHeader && pill.parentElement !== titleHeader.parentElement) {
        titleHeader.insertAdjacentElement('afterend', pill);
    } else if (!titleHeader && !pill.parentElement) {
        document.body.appendChild(pill);
    }

    pill.className = state;

    let msg = 'IBKR Bridge: ';
    if (state === 'loading') msg += 'Loading Matching...';
    else if (state === 'ready') msg += 'Ready';
    else if (state === 'error') msg += text || 'Error / Not Found';

    pill.innerHTML = `<span class="dot"></span> ${msg}`;

    if (state === 'ready') {
        setTimeout(() => { pill.style.opacity = '0.4'; }, CONFIG.STATUS_FADE_DELAY);
    } else {
        pill.style.opacity = '1';
    }
}

// ─── 2. Data Loading ───

async function fetchMapping(symbol, secType, date, exchange = '') {
    if (fetchInProgress) return;
    fetchInProgress = true;

    showStatus('loading');
    console.log(`IBKR Bridge: Requesting mapping ${symbol} (${secType}) ${date} on ${exchange}...`);
    try {
        const url = `${BRIDGE_URL}/get_mapping?symbol=${symbol}&type=${secType}&date=${date}&exchange=${exchange}`;
        const resp = await fetch(url);
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            const msg = err.error || resp.statusText || 'Not Found';
            console.warn(`IBKR Bridge: Mapping not found -`, msg);
            mappingData = null;
            showStatus('error', msg === 'Not Found' ? 'Symbol/Date Not Found' : msg);
        } else {
            mappingData = await resp.json();
            const strikes = Object.keys(mappingData);
            console.log(`IBKR Bridge: Got ${strikes.length} strikes for ${symbol} ${date}`);
            showStatus('ready');
        }
    } catch (e) {
        console.error('IBKR Bridge: Fetch error:', e.message);
        mappingData = null;
        showStatus('error', 'Bridge App Closed?');
    } finally {
        fetchInProgress = false;
    }
}

// ─── 3. Column Detection ───

function updateIndices() {
    const headers = document.querySelectorAll('th');
    let cAsk = -1, pAsk = -1, cBid = -1, pBid = -1, seenStrike = false;
    headers.forEach(h => {
        const t = h.innerText.trim();
        if (t === "Strike" || t === "Цена исполнения") seenStrike = true;

        // Helper to get index
        const getIdx = (el) => {
            let i = 0, sib = el;
            while ((sib = sib.previousElementSibling)) i++;
            return i;
        };

        if (t === "Ask" || t === "Аск") {
            if (!seenStrike) cAsk = getIdx(h); else pAsk = getIdx(h);
        }
        if (t === "Bid" || t === "Бид") {
            if (!seenStrike) cBid = getIdx(h); else pBid = getIdx(h);
        }
    });

    cachedCallAskIndex = cAsk;
    cachedPutAskIndex = pAsk;
    cachedCallBidIndex = cBid;
    cachedPutBidIndex = pBid;
}

function clearButtons() {
    const buttons = document.querySelectorAll('.ibkr-btn-link');
    buttons.forEach(btn => btn.remove());
    const cells = document.querySelectorAll('.ibkr-target');
    cells.forEach(c => {
        c.classList.remove('ibkr-target', 'ibkr-target-C', 'ibkr-target-P');
    });
    console.log('IBKR Bridge: Cleared all stale buttons.');
}

// ─── 4. Button Injection ───

function inject(row, conId, type, action) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL) {
        return;
    }

    // Both Buy and Sell now target the Ask column
    const idx = (type === 'C') ? cachedCallAskIndex : cachedPutAskIndex;

    if (idx === -1) return;
    const cells = row.querySelectorAll('td');
    if (idx >= cells.length) return;
    const cell = cells[idx];
    if (!cell) return;

    const btnClass = `ibkr-btn-${type}-${action}`;
    if (cell.querySelector(`.${btnClass}`)) return;

    if (!cell.classList.contains('ibkr-target')) {
        cell.classList.add('ibkr-target');
        cell.style.position = 'relative';
    }

    const a = document.createElement('a');
    a.className = `ibkr-btn-link ibkr-btn-${action} ${btnClass}`;
    a.title = `${action === 'BUY' ? 'Buy' : 'Sell'} ${type === 'C' ? 'Call' : 'Put'} to IBKR`;
    a.dataset.conId = conId;

    // Label: +C, -C, +P, -P
    a.innerText = (action === 'BUY' ? '+' : '-') + type;

    const openUrl = `${BRIDGE_URL}/open?conid=${conId}&action=${action}`;
    a.href = openUrl;
    a.target = '_blank';
    cell.appendChild(a);

    a.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        a.style.filter = "brightness(1.5)";
        console.log(`IBKR Bridge: Sending ${action} request: ${openUrl}`);

        fetch(openUrl)
            .then(async (resp) => {
                const text = await resp.text();
                if (resp.ok) {
                    setTimeout(() => a.style.filter = "none", 1000);
                } else {
                    throw new Error(text);
                }
            })
            .catch((err) => {
                console.error(`IBKR Bridge: Request failed:`, err);
                a.style.border = "1px solid yellow";
                setTimeout(() => a.style.border = "none", 2000);
            });
    };
}

// ─── 5. ConId Lookup ───

function findConId(strike, right) {
    if (!mappingData) return null;
    if (mappingData[strike] && mappingData[strike][right]) return mappingData[strike][right];
    const s2 = strike + ".0";
    if (mappingData[s2] && mappingData[s2][right]) return mappingData[s2][right];
    if (strike.endsWith('.0')) {
        const s3 = strike.slice(0, -2);
        if (mappingData[s3] && mappingData[s3][right]) return mappingData[s3][right];
    }
    return null;
}

// ─── 6. Scanner (TradingView) ───

let lastScanTime = 0;
async function scan() {
    const now = Date.now();
    if (now - lastScanTime < 1000) return;
    lastScanTime = now;

    const detected = detectSymbolFromURL();
    if (!detected) return;

    const date = detectDateFromTab();
    if (!date) return;

    if (detected.symbol !== currentSymbol || detected.secType !== currentSecType || date !== currentDate) {
        clearButtons();
        mappingData = null;
        currentSymbol = detected.symbol;
        currentSecType = detected.secType;
        currentDate = date;
        fetchMapping(currentSymbol, currentSecType, currentDate, detected.exchange);
        return;
    }

    if (!mappingData || fetchInProgress) return;
    updateIndices();

    const rows = document.querySelectorAll('tr[data-row-id]');
    rows.forEach(tr => {
        const strike = tr.dataset.rowId;
        if (strike) {
            const cc = findConId(strike, 'C');
            if (cc) {
                inject(tr, cc, 'C', 'BUY');
                inject(tr, cc, 'C', 'SELL');
            }
            const pp = findConId(strike, 'P');
            if (pp) {
                inject(tr, pp, 'P', 'BUY');
                inject(tr, pp, 'P', 'SELL');
            }
        }
    });
}

// ─── 6.5 Scanner (Universal Calculator) ───

function scanCalculator() {
    const activeTickerEl = Array.from(document.querySelectorAll('div, span')).find(el => el.textContent.includes('Актив:') || el.textContent.includes('Asset:'));
    let ticker = "UNKNOWN";
    if (activeTickerEl) {
        const text = activeTickerEl.closest('div').innerText;
        const match = text.match(/(Актив|Asset):\s*([A-Z0-9!^]+)/);
        if (match) ticker = match[2].trim();
    }

    const rows = document.querySelectorAll('div.items-center.text-sm.border.rounded-md.p-2');
    rows.forEach(row => {
        const typeCell = row.querySelector('div.flex.items-center.gap-1.text-left');
        if (!typeCell) return;

        const isPut = typeCell.innerText.includes('PUT');
        const isCall = typeCell.innerText.includes('CALL');
        if (!isPut && !isCall) return;

        const right = isCall ? 'C' : 'P';

        // Extract data from row using utility function
        const { expiry, strike, quantity, bid, ask } = extractRowData(row);

        if (ticker !== "UNKNOWN" && expiry && strike) {
            // Normalize ticker using utility function
            const { cleanTicker, secType } = normalizeTicker(ticker);

            const cleanStrike = parseFloat(strike).toString();

            const isBuyRow = typeCell.innerText.includes('Buy');
            const isSellRow = typeCell.innerText.includes('Sell');
            const action = isBuyRow ? 'BUY' : (isSellRow ? 'SELL' : null);

            if (action) {
                const match = findMatchingPosition(cleanTicker, secType, expiry, cleanStrike, right, action);

                // Признак наличия цены — нужен, чтобы пересоздать кнопку при появлении Bid/Ask
                // (или при их пропадании). Иначе disabled-кнопка зависнет навсегда после первого скана.
                if (match) {
                    const closeAction = match.side === 'LONG' ? 'SELL' : 'BUY';
                    const closePrice = closeAction === 'BUY' ? ask : bid;
                    const priceAvail = closePrice !== null ? '1' : '0';
                    const existingClose = typeCell.querySelector('.ibkr-btn-close-rendered');
                    const needsUpdate = !existingClose
                        || existingClose.dataset.closeQty != match.quantity
                        || existingClose.dataset.priceAvail !== priceAvail;
                    if (needsUpdate) {
                        typeCell.querySelectorAll('.ibkr-btn-link').forEach(btn => btn.remove());
                        injectCalculatorButton(typeCell, cleanTicker, expiry, cleanStrike, right, action, secType, match.quantity, { quantity: match.quantity, side: match.side });
                    }
                } else {
                    const btnSelector = `.ibkr-btn-link.ibkr-btn-${action}`;
                    const existingBtn = typeCell.querySelector(btnSelector);
                    const limitPrice = action === 'BUY' ? ask : bid;
                    const priceAvail = limitPrice !== null ? '1' : '0';
                    const needsUpdate = !existingBtn
                        || existingBtn.dataset.quantity != quantity
                        || existingBtn.dataset.priceAvail !== priceAvail;
                    if (needsUpdate) {
                        typeCell.querySelectorAll('.ibkr-btn-link').forEach(btn => btn.remove());
                        injectCalculatorButton(typeCell, cleanTicker, expiry, cleanStrike, right, action, secType, quantity);
                    }
                }
            }
        }
    });
}

// Помечаем кнопку как disabled (нет Bid/Ask в строке калькулятора).
// ЗАЧЕМ: без цены LIMIT-ордер собрать нельзя — фронт не должен отправлять запрос на bridge.
function markButtonDisabled(a, reason) {
    a.classList.add('ibkr-btn-disabled');
    a.style.pointerEvents = 'none';
    a.style.opacity = '0.4';
    a.title = reason;
    a.removeAttribute('href');
}

// Возвращает цену для action (BUY → ask, SELL → bid). null если цена недоступна.
function pickLimitPrice(rowData, action) {
    if (action === 'BUY') return rowData.ask;
    if (action === 'SELL') return rowData.bid;
    return null;
}

function injectCalculatorButton(container, symbol, expiry, strike, right, action, secType = 'STK', quantity = 1, closeData = null) {
    const a = document.createElement('a');
    const row = container.closest('div.items-center.text-sm.border.rounded-md.p-2');
    const rowData = row ? extractRowData(row) : { bid: null, ask: null, quantity: 1 };

    if (closeData) {
        const closeAction = closeData.side === 'LONG' ? 'SELL' : 'BUY';
        a.className = `ibkr-btn-link ibkr-btn-calc ibkr-btn-${right} ibkr-btn-CLOSE ibkr-btn-close-rendered`;
        a.innerText = '−';
        a.title = `Close ${right === 'C' ? 'Call' : 'Put'} position`;
        a.dataset.closeQty = closeData.quantity;
        a.dataset.quantity = closeData.quantity;

        const price = pickLimitPrice(rowData, closeAction);
        a.dataset.priceAvail = price !== null ? '1' : '0';
        if (price === null) {
            markButtonDisabled(a, 'Без цены отправить нельзя — нужны Bid/Ask в калькуляторе');
        } else {
            a.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                const orderUrl = `${BRIDGE_URL}/open?symbol=${symbol}&expiry=${expiry}&strike=${strike}&right=${right}&action=${closeAction}&secType=${secType}&quantity=${closeData.quantity}&price=${price}`;
                showButtonFeedback(a, true);
                fetch(orderUrl)
                    .then(r => { if (!r.ok) showButtonFeedback(a, false); })
                    .catch(() => { showButtonFeedback(a, false); });
            };
        }
    } else {
        a.className = `ibkr-btn-link ibkr-btn-calc ibkr-btn-${right} ibkr-btn-${action}`;
        a.title = `${action === 'BUY' ? 'Buy' : 'Sell'} ${right === 'C' ? 'Call' : 'Put'} to IBKR`;
        a.dataset.quantity = quantity;
        a.innerText = (action === 'BUY' ? '+' : '-') + right;

        const price = pickLimitPrice(rowData, action);
        a.dataset.priceAvail = price !== null ? '1' : '0';
        if (price === null) {
            markButtonDisabled(a, 'Без цены отправить нельзя — нужны Bid/Ask в калькуляторе');
        } else {
            a.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                // Цену и количество перечитываем непосредственно при клике — пользователь мог их поменять.
                const liveRow = container.closest('div.items-center.text-sm.border.rounded-md.p-2');
                const liveData = liveRow ? extractRowData(liveRow) : rowData;
                const livePrice = pickLimitPrice(liveData, action);
                if (livePrice === null) {
                    showButtonFeedback(a, false);
                    return;
                }
                const orderUrl = `${BRIDGE_URL}/open?symbol=${symbol}&expiry=${expiry}&strike=${strike}&right=${right}&action=${action}&secType=${secType}&quantity=${liveData.quantity}&price=${livePrice}`;
                showButtonFeedback(a, true);
                fetch(orderUrl)
                    .then(r => { if (!r.ok) showButtonFeedback(a, false); })
                    .catch(() => { showButtonFeedback(a, false); });
            };
        }
    }

    container.appendChild(a);
}

// ─── 6.6 Scanner (Stock positions in calculator) ───
//
// Сканирует строки базового актива в BaseAssetPositions, помеченные [data-stock-row="1"].
// Логика — симметрична опционам:
//   • Если в TWS уже есть позиция по тикеру в той же стороне (LONG/SHORT) → серая «−»
//     (staged-ордер на закрытие: SELL для LONG, BUY для SHORT).
//   • Если позиции в TWS нет → кнопка открытия: зелёный «+» для LONG (BUY),
//     красный «−» для SHORT (SELL-short).
// Цену в URL не передаём — backend сам берёт live bid/ask из TWS в момент запроса.
function scanStockPositions() {
    const rows = document.querySelectorAll('[data-stock-row="1"]');
    rows.forEach(row => {
        const ticker = (row.dataset.stockTicker || '').trim();
        const quantity = parseInt(row.dataset.stockQuantity, 10);
        const side = (row.dataset.stockSide || '').trim();
        const priceRaw = row.dataset.stockPrice;
        const price = parseFloat(priceRaw);
        const hasPrice = !isNaN(price) && price > 0;
        if (!ticker || !quantity || quantity <= 0 || !side) return;

        const slot = row.querySelector('.ibkr-stock-close-slot');
        if (!slot) return;

        const match = findStockPosition(ticker, side);
        const mode = match ? 'close' : 'open';
        // Метка включает режим, цену и hasPrice — чтобы пересоздать кнопку при их изменении.
        const desiredMark = `${ticker}|${side}|${quantity}|${mode}|${priceRaw || ''}|${hasPrice ? '1' : '0'}`;
        if (slot.dataset.rendered === desiredMark) return;

        slot.innerHTML = '';
        slot.dataset.rendered = desiredMark;

        // Action и визуал зависят от режима:
        //   close: LONG→SELL (закрыть лонг), SHORT→BUY (закрыть шорт), серая «−».
        //   open : LONG→BUY  (открыть лонг), SHORT→SELL (открыть шорт), зелёный «+» / красный «−».
        let action, label, classes, title;
        if (mode === 'close') {
            action = side === 'LONG' ? 'SELL' : 'BUY';
            label = '−';
            classes = 'ibkr-btn-link ibkr-btn-calc ibkr-btn-CLOSE ibkr-btn-CLOSE-STK ibkr-btn-close-rendered';
            title = `Close ${side} ${ticker} (${quantity}) @ ${price} — staged LMT в TWS`;
        } else {
            if (side === 'LONG') {
                action = 'BUY';
                label = '+';
                classes = 'ibkr-btn-link ibkr-btn-calc ibkr-btn-BUY ibkr-btn-OPEN-STK';
            } else {
                action = 'SELL';
                label = '−';
                classes = 'ibkr-btn-link ibkr-btn-calc ibkr-btn-SELL ibkr-btn-OPEN-STK';
            }
            title = `Open ${side} ${ticker} (${quantity}) @ ${price} — staged LMT в TWS`;
        }

        const a = document.createElement('a');
        a.className = classes;
        a.innerText = label;
        a.title = title;
        a.dataset.qty = quantity;
        a.href = '#';

        if (!hasPrice) {
            // Без цены LIMIT-ордер собрать нельзя — гасим кнопку (клик не отправит запрос).
            markButtonDisabled(a, 'Укажите цену в строке базового актива — без неё ордер не отправляется');
        } else {
            a.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Перечитываем количество и цену на момент клика — пользователь мог их поменять.
                const liveQty = parseInt(row.dataset.stockQuantity, 10) || quantity;
                const livePrice = parseFloat(row.dataset.stockPrice);
                if (isNaN(livePrice) || livePrice <= 0) {
                    showButtonFeedback(a, false);
                    return;
                }
                const orderUrl = `${BRIDGE_URL}/open?symbol=${encodeURIComponent(ticker)}&action=${action}&secType=STK&quantity=${liveQty}&price=${livePrice}`;
                console.log(`IBKR Bridge: STK ${mode} ${action} ${liveQty} ${ticker} @ ${livePrice}`);
                showButtonFeedback(a, true);
                fetch(orderUrl)
                    .then(async (resp) => {
                        if (!resp.ok) {
                            const text = await resp.text();
                            console.error(`IBKR Bridge: STK ${mode} failed:`, text);
                            showButtonFeedback(a, false);
                        }
                    })
                    .catch((err) => {
                        console.error(`IBKR Bridge: STK ${mode} error:`, err);
                        showButtonFeedback(a, false);
                    });
            };
        }

        slot.appendChild(a);
    });
}

function startEngine() {
    const isTV = window.location.href.includes('/options/');
    const isCalc = window.location.href.includes('beta.optioner.online/tools/universal-calculator');
    if (isTV) {
        setInterval(scan, CONFIG.SCAN_INTERVAL_TRADINGVIEW);
    } else if (isCalc) {
        setInterval(scanCalculator, CONFIG.SCAN_INTERVAL_CALCULATOR);
        setInterval(scanStockPositions, CONFIG.SCAN_INTERVAL_CALCULATOR);
        fetchPositions();
        setInterval(fetchPositions, CONFIG.POSITIONS_POLL_INTERVAL);
    }
}

startEngine();
