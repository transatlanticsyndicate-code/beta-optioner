// Политика применения обновлений от расширения TradingView к рыночной IV.
//
// ЗАЧЕМ: расширение присылает IV чере команду sendPrIV_tocallc (tvc_refresh_command).
// Раньше это значение писалось прямо в manualIvOverride ("Fact IV") — поле, которое
// пользователь заполняет вручную раз в неделю реальными данными из терминала
// брокера. В результате 116 из 134 ног в базе оказались перезаписаны рыночными
// значениями и потеряли брокерские Fact IV. Эти функции строго разделяют потоки:
// рыночная IV идёт ТОЛЬКО в impliedVolatility (колонка «IV»), Fact IV (manualIvOverride*)
// расширение не трогает никогда.
//
// КАНОН ЕДИНИЦ: impliedVolatility хранится в ПРОЦЕНТАХ (54.62, а не 0.5462).
// Весь ценовой стек (getOptionVolatility, calculateStockOptionPLValue и т.д.)
// определяет единицы эвристикой «значение > 1 → это проценты, делим на 100»,
// а не по типу поля. Доли физически не могут выразить волатильность ≥100%,
// что для крипты и фьючерсов — обычное дело, поэтому канон именно проценты.
//
// ИЗВЕСТНОЕ РАСХОЖДЕНИЕ (сегодня не трогаем): значения в диапазоне (1; 1.5]
// фронт (эта функция, порог 1.5) трактует как уже проценты, а бэкенд и
// utils/northGptStrategy/enrich.js:28-32 (тот же порог 1.5, но по факту почти
// не встречает значений в этом узком окне) — как доли. Порог 1.5 выбран
// намеренно, чтобы совпадать с уже принятым порогом в enrich.js.

/**
 * Приводит «сырое» значение IV от расширения к процентам.
 *
 * Правила:
 *  - не конечное число или <= 0 → null (нет данных);
 *  - значение <= 1.5 трактуется как доля (0.5462) и умножается на 100;
 *  - результат обязан попасть в разумный коридор [1, 500] (проценты),
 *    иначе это не IV (мусор/опечатка) → null.
 *
 * @param {number|string|null|undefined} rawIv
 * @returns {number|null} IV в процентах, либо null
 */
export function normalizeMarketIv(rawIv) {
  const n = Number(rawIv);
  if (!Number.isFinite(n) || n <= 0) return null;

  const percent = n <= 1.5 ? n * 100 : n;

  if (percent < 1 || percent > 500) return null;

  return percent;
}

/**
 * Строит патч рыночной IV для опциона на основе команды от расширения.
 *
 * ВАЖНО: пишет ТОЛЬКО поля рыночной IV. Никогда не трогает manualIvOverride /
 * manualIvOverrideDate / manualIvOverrideDisplayDate — это ручные брокерские
 * данные («Fact IV»), расширение не имеет права их менять.
 *
 * @param {object} option — текущий опцион (не используется для чтения, оставлен
 *   для единообразия сигнатуры и возможных будущих проверок по опциону)
 * @param {number|string|null|undefined} rawIv — сырое значение IV от расширения
 * @param {string} nowIso — текущая метка времени в ISO (для ivUpdatedAt)
 * @returns {{impliedVolatility: number, ivUpdatedFromExtension: true, ivUpdatedAt: string}|null}
 */
export function buildIvPatch(option, rawIv, nowIso) {
  const iv = normalizeMarketIv(rawIv);
  if (iv === null) return null;

  return {
    impliedVolatility: iv,
    ivUpdatedFromExtension: true,
    ivUpdatedAt: nowIso,
  };
}

/**
 * Решает, нужно ли пересохранять конфигурацию после обновления от расширения.
 *
 * ЗАЧЕМ: вынесено в чистую функцию, чтобы гейты (зафиксированная позиция,
 * режим редактирования) можно было покрыть тестами без рендера компонента.
 * Побочный эффект (сохранение в БД/localStorage) остаётся в эффекте калькулятора —
 * здесь только решение "можно/нельзя".
 *
 * @param {object} params
 * @param {boolean} params.hasPendingFlag — взведён ли флаг "нужно пересохранить"
 * @param {string|null} params.loadedConfigId — id загруженной конфигурации
 * @param {boolean} params.isLocked — позиция зафиксирована (неизменяема)
 * @param {boolean} params.isEditMode — идёт ручное редактирование конфигурации
 * @returns {boolean}
 */
export function shouldPersistExtensionRefresh({ hasPendingFlag, loadedConfigId, isLocked, isEditMode }) {
  if (!hasPendingFlag) return false;
  if (!loadedConfigId) return false;
  if (isLocked) return false;
  if (isEditMode) return false;
  return true;
}
