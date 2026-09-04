/**
 * Проверка справочника эталонных цен пункта.
 * ЗАЧЕМ: справочник — единственная защита от повторения инцидента, когда во все
 * контракты вписали стоимость тика вместо цены пункта.
 */
import {
  getReferencePointValue,
  checkPointValue,
} from '../futuresPointValueReference';

describe('futuresPointValueReference', () => {
  it('отдаёт эталонный множитель по тикеру (регистр не важен)', () => {
    expect(getReferencePointValue('NG')).toBe(10000);
    expect(getReferencePointValue('es')).toBe(50);
    expect(getReferencePointValue(' 6E ')).toBe(125000);
  });

  it('неизвестный или пустой тикер — null', () => {
    expect(getReferencePointValue('AAPL')).toBeNull();
    expect(getReferencePointValue('')).toBeNull();
    expect(getReferencePointValue(null)).toBeNull();
  });

  it('корректное значение расхождений не даёт', () => {
    expect(checkPointValue('NG', 10000)).toBeNull();
    expect(checkPointValue('ZQ', 4166.6667)).toBeNull(); // допуск на округление
  });

  it('стоимость тика вместо цены пункта — предупреждение', () => {
    expect(checkPointValue('NG', 10)).toEqual({ reference: 10000, looksLikeTickValue: true });
    expect(checkPointValue('GC', 10)).toEqual({ reference: 100, looksLikeTickValue: true });
  });

  it('завышенное значение — тоже предупреждение, но не «похоже на тик»', () => {
    expect(checkPointValue('ES', 500)).toEqual({ reference: 50, looksLikeTickValue: false });
  });

  it('контракт вне справочника или мусорный ввод — молчим', () => {
    expect(checkPointValue('XYZ', 7)).toBeNull();
    expect(checkPointValue('NG', 0)).toBeNull();
    expect(checkPointValue('NG', 'abc')).toBeNull();
  });
});
