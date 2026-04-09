/**
 * ext2 — Конфигурация
 */

const EXT2_PREFIX = 'ext2';
const STORAGE_KEY = 'tvc_positions';  // Совместимость с калькулятором optioner.online
const EXCHANGES_KEY = 'tvc_exchanges';  // Биржа для каждого тикера → передаётся в калькулятор
const LOG_TAG = '[EXT2]';

const ENVIRONMENTS = {
  production: {
    baseUrl: 'https://beta.optioner.online',
    apiUrl: 'https://db.optioner.online'
  },
  localhost: {
    baseUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:8000'
  }
};

async function getEnvironment() {
  try {
    const result = await chrome.storage.local.get(['ext2_environment']);
    return result.ext2_environment || 'production';
  } catch (e) {
    return 'production';
  }
}

async function getBaseUrl() {
  const env = await getEnvironment();
  return ENVIRONMENTS[env].baseUrl;
}

async function getCalculatorUrl(contractCode, underlyingPrice) {
  const baseUrl = await getBaseUrl();
  let url = `${baseUrl}/tools/universal-calculator`;
  if (contractCode) url += `?contract=${contractCode}`;
  if (underlyingPrice) url += `${contractCode ? '&' : '?'}price=${underlyingPrice}`;
  return url;
}

function isCalculatorUrl(url) {
  if (!url) return false;
  return url.includes('beta.optioner.online') || url.includes('localhost:3000');
}

