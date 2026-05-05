// Utility functions for IBKR Bridge

/**
 * Extracts data from calculator row inputs
 * @param {HTMLElement} row - The calculator row element
 * @returns {Object} Object containing expiry, strike, quantity, bid, ask
 */
function extractRowData(row) {
    const inputs = Array.from(row.querySelectorAll('input'));

    // Find expiry input (format: DD.MM.YY)
    const expiryInput = inputs.find(i => i.value.match(/\d{2}\.\d{2}\.\d{2}/));
    let expiry = "";
    if (expiryInput) {
        const m = expiryInput.value.match(/(\d{2})\.(\d{2})\.(\d{2})/);
        if (m) expiry = `20${m[3]}${m[2]}${m[1]}`;
    }

    // Find strike input (typically > 10 or has decimals)
    const strikeInput = inputs.find(i => {
        if (i === expiryInput) return false;
        const val = i.value.trim();
        if (!val || isNaN(parseFloat(val))) return false;
        const num = parseFloat(val);
        return num > CONFIG.STRIKE_MIN_VALUE || val.includes('.');
    });
    const strike = strikeInput ? strikeInput.value : "";

    // Find quantity input (whole number between min and max)
    const quantityInput = inputs.find(i => {
        if (i === expiryInput || i === strikeInput) return false;
        const val = i.value.trim();
        if (!val) return false;
        const num = parseInt(val);
        if (isNaN(num)) return false;
        return num >= CONFIG.QUANTITY_MIN_VALUE &&
               num <= CONFIG.QUANTITY_MAX_VALUE &&
               val.indexOf('.') === -1;
    });
    const quantity = quantityInput ? parseInt(quantityInput.value) || 1 : 1;

    // Bid/Ask берём из data-атрибутов калькулятора (data-bid / data-ask).
    // ЗАЧЕМ: для LIMIT-ордера нужна цена, а в калькуляторе нет стабильного селектора, кроме data-attr.
    const parsePriceAttr = (selector, attr) => {
        try {
            const el = row.querySelector(selector);
            if (!el) return null;
            const raw = el.dataset[attr];
            if (raw === undefined || raw === null || raw === '') return null;
            const num = parseFloat(raw);
            if (isNaN(num) || num <= 0) return null;
            return num;
        } catch (e) {
            return null;
        }
    };
    const bid = parsePriceAttr('[data-field="bid"]', 'bid');
    const ask = parsePriceAttr('[data-field="ask"]', 'ask');

    return { expiry, strike, quantity, bid, ask, expiryInput, strikeInput, quantityInput };
}

/**
 * Normalizes ticker symbol and detects security type
 * @param {string} ticker - Raw ticker symbol
 * @returns {Object} Object containing cleanTicker and secType
 */
function normalizeTicker(ticker) {
    let cleanTicker = ticker.trim().toUpperCase();
    let secType = 'STK';
    
    // Detect futures tickers like ESU26, GCM25, CLZ26, NQH26
    const futMatch = cleanTicker.match(/^([A-Z]{2,4})[FGHJKMNQUVXZ]\d{2,4}$/);
    if (futMatch) {
        cleanTicker = futMatch[1];
        secType = 'FUT';
    }
    
    return { cleanTicker, secType };
}

/**
 * Shows button feedback animation
 * @param {HTMLElement} button - Button element
 * @param {boolean} success - Whether operation was successful
 */
function showButtonFeedback(button, success = true) {
    if (success) {
        button.style.filter = "brightness(1.5)";
        setTimeout(() => button.style.filter = "none", CONFIG.BUTTON_HIGHLIGHT_DURATION);
    } else {
        button.style.border = "1px solid yellow";
        setTimeout(() => button.style.border = "none", CONFIG.BUTTON_ERROR_DURATION);
    }
}
