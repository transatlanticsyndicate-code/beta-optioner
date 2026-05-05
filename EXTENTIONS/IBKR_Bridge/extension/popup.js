const BRIDGE_URL = CONFIG.BRIDGE_URL;

// Load current mode
async function loadMode() {
    try {
        const response = await fetch(`${BRIDGE_URL}/get_mode`);
        const data = await response.json();
        const mode = data.mode || 'demo';
        updateUI(mode);
    } catch (e) {
        console.error('Failed to load mode:', e);
        updateUI('demo');
    }
}

// Set mode
async function setMode(mode) {
    try {
        const response = await fetch(`${BRIDGE_URL}/set_mode?mode=${mode}`);
        if (response.ok) {
            updateUI(mode);
        }
    } catch (e) {
        console.error('Failed to set mode:', e);
        alert('Failed to connect to IBKR Bridge. Make sure the server is running.');
    }
}

// Update UI
function updateUI(mode) {
    // Update buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.mode === mode) {
            btn.classList.add('active');
        }
    });
    
    // Update status
    const status = document.getElementById('status');
    if (mode === 'live') {
        status.textContent = '⚠️ LIVE MODE - Real money trading!';
        status.className = 'status live';
    } else {
        status.textContent = '📝 DEMO MODE - Paper trading';
        status.className = 'status demo';
    }
    
    // Save to storage
    chrome.storage.local.set({ accountMode: mode });
}

// Event listeners
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        setMode(mode);
    });
});

// Load on startup
loadMode();
