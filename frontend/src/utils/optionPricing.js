const OPTION_CONTRACT_MULTIPLIER = 100;

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getSafeDaysToExpiration = (option = {}) => {
  if (!option || !option.date) {
    return 30;
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expirationDate = new Date(option.date);
    expirationDate.setHours(0, 0, 0, 0);
    const diffInDays = Math.ceil((expirationDate - today) / (1000 * 60 * 60 * 24));
    return Math.max(1, diffInDays);
  } catch (error) {
    console.warn('Failed to parse expiration date for option', option, error);
    return 30;
  }
};

export const calculateIntrinsicValue = (option = {}, price = 0) => {
  const strike = toNumber(option.strike);
  if (!option || !option.type) return 0;

  if (option.type === 'CALL') {
    return Math.max(0, price - strike);
  }

  if (option.type === 'PUT') {
    return Math.max(0, strike - price);
  }

  return 0;
};

export const calculateOptionValueWithTimeDecay = (
  option = {},
  price = 0,
  currentPrice = 0,
  daysRemaining = 0
) => {
  const strikeValue = toNumber(option.strike);
  const premiumValue = Math.max(0, toNumber(option.premium));
  const safeMaxDays = getSafeDaysToExpiration(option);
  const clampedDaysRemaining = Math.max(0, Math.min(daysRemaining, safeMaxDays));
  const timeDecayFactor = safeMaxDays === 0 ? 0 : clampedDaysRemaining / safeMaxDays;

  const intrinsicValue = calculateIntrinsicValue(option, price);

  if (clampedDaysRemaining <= 0) {
    return intrinsicValue;
  }

  const denominator = Math.abs(strikeValue) > 0 ? Math.abs(strikeValue) : Math.max(1, currentPrice);
  const moneyness = denominator === 0 ? 0 : Math.abs(price - strikeValue) / denominator;
  const timeValue = premiumValue * Math.sqrt(timeDecayFactor) * Math.exp(-moneyness * 2);

  return intrinsicValue + timeValue;
};

const getQuantity = (option = {}) => {
  const qty = toNumber(option.quantity);
  return Math.abs(qty);
};

const getMultiplier = (option = {}) => {
  const customMultiplier = toNumber(option.contractSize, OPTION_CONTRACT_MULTIPLIER);
  return customMultiplier > 0 ? customMultiplier : OPTION_CONTRACT_MULTIPLIER;
};

const isBuyAction = (option = {}) => {
  return (option.action || 'Buy').toLowerCase() === 'buy';
};

export const calculateOptionPLValue = (
  option = {},
  price = 0,
  currentPrice = 0,
  daysRemaining = 0
) => {
  const quantity = getQuantity(option);
  if (!quantity) return 0;

  const optionValue = calculateOptionValueWithTimeDecay(
    option,
    price,
    currentPrice,
    daysRemaining
  );
  const premiumValue = Math.max(0, toNumber(option.premium));
  const multiplier = getMultiplier(option);

  if (isBuyAction(option)) {
    return (optionValue - premiumValue) * quantity * multiplier;
  }

  return (premiumValue - optionValue) * quantity * multiplier;
};

export const calculateOptionExpirationPLValue = (option = {}, price = 0) => {
  const quantity = getQuantity(option);
  if (!quantity) return 0;

  const intrinsicValue = calculateIntrinsicValue(option, price);
  const premiumValue = Math.max(0, toNumber(option.premium));
  const multiplier = getMultiplier(option);

  if (isBuyAction(option)) {
    return (intrinsicValue - premiumValue) * quantity * multiplier;
  }

  return (premiumValue - intrinsicValue) * quantity * multiplier;
};
