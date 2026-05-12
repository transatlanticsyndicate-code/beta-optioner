/**
 * MAIN world guard: фильтрация localStorage по dbConfigId
 * ЗАЧЕМ: React-код калькулятора читает tvc_refresh_command из общего localStorage
 * по таймеру и применяет цену к текущей вкладке. Если открыто несколько вкладок
 * с разными сделками — все получат данные последней обновлённой.
 *
 * Этот скрипт перехватывает getItem ДО загрузки React и скрывает команды,
 * предназначенные для другой вкладки (по dbConfigId из URL ?dbConfig=...).
 *
 * Симметрично OptionsCPbuttons/src/calcStorageGuard.js (один и тот же ключ
 * tvc_refresh_command и протокол dbConfigId — оба расширения совместимы).
 */
(function() {
  var myDbCfg = new URLSearchParams(window.location.search).get('dbConfig');
  if (!myDbCfg) return;

  var origGet = localStorage.getItem.bind(localStorage);

  localStorage.getItem = function(key) {
    var val = origGet(key);
    if (key === 'tvc_refresh_command' && val) {
      try {
        var cmd = JSON.parse(val);
        if (cmd.type === 'sendPrIV_tocallc' && cmd.dbConfigId && cmd.dbConfigId !== myDbCfg) {
          return null;
        }
      } catch(e) {}
    }
    return val;
  };
})();
