# Диагностика качества данных по сделкам — срез на 2026-07-29

Источник: `deals_backup_2026-07-29.json` (только чтение). Сделок: **50**, ног: **134**.

Модель: Блэк–Шоулз, r = 4.5%, q = dividendYield из снапшота, t = (экспирация − дата якоря)/365, спот = actualPLPrice, волатильность = manualIvOverride, иначе impliedVolatility (нормализация «>1 → /100»). Множитель: акции/ETF 100, фьючерсы 1 (точное значение неизвестно, помечено флагом).

## 1. Сводка по флагам

| Флаг | Ног | % от 134 |
|---|---:|---:|
| iv_overwritten | 116 | 87% |
| anchor_residual_big | 3 | 2% |
| anchor_at_entry | 3 | 2% |
| anchor_price_suspicious | 5 | 4% |
| entry_price_rounded | 66 | 49% |
| futures_no_multiplier | 5 | 4% |
| stale_fact | 7 | 5% |
| no_snapshot | 0 | 0% |
| iv_format_fraction | 115 | 86% |

Суммарный размер искажения по `anchor_residual_big`: **$1 762** (сумма |r|).

Ног хотя бы с одним флагом: **134** из 134.

### Оговорки по покрытию

- У **8** ног в снапшоте нет реальной цены входа актива — для них флаг `entry_price_rounded` проверить невозможно (фактическое число округлённых цен входа может быть выше).
- Остаток якоря r посчитан для **134** из 134 ног.
- Все 134 ноги — покупки (Buy), коротких позиций нет; знак P&L не требует отдельной обработки.
- Сделок в режиме futures: 2 (ZWU2026, ZCU2026, 5 ног). Множитель контракта нигде не сохранён, поэтому их P&L посчитан с множителем 1 и достоверным считать нельзя.

## 2. Все ноги с флагами (сортировка по |r| убыв.)

| # | Тикер | Сделка | Нога | Флаги | Fact P&L | Теор. P&L (якорь) | Остаток r | Рекомендация |
|---:|---|---|---|---|---:|---:|---:|---|
| 1 | EQT | EQT_BC65_BP42.5 | Buy CALL 65 x54 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded, stale_fact | -738 | -1 672 | 934 | проверить цену входа |
| 2 | T | T_BP18_BC28_18.09.26 | Buy CALL 28 x96 2026-09-18 | iv_overwritten, anchor_residual_big | -17 | 818 | -835 | перевести Fact P&L заново из терминала |
| 3 | ZCU2026 | ZCU2026 | 94 BuyCALL 21.08.26 490, 1 BuyCALL 21.08.26 480… | Buy CALL 480 x1 2026-08-21 | iv_format_fraction, anchor_residual_big, anchor_at_entry, futures_no_multiplier, stale_fact | 587 | 1 | 586 | сбросить якорь |
| 4 | ADBE | ADBE_BP205 | Buy PUT 205 x2 2026-08-21 | iv_format_fraction, iv_overwritten, entry_price_rounded | -1 454 | -1 102 | -352 | проверить цену входа |
| 5 | ICE | ICE_BC165_BP125 | Buy CALL 165 x13 2026-09-18 | iv_format_fraction, iv_overwritten, anchor_residual_big | 1 443 | 1 784 | -341 | перевести Fact P&L заново из терминала |
| 6 | TTD | TTD_BC25_BP17.5 | Buy PUT 17.5 x14 2026-09-18 | iv_format_fraction, iv_overwritten | -183 | -466 | 283 | ок, наблюдать |
| 7 | CRM | CRM_BP155_BP165_BC210_BC220_21.08.26 | Buy PUT 165 x1 2026-08-21 | iv_overwritten | -406 | -606 | 200 | ок, наблюдать |
| 8 | NFLX | NFLX_BC95_BC91_BP65_BP70 | Buy CALL 91 x1 2026-09-18 | iv_format_fraction, iv_overwritten | 98 | -97 | 195 | ок, наблюдать |
| 9 | CRNX | CRNX_BC85_BP80 | Buy CALL 85 x96 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | -928 | -735 | -193 | проверить цену входа |
| 10 | ZCU2026 | ZCU2026 | 94 BuyCALL 21.08.26 490, 1 BuyCALL 21.08.26 480… | Buy PUT 380 x28 2026-08-21 | iv_format_fraction, anchor_at_entry, futures_no_multiplier, stale_fact | 175 | -9 | 184 | ок, наблюдать |
| 11 | CG | CG_BC52.5_BC55_BP40_BP37.5 | Buy PUT 40 x3 2026-09-18 | iv_format_fraction, iv_overwritten | -205 | -24 | -181 | ок, наблюдать |
| 12 | ORCL | ORCL_BC200_BC180_BP95_BP100 | Buy PUT 100 x1 2026-10-16 | iv_format_fraction, iv_overwritten | 179 | 357 | -178 | ок, наблюдать |
| 13 | MKTX | MKTX_BP115_BC130_21.08.26 | Buy PUT 115 x2 2026-08-21 | iv_overwritten | -415 | -581 | 166 | ок, наблюдать |
| 14 | WYNN | WYNN_BC125_BP90_BP85 | Buy CALL 125 x6 2026-10-16 | iv_format_fraction, iv_overwritten | -70 | 88 | -158 | ок, наблюдать |
| 15 | ORCL | ORCL_BC200_BC180_BP95_BP100 | Buy PUT 95 x1 2026-10-16 | iv_format_fraction, iv_overwritten | 155 | 305 | -150 | ок, наблюдать |
| 16 | ISRG | ISRG_BP310_BC435 | Buy PUT 310 x1 2026-11-20 | iv_format_fraction, iv_overwritten, entry_price_rounded | 288 | 148 | 140 | проверить цену входа |
| 17 | TCOM | TCOM_BC60_BP35_BP30 | Buy PUT 35 x2 2026-09-18 | iv_format_fraction, iv_overwritten | -24 | -160 | 136 | ок, наблюдать |
| 18 | TCOM | TCOM_BC60_BP35_BP30 | Buy PUT 30 x1 2026-09-18 | iv_format_fraction, iv_overwritten | -156 | -23 | -133 | ок, наблюдать |
| 19 | MKTX | MKTX_BP115_BC130_21.08.26 | Buy CALL 130 x4 2026-08-21 | iv_overwritten | -880 | -1 011 | 131 | ок, наблюдать |
| 20 | JKHY | JKHY_BP115_BP110 | Buy PUT 115 x4 2026-09-18 | iv_format_fraction, iv_overwritten, anchor_price_suspicious, entry_price_rounded | -1 038 | -914 | -124 | сбросить якорь (цена якоря не от этого инструмента) |
| 21 | SAP | SAP_BC210_BP135_BP140 | Buy CALL 210 x5 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | -841 | -723 | -118 | проверить цену входа |
| 22 | CRM | CRM_BP155_BP165_BC210_BC220_21.08.26 | Buy PUT 155 x1 2026-08-21 | iv_overwritten | -402 | -515 | 113 | ок, наблюдать |
| 23 | CRM | CRM_BP155_BP165_BC210_BC220_21.08.26 | Buy CALL 210 x9 2026-08-21 | iv_overwritten | -1 919 | -1 808 | -111 | ок, наблюдать |
| 24 | ROL | ROL_BC50_BP35_BP32.5 | Buy PUT 35 x2 2026-11-20 | iv_format_fraction, iv_overwritten | -36 | 64 | -100 | ок, наблюдать |
| 25 | STWD | STWD_BC20_BP15 | Buy CALL 20 x142 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | -1 015 | -917 | -98 | проверить цену входа |
| 26 | ZWU2026 | ZWU2026 | 30 BuyCALL 21.08.26 675, 18 BuyPUT 21.08.26 565 | Buy PUT 565 x18 2026-08-21 | iv_format_fraction, anchor_at_entry, futures_no_multiplier, stale_fact | -112 | -21 | -91 | ок, наблюдать |
| 27 | ORCL | ORCL_BC200_BC180_BP95_BP100 | Buy CALL 180 x1 2026-10-16 | iv_format_fraction, iv_overwritten | -112 | -201 | 89 | ок, наблюдать |
| 28 | VICI | VICI_BC30_BP25 | Buy CALL 30 x210 2026-08-21 | iv_format_fraction, iv_overwritten, entry_price_rounded | -5 895 | -5 806 | -89 | проверить цену входа |
| 29 | ISRG | ISRG_BP310_BC435 | Buy CALL 435 x1 2026-11-20 | iv_format_fraction, iv_overwritten, entry_price_rounded | -293 | -223 | -70 | проверить цену входа |
| 30 | SAP | SAP_BC210_BP135_BP140 | Buy PUT 140 x1 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | -206 | -270 | 64 | проверить цену входа |
| 31 | TTD | TTD_BC25_BP17.5 | Buy CALL 25 x10 2026-09-18 | iv_format_fraction, iv_overwritten | -1 157 | -1 093 | -64 | ок, наблюдать |
| 32 | CG | CG_BC52.5_BC55_BP40_BP37.5 | Buy PUT 37.5 x1 2026-09-18 | iv_format_fraction, iv_overwritten | -50 | -111 | 61 | ок, наблюдать |
| 33 | IBM | IBM_BC310_BP200 | Buy PUT 200 x1 2026-10-16 | iv_format_fraction, iv_overwritten | -78 | -135 | 57 | ок, наблюдать |
| 34 | ROL | ROL_BC50_BP35_BP32.5 | Buy PUT 32.5 x1 2026-11-20 | iv_format_fraction, iv_overwritten | -42 | -97 | 55 | ок, наблюдать |
| 35 | SAP | SAP_BC210_BP135_BP140 | Buy PUT 135 x1 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | -187 | -233 | 46 | проверить цену входа |
| 36 | EQT | EQT_BC65_BP42.5 | Buy PUT 42.5 x12 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded, stale_fact | -212 | -172 | -40 | проверить цену входа |
| 37 | ROL | ROL_BC50_BP35_BP32.5 | Buy CALL 50 x25 2026-11-20 | iv_format_fraction, iv_overwritten | -267 | -227 | -40 | ок, наблюдать |
| 38 | CPRT | CPRT_BC40_BP27.5_BP25 | Buy CALL 40 x35 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | -636 | -597 | -39 | проверить цену входа |
| 39 | VEEV | VEEV_BP130_BP135 | Buy PUT 135 x1 2026-09-18 | iv_format_fraction, iv_overwritten, anchor_price_suspicious, entry_price_rounded | -430 | -467 | 37 | сбросить якорь (цена якоря не от этого инструмента) |
| 40 | CCL | CCL_BC34_BC35_BP25_BP26 | Buy PUT 25 x4 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | -8 | -45 | 37 | проверить цену входа |
| 41 | BJ | BJ_BC110_BP70 | Buy CALL 110 x8 2026-11-20 | iv_format_fraction, iv_overwritten, entry_price_rounded | 455 | 490 | -35 | проверить цену входа |
| 42 | IBM | IBM_BC310_BP200 | Buy CALL 310 x4 2026-10-16 | iv_format_fraction, iv_overwritten | -689 | -654 | -35 | ок, наблюдать |
| 43 | BR | BR_BC180_BC175_BP125_BP130 | Buy CALL 175 x4 2026-09-18 | iv_format_fraction, iv_overwritten | 131 | 165 | -34 | ок, наблюдать |
| 44 | NKE | NKE_BC57.5_BP35 | Buy CALL 57.5 x26 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | -563 | -533 | -30 | проверить цену входа |
| 45 | T | T_BP18_BC28_18.09.26 | Buy PUT 18 x12 2026-09-18 | iv_overwritten | -386 | -415 | 29 | ок, наблюдать |
| 46 | VEEV | VEEV_BP130_BP135 | Buy PUT 130 x1 2026-09-18 | iv_format_fraction, iv_overwritten, anchor_price_suspicious, entry_price_rounded | -342 | -371 | 29 | сбросить якорь (цена якоря не от этого инструмента) |
| 47 | CMCSA | CMCSA_BC31_BC30_BP21_BP20 | Buy CALL 31 x53 2026-09-18 | iv_format_fraction, iv_overwritten | -274 | -248 | -26 | ок, наблюдать |
| 48 | CCL | CCL_BC34_BC35_BP25_BP26 | Buy CALL 34 x20 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | -333 | -307 | -26 | проверить цену входа |
| 49 | ZG | ZG_BC40_BC45_BP25_BP30 | Buy PUT 30 x4 2026-08-21 | iv_format_fraction, iv_overwritten, entry_price_rounded | -173 | -198 | 25 | проверить цену входа |
| 50 | BSX | BSX_BC60_21.08.26 | Buy CALL 60 x37 2026-08-21 | iv_overwritten | -1 838 | -1 816 | -22 | ок, наблюдать |
| 51 | CPRT | CPRT_BC40_BP27.5_BP25 | Buy PUT 27.5 x3 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | 178 | 159 | 19 | проверить цену входа |
| 52 | BR | BR_BC180_BC175_BP125_BP130 | Buy CALL 180 x3 2026-09-18 | iv_format_fraction, iv_overwritten | -55 | -37 | -18 | ок, наблюдать |
| 53 | PLTR | PLTR_BP90 | Buy PUT 90 x3 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | -805 | -822 | 17 | проверить цену входа |
| 54 | MSTR | MSTR_BC160_BP80 | Buy PUT 80 x1 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | -103 | -119 | 16 | проверить цену входа |
| 55 | PYPL | PYPL_BP37.5_18.09.26 | Buy PUT 37.5 x13 2026-09-18 | iv_overwritten, anchor_price_suspicious | -2 259 | -2 275 | 16 | сбросить якорь (цена якоря не от этого инструмента) |
| 56 | TSCO | TSCO_BC40_BP25 | Buy CALL 40 x15 2026-10-16 | iv_format_fraction, iv_overwritten, entry_price_rounded | -460 | -445 | -15 | проверить цену входа |
| 57 | ADSK | ADSK_BC240_BC250_BP185 | Buy PUT 185 x1 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | -551 | -566 | 15 | проверить цену входа |
| 58 | AEM | AEM_BC180_BC175_BP125 | Buy PUT 125 x2 2026-10-16 | iv_format_fraction, iv_overwritten | -329 | -343 | 14 | ок, наблюдать |
| 59 | ZWU2026 | ZWU2026 | 30 BuyCALL 21.08.26 675, 18 BuyPUT 21.08.26 565 | Buy CALL 675 x30 2026-08-21 | iv_format_fraction, futures_no_multiplier, stale_fact | 0 | 14 | -14 | ок, наблюдать |
| 60 | CRK | CRK_BC18_BP10 | Buy CALL 18 x14 2026-11-20 | iv_format_fraction, iv_overwritten, entry_price_rounded | 175 | 189 | -14 | проверить цену входа |
| 61 | AMSC | AMSC | 1 BuyPUT 16.10.26 28, 1 BuyPUT 16.10.26 24, 5 BuyC… | Buy CALL 45 x5 2026-10-16 | iv_format_fraction, entry_price_rounded | -13 | -26 | 13 | проверить цену входа |
| 62 | CCL | CCL_BC34_BC35_BP25_BP26 | Buy PUT 26 x1 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | -23 | -10 | -13 | проверить цену входа |
| 63 | ORCL | ORCL_BC200_BC180_BP95_BP100 | Buy CALL 200 x4 2026-10-16 | iv_format_fraction, iv_overwritten | -520 | -507 | -13 | ок, наблюдать |
| 64 | STM | STM | 6 BuyCALL 16.10.26 75, 2 BuyCALL 16.10.26 80, 1 Buy… | Buy CALL 75 x6 2026-10-16 | iv_format_fraction, entry_price_rounded | 33 | 45 | -12 | проверить цену входа |
| 65 | CCI | CCI_BC95_BC90_BP70 | Buy CALL 95 x8 2026-10-16 | iv_format_fraction, iv_overwritten | 59 | 71 | -12 | ок, наблюдать |
| 66 | NFLX | NFLX_BC95_BC91_BP65_BP70 | Buy CALL 95 x11 2026-09-18 | iv_format_fraction, iv_overwritten | -865 | -853 | -12 | ок, наблюдать |
| 67 | CCI | CCI_BC95_BC90_BP70 | Buy PUT 70 x2 2026-10-16 | iv_format_fraction, iv_overwritten | 3 | -8 | 11 | ок, наблюдать |
| 68 | BR | BR_BC180_BC175_BP125_BP130 | Buy PUT 130 x1 2026-09-18 | iv_format_fraction, iv_overwritten | -288 | -299 | 11 | ок, наблюдать |
| 69 | EFX | EFX_BC190_BC195_BP145 | Buy CALL 195 x2 2026-10-16 | iv_format_fraction, iv_overwritten, entry_price_rounded | 429 | 440 | -11 | проверить цену входа |
| 70 | NKE | NKE_BC57.5_BP35 | Buy PUT 35 x5 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | -311 | -321 | 10 | проверить цену входа |
| 71 | ADSK | ADSK_BC240_BC250_BP185 | Buy CALL 240 x1 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | 97 | 107 | -10 | проверить цену входа |
| 72 | STM | STM | 6 BuyCALL 16.10.26 75, 2 BuyCALL 16.10.26 80, 1 Buy… | Buy PUT 49 x1 2026-10-16 | iv_format_fraction, entry_price_rounded | -2 | -12 | 10 | проверить цену входа |
| 73 | XP | XP_BP12_BP14_BC19_BC20_21.08.26 | Buy PUT 12 x30 2026-08-21 | iv_overwritten | -740 | -730 | -10 | ок, наблюдать |
| 74 | STM | STM | 6 BuyCALL 16.10.26 75, 2 BuyCALL 16.10.26 80, 1 Buy… | Buy PUT 47 x1 2026-10-16 | iv_format_fraction, entry_price_rounded | 3 | -6 | 9 | проверить цену входа |
| 75 | XP | XP_BP12_BP14_BC19_BC20_21.08.26 | Buy CALL 19 x74 2026-08-21 | iv_overwritten | -604 | -613 | 9 | ок, наблюдать |
| 76 | AEM | AEM_BC180_BC175_BP125 | Buy CALL 175 x2 2026-10-16 | iv_format_fraction, iv_overwritten | 91 | 100 | -9 | ок, наблюдать |
| 77 | CRM | CRM_BP155_BP165_BC210_BC220_21.08.26 | Buy CALL 220 x1 2026-08-21 | iv_overwritten | -161 | -153 | -8 | ок, наблюдать |
| 78 | TW | TW_BC125_BP90_BP95 | Buy PUT 95 x1 2026-10-16 | iv_format_fraction, iv_overwritten | -73 | -81 | 8 | ок, наблюдать |
| 79 | CPRT | CPRT_BC40_BP27.5_BP25 | Buy PUT 25 x3 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | 58 | 50 | 8 | проверить цену входа |
| 80 | ADSK | ADSK_BC240_BC250_BP185 | Buy CALL 250 x1 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | 84 | 92 | -8 | проверить цену входа |
| 81 | NFLX | NFLX_BC95_BC91_BP65_BP70 | Buy PUT 65 x4 2026-09-18 | iv_format_fraction, iv_overwritten | -309 | -317 | 8 | ок, наблюдать |
| 82 | WYNN | WYNN_BC125_BP90_BP85 | Buy PUT 90 x1 2026-10-16 | iv_format_fraction, iv_overwritten | 12 | 4 | 8 | ок, наблюдать |
| 83 | PNR | PNR_BC77.5_BP62.5 | Buy CALL 77.5 x8 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | -45 | -38 | -7 | проверить цену входа |
| 84 | STM | STM | 6 BuyCALL 16.10.26 75, 2 BuyCALL 16.10.26 80, 1 Buy… | Buy PUT 44 x1 2026-10-16 | iv_format_fraction, entry_price_rounded | -4 | -11 | 7 | проверить цену входа |
| 85 | BR | BR_BC180_BC175_BP125_BP130 | Buy PUT 125 x1 2026-09-18 | iv_format_fraction, iv_overwritten | -263 | -270 | 7 | ок, наблюдать |
| 86 | AEM | AEM_BC180_BC175_BP125 | Buy CALL 180 x2 2026-10-16 | iv_format_fraction, iv_overwritten | 55 | 62 | -7 | ок, наблюдать |
| 87 | EFX | EFX_BC190_BC195_BP145 | Buy CALL 190 x1 2026-10-16 | iv_format_fraction, iv_overwritten, entry_price_rounded | 322 | 329 | -7 | проверить цену входа |
| 88 | EFX | EFX_BC190_BC195_BP145 | Buy PUT 145 x1 2026-10-16 | iv_format_fraction, iv_overwritten, entry_price_rounded | -600 | -607 | 7 | проверить цену входа |
| 89 | TW | TW_BC125_BP90_BP95 | Buy CALL 125 x4 2026-10-16 | iv_format_fraction, iv_overwritten | -169 | -162 | -7 | ок, наблюдать |
| 90 | ZG | ZG_BC40_BC45_BP25_BP30 | Buy CALL 40 x7 2026-08-21 | iv_format_fraction, iv_overwritten, entry_price_rounded | -859 | -852 | -7 | проверить цену входа |
| 91 | PNR | PNR_BC77.5_BP62.5 | Buy PUT 62.5 x1 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | 22 | 16 | 6 | проверить цену входа |
| 92 | CG | CG_BC52.5_BC55_BP40_BP37.5 | Buy CALL 52.5 x7 2026-09-18 | iv_format_fraction, iv_overwritten | -33 | -27 | -6 | ок, наблюдать |
| 93 | VICI | VICI_BC30_BP25 | Buy PUT 25 x10 2026-08-21 | iv_format_fraction, iv_overwritten, entry_price_rounded | -307 | -301 | -6 | проверить цену входа |
| 94 | OKLO | OKLO | 3 BuyCALL 16.10.26 65, 1 BuyCALL 16.10.26 60, 1 Bu… | Buy PUT 35 x2 2026-10-16 | iv_format_fraction, entry_price_rounded | 13 | 7 | 6 | проверить цену входа |
| 95 | TW | TW_BC125_BP90_BP95 | Buy PUT 90 x1 2026-10-16 | iv_format_fraction, iv_overwritten | -7 | -12 | 5 | ок, наблюдать |
| 96 | WYNN | WYNN_BC125_BP90_BP85 | Buy PUT 85 x1 2026-10-16 | iv_format_fraction, iv_overwritten | -7 | -12 | 5 | ок, наблюдать |
| 97 | BJ | BJ_BC110_BP70 | Buy PUT 70 x5 2026-11-20 | iv_format_fraction, iv_overwritten, entry_price_rounded | -694 | -699 | 5 | проверить цену входа |
| 98 | MSTR | MSTR_BC160_BP80 | Buy CALL 160 x2 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | -599 | -594 | -5 | проверить цену входа |
| 99 | NFLX | NFLX_BC95_BC91_BP65_BP70 | Buy PUT 70 x1 2026-09-18 | iv_format_fraction, iv_overwritten | -68 | -73 | 5 | ок, наблюдать |
| 100 | JKHY | JKHY_BP115_BP110 | Buy PUT 110 x1 2026-09-18 | iv_format_fraction, iv_overwritten, anchor_price_suspicious, entry_price_rounded | -126 | -121 | -5 | сбросить якорь (цена якоря не от этого инструмента) |
| 101 | AA | AA_BC65_BP40 | Buy PUT 40 x3 2026-10-16 | iv_format_fraction, iv_overwritten, entry_price_rounded | 113 | 109 | 4 | проверить цену входа |
| 102 | TSCO | TSCO_BC40_BP25 | Buy PUT 25 x7 2026-10-16 | iv_format_fraction, iv_overwritten, entry_price_rounded | -271 | -275 | 4 | проверить цену входа |
| 103 | ZCU2026 | ZCU2026 | 94 BuyCALL 21.08.26 490, 1 BuyCALL 21.08.26 480… | Buy CALL 490 x94 2026-08-21 | iv_format_fraction, futures_no_multiplier, stale_fact | 1 | -3 | 4 | ок, наблюдать |
| 104 | CCL | CCL_BC34_BC35_BP25_BP26 | Buy CALL 35 x3 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | -32 | -28 | -4 | проверить цену входа |
| 105 | PDD | PDD_BC100_BC105_BP70_BP75_18.09.26 | Buy PUT 75 x1 2026-09-18 | iv_overwritten | -102 | -106 | 4 | ок, наблюдать |
| 106 | STM | STM | 6 BuyCALL 16.10.26 75, 2 BuyCALL 16.10.26 80, 1 Buy… | Buy CALL 80 x2 2026-10-16 | iv_format_fraction, entry_price_rounded | -25 | -22 | -3 | проверить цену входа |
| 107 | OKLO | OKLO | 3 BuyCALL 16.10.26 65, 1 BuyCALL 16.10.26 60, 1 Bu… | Buy PUT 40 x1 2026-10-16 | iv_format_fraction, entry_price_rounded | 7 | 4 | 3 | проверить цену входа |
| 108 | ZG | ZG_BC40_BC45_BP25_BP30 | Buy PUT 25 x1 2026-08-21 | iv_format_fraction, iv_overwritten, entry_price_rounded | -27 | -30 | 3 | проверить цену входа |
| 109 | PDD | PDD_BC100_BC105_BP70_BP75_18.09.26 | Buy PUT 70 x1 2026-09-18 | iv_overwritten | -69 | -71 | 2 | ок, наблюдать |
| 110 | CCI | CCI_BC95_BC90_BP70 | Buy CALL 90 x1 2026-10-16 | iv_format_fraction, iv_overwritten | -18 | -16 | -2 | ок, наблюдать |
| 111 | OKLO | OKLO | 3 BuyCALL 16.10.26 65, 1 BuyCALL 16.10.26 60, 1 Bu… | Buy CALL 65 x3 2026-10-16 | iv_format_fraction, entry_price_rounded | 1 | 3 | -2 | проверить цену входа |
| 112 | B | B_BC46_BC45_BP31 | Buy CALL 46 x8 2026-10-16 | iv_format_fraction, iv_overwritten, entry_price_rounded | 255 | 253 | 2 | проверить цену входа |
| 113 | AMSC | AMSC | 1 BuyPUT 16.10.26 28, 1 BuyPUT 16.10.26 24, 5 BuyC… | Buy PUT 28 x1 2026-10-16 | iv_format_fraction, entry_price_rounded | 2 | 4 | -2 | проверить цену входа |
| 114 | STWD | STWD_BC20_BP15 | Buy PUT 15 x30 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | -695 | -693 | -2 | проверить цену входа |
| 115 | AMSC | AMSC | 1 BuyPUT 16.10.26 28, 1 BuyPUT 16.10.26 24, 5 BuyC… | Buy PUT 24 x1 2026-10-16 | iv_format_fraction, entry_price_rounded | 9 | 11 | -2 | проверить цену входа |
| 116 | CMCSA | CMCSA_BC31_BC30_BP21_BP20 | Buy PUT 21 x8 2026-09-18 | iv_format_fraction, iv_overwritten | -16 | -14 | -2 | ок, наблюдать |
| 117 | CRK | CRK_BC18_BP10 | Buy PUT 10 x11 2026-11-20 | iv_format_fraction, iv_overwritten, entry_price_rounded | -145 | -143 | -2 | проверить цену входа |
| 118 | AA | AA_BC65_BP40 | Buy CALL 65 x4 2026-10-16 | iv_format_fraction, iv_overwritten, entry_price_rounded | -371 | -369 | -2 | проверить цену входа |
| 119 | B | B_BC46_BC45_BP31 | Buy CALL 45 x4 2026-10-16 | iv_format_fraction, iv_overwritten, entry_price_rounded | 85 | 87 | -2 | проверить цену входа |
| 120 | PDD | PDD_BC100_BC105_BP70_BP75_18.09.26 | Buy CALL 105 x3 2026-09-18 | iv_overwritten | -146 | -145 | -1 | ок, наблюдать |
| 121 | ICE | ICE_BC165_BP125 | Buy PUT 125 x1 2026-09-18 | iv_format_fraction, iv_overwritten | -643 | -644 | 1 | ок, наблюдать |
| 122 | CMCSA | CMCSA_BC31_BC30_BP21_BP20 | Buy CALL 30 x3 2026-09-18 | iv_format_fraction, iv_overwritten | -36 | -35 | -1 | ок, наблюдать |
| 123 | CG | CG_BC52.5_BC55_BP40_BP37.5 | Buy CALL 55 x1 2026-09-18 | iv_format_fraction, iv_overwritten | -16 | -15 | -1 | ок, наблюдать |
| 124 | XP | XP_BP12_BP14_BC19_BC20_21.08.26 | Buy PUT 14 x5 2026-08-21 | iv_overwritten | -316 | -315 | -1 | ок, наблюдать |
| 125 | PDD | PDD_BC100_BC105_BP70_BP75_18.09.26 | Buy CALL 100 x1 2026-09-18 | iv_overwritten | -84 | -83 | -1 | ок, наблюдать |
| 126 | TCOM | TCOM_BC60_BP35_BP30 | Buy CALL 60 x42 2026-09-18 | iv_format_fraction, iv_overwritten | 284 | 285 | -1 | ок, наблюдать |
| 127 | OKLO | OKLO | 3 BuyCALL 16.10.26 65, 1 BuyCALL 16.10.26 60, 1 Bu… | Buy CALL 60 x1 2026-10-16 | iv_format_fraction, entry_price_rounded | -7 | -8 | 1 | проверить цену входа |
| 128 | ZG | ZG_BC40_BC45_BP25_BP30 | Buy CALL 45 x2 2026-08-21 | iv_format_fraction, iv_overwritten, entry_price_rounded | -76 | -75 | -1 | проверить цену входа |
| 129 | CMCSA | CMCSA_BC31_BC30_BP21_BP20 | Buy PUT 20 x1 2026-09-18 | iv_format_fraction, iv_overwritten | -8 | -8 | -0 | ок, наблюдать |
| 130 | OKLO | OKLO | 3 BuyCALL 16.10.26 65, 1 BuyCALL 16.10.26 60, 1 Bu… | Buy CALL 70 x1 2026-10-16 | iv_format_fraction, entry_price_rounded | 1 | 1 | -0 | проверить цену входа |
| 131 | B | B_BC46_BC45_BP31 | Buy PUT 31 x5 2026-10-16 | iv_format_fraction, iv_overwritten, entry_price_rounded | -236 | -236 | -0 | проверить цену входа |
| 132 | CRNX | CRNX_BC85_BP80 | Buy PUT 80 x1 2026-09-18 | iv_format_fraction, iv_overwritten, entry_price_rounded | -29 | -29 | 0 | проверить цену входа |
| 133 | ACN | ACN_BP100_21.08.26 | Buy PUT 100 x4 2026-08-21 | iv_overwritten | -369 | -369 | 0 | ок, наблюдать |
| 134 | XP | XP_BP12_BP14_BC19_BC20_21.08.26 | Buy CALL 20 x1 2026-08-21 | iv_overwritten | -3 | -3 | 0 | ок, наблюдать |

## 3. Сделки с признаком legs_changed

Не обнаружено.

## 4. Формат хранения волатильности

- В долях (impliedVolatility < 1.5): **115** ног
- В процентах (>= 1.5): **19** ног
- Не заполнено: **0** ног
