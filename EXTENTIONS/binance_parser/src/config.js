/**
 * Конфигурация URL для расширения Binance → Optioner Bridge
 * ЗАЧЕМ: Позволяет переключаться между production и localhost для тестирования
 */

const ENVIRONMENTS = {
  production: {
    name: 'Production',
    baseUrl: 'https://beta.optioner.online',
    apiUrl: 'https://db.optioner.online'
  },
  localhost: {
    name: 'Localhost',
    baseUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:8000'
  }
};

async function getEnvironment() {
  try {
    const result = await chrome.storage.local.get(['selectedEnvironment']);
    return result.selectedEnvironment || 'production';
  } catch (e) {
    return 'production';
  }
}

async function setEnvironment(env) {
  if (!ENVIRONMENTS[env]) return;
  await chrome.storage.local.set({ selectedEnvironment: env });
}

async function getBaseUrl() {
  const env = await getEnvironment();
  return ENVIRONMENTS[env].baseUrl;
}

async function getApiUrl() {
  const env = await getEnvironment();
  return ENVIRONMENTS[env].apiUrl;
}

async function getCalculatorUrl(contractCode, underlyingPrice) {
  const baseUrl = await getBaseUrl();
  let url = `${baseUrl}/tools/universal-calculator?contract=${contractCode}`;
  if (underlyingPrice) {
    url += `&price=${underlyingPrice}`;
  }
  return url;
}

async function getCalculatorUrlPatterns() {
  const baseUrl = await getBaseUrl();
  return [`${baseUrl}/tools/universal-calculator*`];
}

function isCalculatorUrl(url) {
  if (!url) return false;
  return url.includes('beta.optioner.online') || url.includes('localhost:3000');
}

window.BinanceExtConfig = {
  ENVIRONMENTS,
  getEnvironment,
  setEnvironment,
  getBaseUrl,
  getApiUrl,
  getCalculatorUrl,
  getCalculatorUrlPatterns,
  isCalculatorUrl
};

console.log('[Binance] config.js загружен');
