import { shouldPersistExtensionRefresh } from '../extensionRefreshPolicy';

// Гейт автосейва в БД/localStorage после обновления от расширения.
// ЗАЧЕМ: раньше эффект пересохранения (UniversalOptionsCalculator.jsx) проверял
// только needExtRefreshSaveRef/loadedConfigId — зафиксированные позиции и режим
// редактирования могли быть автоматически переписаны обновлением от расширения.
// Предикат вынесен в extensionRefreshPolicy.js, чтобы гейты покрывались тестами
// без рендера компонента.
describe('shouldPersistExtensionRefresh (гейт автосейва)', () => {
  test('нет флага "нужно пересохранить" → false', () => {
    expect(shouldPersistExtensionRefresh({
      hasPendingFlag: false, loadedConfigId: 'cfg-1', isLocked: false, isEditMode: false,
    })).toBe(false);
  });

  test('нет loadedConfigId → false', () => {
    expect(shouldPersistExtensionRefresh({
      hasPendingFlag: true, loadedConfigId: null, isLocked: false, isEditMode: false,
    })).toBe(false);
  });

  test('позиция зафиксирована (isLocked) → false', () => {
    expect(shouldPersistExtensionRefresh({
      hasPendingFlag: true, loadedConfigId: 'cfg-1', isLocked: true, isEditMode: false,
    })).toBe(false);
  });

  test('режим редактирования (isEditMode) → false', () => {
    expect(shouldPersistExtensionRefresh({
      hasPendingFlag: true, loadedConfigId: 'cfg-1', isLocked: false, isEditMode: true,
    })).toBe(false);
  });

  test('обычный случай (флаг есть, configId есть, не залочено, не редактируется) → true', () => {
    expect(shouldPersistExtensionRefresh({
      hasPendingFlag: true, loadedConfigId: 'cfg-1', isLocked: false, isEditMode: false,
    })).toBe(true);
  });
});
