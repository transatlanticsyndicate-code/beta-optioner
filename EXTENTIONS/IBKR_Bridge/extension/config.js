// Configuration constants for IBKR Bridge
const CONFIG = {
    // Server connection
    BRIDGE_URL: 'http://localhost:5001',
    
    // Scanning intervals (ms)
    SCAN_INTERVAL_TRADINGVIEW: 1000,
    SCAN_INTERVAL_CALCULATOR: 2000,
    POSITIONS_POLL_INTERVAL: 5000,
    
    // Data extraction thresholds
    STRIKE_MIN_VALUE: 10,           // Strikes are typically > 10 or have decimals
    QUANTITY_MAX_VALUE: 10000,      // Maximum allowed quantity
    QUANTITY_MIN_VALUE: 1,          // Minimum allowed quantity
    
    // Status display
    STATUS_FADE_DELAY: 3000,        // ms before status pill fades
    
    // Button feedback
    BUTTON_HIGHLIGHT_DURATION: 1000, // ms
    BUTTON_ERROR_DURATION: 2000      // ms
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
