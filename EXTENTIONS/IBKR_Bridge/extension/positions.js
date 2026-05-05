// positions.js - Open positions state and matching logic for close buttons

let openPositions = [];
let positionsLastSig = '';
let positionsLastError = null;

function positionsSignature(arr) {
    return arr
        .slice()
        .sort((a, b) => {
            const ka = `${a.symbol}|${a.secType}|${a.expiry}|${a.strike}|${a.right}|${a.side}`;
            const kb = `${b.symbol}|${b.secType}|${b.expiry}|${b.strike}|${b.right}|${b.side}`;
            return ka < kb ? -1 : ka > kb ? 1 : 0;
        })
        .map(p => `${p.symbol}|${p.secType}|${p.expiry}|${p.strike}|${p.right}|${p.side}|${p.quantity}`)
        .join(';');
}

async function fetchPositions() {
    try {
        const resp = await fetch(`${CONFIG.BRIDGE_URL}/positions`);
        if (!resp.ok) {
            positionsLastError = `positions ${resp.status}`;
            openPositions = [];
        } else {
            openPositions = await resp.json();
            positionsLastError = null;
        }
    } catch (e) {
        positionsLastError = 'positions fetch failed';
        openPositions = [];
    }
    positionsLastSig = positionsSignature(openPositions);
}

function normSym(s) {
    return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normExpiry(e) {
    if (!e) return '';
    const s = String(e).replace(/\D/g, '');
    return s.length === 8 ? s : s;
}

function findMatchingPosition(symbol, secType, expiry, strike, right, action) {
    const sym = normSym(symbol);
    // Map row secType (STK/FUT) to IB position secType (OPT/FOP)
    const ibSecType = secType === 'FUT' ? 'FOP' : 'OPT';
    const exp = normExpiry(expiry);
    const str = parseFloat(strike).toString();
    const side = action === 'BUY' ? 'LONG' : 'SHORT';

    for (const p of openPositions) {
        if (
            normSym(p.symbol) === sym &&
            p.secType === ibSecType &&
            normExpiry(p.expiry) === exp &&
            parseFloat(p.strike).toString() === str &&
            p.right === right &&
            p.side === side
        ) {
            return p;
        }
    }
    return null;
}
