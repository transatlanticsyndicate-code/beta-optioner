import { shouldPersistExtensionRefresh, pickPersistablePatch, applyPersistablePatch } from '../extensionRefreshPolicy';

// Гейт автосейва в БД/localStorage после обновления от расширения.
// ЗАЧЕМ: раньше эффект пересохранения (UniversalOptionsCalculator.jsx) проверял
// только needExtRefreshSaveRef/loadedConfigId и полностью гасил сохранение для
// зафиксированных (isLocked) позиций — из-за этого обновлённая расширением
// рыночная IV/цена БА не переживала перезагрузку страницы у заказчика (все 50
// сделок зафиксированы). Предикат теперь возвращает РЕЖИМ сохранения
// ('full' | 'market-only' | 'skip'), а не булево, и покрывается тестами без
// рендера компонента.
describe('shouldPersistExtensionRefresh (гейт+режим автосейва)', () => {
  test('нет флага "нужно пересохранить" → skip', () => {
    expect(shouldPersistExtensionRefresh({
      hasPendingFlag: false, loadedConfigId: 'cfg-1', isLocked: false, isEditMode: false,
    })).toBe('skip');
  });

  test('нет loadedConfigId → skip', () => {
    expect(shouldPersistExtensionRefresh({
      hasPendingFlag: true, loadedConfigId: null, isLocked: false, isEditMode: false,
    })).toBe('skip');
  });

  test('режим редактирования (isEditMode) → skip', () => {
    expect(shouldPersistExtensionRefresh({
      hasPendingFlag: true, loadedConfigId: 'cfg-1', isLocked: false, isEditMode: true,
    })).toBe('skip');
  });

  test('режим редактирования побеждает даже если сделка зафиксирована → skip', () => {
    expect(shouldPersistExtensionRefresh({
      hasPendingFlag: true, loadedConfigId: 'cfg-1', isLocked: true, isEditMode: true,
    })).toBe('skip');
  });

  test('зафиксированная сделка (isLocked) → market-only', () => {
    expect(shouldPersistExtensionRefresh({
      hasPendingFlag: true, loadedConfigId: 'cfg-1', isLocked: true, isEditMode: false,
    })).toBe('market-only');
  });

  test('обычная сделка (не залочена, не редактируется) → full', () => {
    expect(shouldPersistExtensionRefresh({
      hasPendingFlag: true, loadedConfigId: 'cfg-1', isLocked: false, isEditMode: false,
    })).toBe('full');
  });
});

// Отбор полей, разрешённых к сохранению в узком режиме.
describe('pickPersistablePatch (отбор полей для сохранения)', () => {
  const options = [
    {
      id: 'leg-1',
      impliedVolatility: 54.62,
      ivUpdatedFromExtension: true,
      ivUpdatedAt: '2026-07-29T10:00:00.000Z',
      manualIvOverride: 42,
      manualIvOverrideDate: '2026-07-01',
      customAsk: 1.23,
      customBid: 1.1,
      isAskModified: true,
      actualPLEntry: 100,
      actualPLCurrent: 120,
      startSnapshot: { impliedVolatility: 40 },
      quantity: 3,
      strike: 150,
      date: '2026-09-19',
    },
    {
      id: 'leg-2',
      impliedVolatility: 33.1,
      ivUpdatedFromExtension: true,
      ivUpdatedAt: '2026-07-29T10:00:00.000Z',
    },
  ];

  test('mode full → патч содержит currentPrice и ноги как есть (снимок формы)', () => {
    const patch = pickPersistablePatch({ mode: 'full', currentPrice: 101.5, options });
    expect(patch.currentPrice).toBe(101.5);
    expect(patch.options).toBe(options);
  });

  test('mode market-only → патч ноги содержит ТОЛЬКО разрешённые поля', () => {
    const patch = pickPersistablePatch({ mode: 'market-only', currentPrice: 101.5, options });
    expect(patch.currentPrice).toBe(101.5);
    expect(patch.options).toHaveLength(2);

    const leg1 = patch.options.find((o) => o.id === 'leg-1');
    expect(leg1).toEqual({
      id: 'leg-1',
      impliedVolatility: 54.62,
      ivUpdatedFromExtension: true,
      ivUpdatedAt: '2026-07-29T10:00:00.000Z',
    });

    // Запрещённые поля не должны просочиться в патч ни в каком виде
    expect(leg1).not.toHaveProperty('manualIvOverride');
    expect(leg1).not.toHaveProperty('manualIvOverrideDate');
    expect(leg1).not.toHaveProperty('customAsk');
    expect(leg1).not.toHaveProperty('customBid');
    expect(leg1).not.toHaveProperty('isAskModified');
    expect(leg1).not.toHaveProperty('actualPLEntry');
    expect(leg1).not.toHaveProperty('actualPLCurrent');
    expect(leg1).not.toHaveProperty('startSnapshot');
    expect(leg1).not.toHaveProperty('quantity');
    expect(leg1).not.toHaveProperty('strike');
    expect(leg1).not.toHaveProperty('date');
  });

  test('mode market-only, options не массив → пустой список ног, без падения', () => {
    const patch = pickPersistablePatch({ mode: 'market-only', currentPrice: 100, options: null });
    expect(patch).toEqual({ currentPrice: 100, options: [] });
  });
});

// Слияние узкого патча с состоянием, уже лежащим в БД/localStorage.
describe('applyPersistablePatch (слияние узкого патча с сохранённым состоянием)', () => {
  const baseState = {
    selectedTicker: 'AAPL',
    currentPrice: 200,
    positions: ['pos-stub'],
    options: [
      {
        id: 'leg-1',
        impliedVolatility: 40,
        ivUpdatedFromExtension: false,
        ivUpdatedAt: null,
        manualIvOverride: 42,
        manualIvOverrideDate: '2026-07-01',
        customAsk: 1.23,
        actualPLEntry: 100,
        startSnapshot: { impliedVolatility: 40 },
        quantity: 3,
        strike: 150,
        date: '2026-09-19',
      },
      {
        id: 'leg-2',
        impliedVolatility: 30,
        manualIvOverride: null,
      },
    ],
  };

  test('обновляет currentPrice и рыночные поля ноги, не трогая остальное', () => {
    const patch = {
      currentPrice: 205.5,
      options: [
        { id: 'leg-1', impliedVolatility: 54.62, ivUpdatedFromExtension: true, ivUpdatedAt: '2026-07-29T10:00:00.000Z' },
        { id: 'leg-2', impliedVolatility: 33.1, ivUpdatedFromExtension: true, ivUpdatedAt: '2026-07-29T10:00:00.000Z' },
      ],
    };

    const merged = applyPersistablePatch(baseState, patch);

    expect(merged.currentPrice).toBe(205.5);
    expect(merged.selectedTicker).toBe('AAPL');
    expect(merged.positions).toBe(baseState.positions);

    const leg1 = merged.options.find((o) => o.id === 'leg-1');
    expect(leg1.impliedVolatility).toBe(54.62);
    expect(leg1.ivUpdatedFromExtension).toBe(true);
    expect(leg1.ivUpdatedAt).toBe('2026-07-29T10:00:00.000Z');
    // Поля, недоступные расширению — сохраняются такими, какими лежали в БД
    expect(leg1.manualIvOverride).toBe(42);
    expect(leg1.manualIvOverrideDate).toBe('2026-07-01');
    expect(leg1.customAsk).toBe(1.23);
    expect(leg1.actualPLEntry).toBe(100);
    expect(leg1.startSnapshot).toEqual({ impliedVolatility: 40 });
    expect(leg1.quantity).toBe(3);
    expect(leg1.strike).toBe(150);
    expect(leg1.date).toBe('2026-09-19');

    const leg2 = merged.options.find((o) => o.id === 'leg-2');
    expect(leg2.impliedVolatility).toBe(33.1);
    expect(leg2.manualIvOverride).toBeNull();
  });

  test('нога из baseState без соответствия в патче остаётся нетронутой', () => {
    const patch = { currentPrice: 205.5, options: [{ id: 'leg-1', impliedVolatility: 54.62, ivUpdatedFromExtension: true, ivUpdatedAt: 't' }] };
    const merged = applyPersistablePatch(baseState, patch);
    const leg2 = merged.options.find((o) => o.id === 'leg-2');
    expect(leg2).toEqual(baseState.options[1]);
  });

  test('patch.currentPrice отсутствует → currentPrice берётся из baseState', () => {
    const merged = applyPersistablePatch(baseState, { options: [] });
    expect(merged.currentPrice).toBe(200);
  });
});
