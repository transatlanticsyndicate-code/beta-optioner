/**
 * Режимы стратегии «Север GPT»: преобразование «переключатель ⇄ признаки для бэкенда».
 * ЗАЧЕМ: расчётная логика на сервере не менялась, она по-прежнему читает
 * withAssetEnabled/withoutPut — ошибка в маппинге тихо сменит режим подбора.
 */
import {
  NORTH_GPT_MODES,
  DEFAULT_NORTH_GPT_MODE,
  isNorthGptMode,
  modeToFlags,
  flagsToMode,
} from '../../components/CalculatorV2/NorthGptStrategy/northGptModes';

describe('northGptModes', () => {
  test('режим раскладывается ровно в ожидаемую пару признаков', () => {
    expect(modeToFlags(NORTH_GPT_MODES.WITH_ASSET))
      .toEqual({ withAssetEnabled: true, withoutPut: false });
    expect(modeToFlags(NORTH_GPT_MODES.OPTIONS_ONLY))
      .toEqual({ withAssetEnabled: false, withoutPut: false });
    expect(modeToFlags(NORTH_GPT_MODES.CALL_ONLY))
      .toEqual({ withAssetEnabled: false, withoutPut: true });
  });

  test('преобразование в обе стороны возвращает исходный режим', () => {
    Object.values(NORTH_GPT_MODES).forEach((mode) => {
      expect(flagsToMode(modeToFlags(mode))).toBe(mode);
    });
  });

  test('устаревшая комбинация «обе галочки» трактуется как «только CALL»', () => {
    // Старый интерфейс позволял поставить обе галочки; в таком запуске Put-страйки
    // уже сохранены пустыми, поэтому форма должна открыться в «только CALL».
    expect(flagsToMode({ withAssetEnabled: true, withoutPut: true }))
      .toBe(NORTH_GPT_MODES.CALL_ONLY);
  });

  test('отсутствие данных даёт режим по умолчанию', () => {
    expect(flagsToMode({})).toBe(DEFAULT_NORTH_GPT_MODE);
    expect(flagsToMode(undefined)).toBe(DEFAULT_NORTH_GPT_MODE);
    expect(flagsToMode(null)).toBe(DEFAULT_NORTH_GPT_MODE);
  });

  test('неизвестный режим ведёт себя как режим по умолчанию', () => {
    expect(modeToFlags('чушь')).toEqual(modeToFlags(DEFAULT_NORTH_GPT_MODE));
    expect(modeToFlags(undefined)).toEqual(modeToFlags(DEFAULT_NORTH_GPT_MODE));
  });

  test('isNorthGptMode пропускает только три известных значения', () => {
    expect(isNorthGptMode('with_asset')).toBe(true);
    expect(isNorthGptMode('options_only')).toBe(true);
    expect(isNorthGptMode('call_only')).toBe(true);
    expect(isNorthGptMode('')).toBe(false);
    expect(isNorthGptMode(undefined)).toBe(false);
    expect(isNorthGptMode('withAsset')).toBe(false);
  });
});
