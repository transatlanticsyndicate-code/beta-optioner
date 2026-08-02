/**
 * MAIN world guard: фильтрация localStorage по dbConfigId
 * ЗАЧЕМ: React-код калькулятора читает tvc_refresh_command из общего localStorage
 * по таймеру и применяет цену к текущей вкладке. Если открыто несколько вкладок
 * с разными тикерами/сделками — все получат данные последней обновлённой.
 *
 * Этот скрипт перехватывает getItem ДО загрузки React и скрывает команды,
 * предназначенные для другой вкладки (по dbConfigId из URL ?dbConfig=...).
 *
 * ВАЖНО: dbConfig из URL читается ЗАНОВО при каждом вызове getItem, а не один раз
 * при инъекции скрипта. Калькулятор — SPA на React Router: переход между сделками
 * (из списка «Сохранения (БД)» или между сделками) меняет URL через history API
 * БЕЗ перезагрузки страницы, поэтому значение, вычисленное один раз при инъекции
 * (document_start), быстро устаревает и скрипт продолжает сверяться со старой сделкой.
 *
 * Источник: handoff_calc_team_refresh / extension_source / src / calcStorageGuard.js
 */
(function() {
  // Set для анти-спама лога: не чаще одного сообщения на уникальную пару (ожидаемая, пришедшая)
  var loggedPairs = new Set();

  function getCurrentDbConfig() {
    return new URLSearchParams(window.location.search).get('dbConfig');
  }

  var origGet = localStorage.getItem.bind(localStorage);

  localStorage.getItem = function(key) {
    var val = origGet(key);
    if (key === 'tvc_refresh_command' && val) {
      try {
        var cmd = JSON.parse(val);
        if (cmd.type === 'sendPrIV_tocallc' && cmd.dbConfigId) {
          // Читаем dbConfig на МОМЕНТ ЧТЕНИЯ, а не на момент инъекции скрипта —
          // иначе после SPA-перехода между сделками guard сверяется со старым URL.
          var myDbCfg = getCurrentDbConfig();
          if (!myDbCfg || cmd.dbConfigId !== myDbCfg) {
            var pairKey = (myDbCfg || '(нет сделки)') + '|' + cmd.dbConfigId;
            if (!loggedPairs.has(pairKey)) {
              loggedPairs.add(pairKey);
              console.log('⏭️ [StorageGuard] Команда отброшена — dbConfigId не совпадает:', {
                expected: myDbCfg || '(нет открытой сделки)',
                got: cmd.dbConfigId
              });
            }
            return null;
          }
        }
      } catch(e) {}
    }
    return val;
  };
})();
