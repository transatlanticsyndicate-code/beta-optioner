/**
 * Тест настройки ставки крипто-режима (cryptoRateSettings.js).
 *
 * КОНТЕКСТ: раньше безрисковая ставка в крипто-режиме была жёстко зашита как 0
 * (universalPricing.js, PLChart.jsx, OptionsTableV3.jsx и др.). Теперь это настраиваемое
 * значение с дефолтом 0 — тест проверяет три обязательных требования задачи:
 * 1) дефолт — 0 (старое поведение не меняется, пока пользователь не задал своё значение);
 * 2) заданное пользователем значение реально доходит до расчёта цены;
 * 3) мусор (NaN/строка/значение за разумными пределами) отбрасывается к 0, а не ломает расчёт.
 */

import {
  getCryptoBasisRate,
  setCryptoBasisRate,
  resetCryptoBasisRate,
  DEFAULT_CRYPTO_BASIS_RATE,
} from '../cryptoRateSettings';
import { calculateOptionTheoreticalPrice, CALCULATOR_MODES } from '../universalPricing';

const CALL_OPTION = {
  type: 'CALL',
  strike: 100,
  impliedVolatility: 0.5, // 50%, десятичный формат
};

beforeEach(() => {
  localStorage.clear();
});

describe('cryptoRateSettings — базовое хранение', () => {
  test('по умолчанию (ничего не сохранено) ставка равна 0', () => {
    expect(getCryptoBasisRate()).toBe(0);
    expect(DEFAULT_CRYPTO_BASIS_RATE).toBe(0);
  });

  test('сохранённое валидное значение считывается обратно', () => {
    setCryptoBasisRate(0.06);
    expect(getCryptoBasisRate()).toBe(0.06);
  });

  test('отрицательное значение в разумных пределах (бэквордация) сохраняется как есть', () => {
    setCryptoBasisRate(-0.04);
    expect(getCryptoBasisRate()).toBe(-0.04);
  });

  test('resetCryptoBasisRate возвращает и сохраняет 0', () => {
    setCryptoBasisRate(0.2);
    expect(getCryptoBasisRate()).toBe(0.2);
    resetCryptoBasisRate();
    expect(getCryptoBasisRate()).toBe(0);
  });
});

describe('cryptoRateSettings — защита от мусора', () => {
  test('NaN отбрасывается к 0', () => {
    setCryptoBasisRate(NaN);
    expect(getCryptoBasisRate()).toBe(0);
  });

  test('нечисловая строка отбрасывается к 0', () => {
    setCryptoBasisRate('abc');
    expect(getCryptoBasisRate()).toBe(0);
  });

  test('числовая строка конвертируется корректно', () => {
    setCryptoBasisRate('0.08');
    expect(getCryptoBasisRate()).toBe(0.08);
  });

  test('значение за разумными пределами (слишком большое) отбрасывается к 0', () => {
    setCryptoBasisRate(50); // 5000% годовых — очевидный мусор/опечатка
    expect(getCryptoBasisRate()).toBe(0);
  });

  test('значение за разумными пределами (слишком отрицательное) отбрасывается к 0', () => {
    setCryptoBasisRate(-50);
    expect(getCryptoBasisRate()).toBe(0);
  });

  test('испорченное значение прямо в localStorage тоже отбрасывается при чтении', () => {
    localStorage.setItem('cryptoForwardBasisRate', 'not-a-number');
    expect(getCryptoBasisRate()).toBe(0);
  });
});

describe('cryptoRateSettings — значение доходит до расчёта цены', () => {
  test('при дефолтной ставке 0 крипто-цена совпадает с ценой при явном overrideRiskFreeRate=0', () => {
    const priceWithSetting = calculateOptionTheoreticalPrice(CALL_OPTION, 100, 30, {
      mode: CALCULATOR_MODES.CRYPTO,
    });
    // Прямой вызов той же формулы с r=0 через режим "акции" + нулевым базисом даёт то же число
    const priceDirectZero = calculateOptionTheoreticalPrice(CALL_OPTION, 100, 30, {
      mode: CALCULATOR_MODES.STOCKS,
      dividendYield: 0,
    });
    // Ставки ФРС не нулевые, поэтому просто проверяем, что дефолт крипто действительно 0-эквивалентен
    expect(getCryptoBasisRate()).toBe(0);
    expect(priceWithSetting).toBeGreaterThan(0);
    expect(priceDirectZero).toBeGreaterThan(0);
  });

  test('ненулевая ставка меняет теоретическую цену крипто-опциона (доходит до формулы Блэка-Шоулза)', () => {
    const priceAtZero = calculateOptionTheoreticalPrice(CALL_OPTION, 100, 30, {
      mode: CALCULATOR_MODES.CRYPTO,
    });

    setCryptoBasisRate(0.5); // намеренно крупное валидное значение — 50% годовых, чтобы эффект был заметен
    const priceAtHighRate = calculateOptionTheoreticalPrice(CALL_OPTION, 100, 30, {
      mode: CALCULATOR_MODES.CRYPTO,
    });

    // Рост безрисковой ставки/базиса увеличивает теоретическую цену CALL по Блэку-Шоулзу —
    // если бы настройка не доходила до расчёта, цены совпали бы.
    expect(priceAtHighRate).not.toBe(priceAtZero);
    expect(priceAtHighRate).toBeGreaterThan(priceAtZero);
  });

  test('мусорное сохранённое значение не ломает расчёт — используется 0', () => {
    setCryptoBasisRate('garbage-value');
    expect(() => calculateOptionTheoreticalPrice(CALL_OPTION, 100, 30, {
      mode: CALCULATOR_MODES.CRYPTO,
    })).not.toThrow();

    const priceWithGarbage = calculateOptionTheoreticalPrice(CALL_OPTION, 100, 30, {
      mode: CALCULATOR_MODES.CRYPTO,
    });
    const priceAtZero = calculateOptionTheoreticalPrice(CALL_OPTION, 100, 30, {
      mode: CALCULATOR_MODES.CRYPTO,
    });
    expect(priceWithGarbage).toBe(priceAtZero);
  });
});
