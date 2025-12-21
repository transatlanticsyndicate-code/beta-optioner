/**
 * Тестовый скрипт для проверки производительности Polygon API
 * Тестирует:
 * 1. Время загрузки страйков для одной даты
 * 2. Максимальное количество параллельных запросов
 * 3. Rate limits
 */

const TICKER = 'AAPL';
const BASE_URL = 'http://localhost:8000';

// Тестовые даты
const TEST_DATES = [
  '2025-10-17',
  '2025-10-31',
  '2025-11-21',
  '2025-12-19',
  '2026-01-16',
  '2026-02-20'
];

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

// Тест 1: Загрузка страйков для одной даты
async function testSingleRequest(date) {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${BASE_URL}/api/polygon/ticker/${TICKER}/options?expiration_date=${date}`);
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    if (response.ok) {
      const data = await response.json();
      const strikesCount = data.options ? new Set(data.options.map(opt => opt.strike)).size : 0;
      
      console.log(`${colors.green}✅ ${date}: ${duration}ms, ${strikesCount} страйков${colors.reset}`);
      return { success: true, duration, strikesCount, date };
    } else {
      console.log(`${colors.red}❌ ${date}: ${response.status} - ${response.statusText}${colors.reset}`);
      return { success: false, duration, date, error: response.statusText };
    }
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`${colors.red}❌ ${date}: ${error.message}${colors.reset}`);
    return { success: false, duration, date, error: error.message };
  }
}

// Тест 2: Последовательная загрузка (один за другим)
async function testSequential() {
  console.log(`\n${colors.cyan}=== ТЕСТ 1: Последовательная загрузка ===${colors.reset}`);
  console.log(`Загружаем страйки для ${TEST_DATES.length} дат по очереди...\n`);
  
  const startTime = Date.now();
  const results = [];
  
  for (const date of TEST_DATES) {
    const result = await testSingleRequest(date);
    results.push(result);
  }
  
  const totalTime = Date.now() - startTime;
  const avgTime = totalTime / TEST_DATES.length;
  const successCount = results.filter(r => r.success).length;
  
  console.log(`\n${colors.blue}📊 Итого:${colors.reset}`);
  console.log(`   Всего времени: ${totalTime}ms`);
  console.log(`   Среднее время: ${avgTime.toFixed(0)}ms на запрос`);
  console.log(`   Успешных: ${successCount}/${TEST_DATES.length}`);
  
  return { totalTime, avgTime, results };
}

// Тест 3: Параллельная загрузка (все сразу)
async function testParallel() {
  console.log(`\n${colors.cyan}=== ТЕСТ 2: Параллельная загрузка (все сразу) ===${colors.reset}`);
  console.log(`Загружаем страйки для ${TEST_DATES.length} дат параллельно...\n`);
  
  const startTime = Date.now();
  
  const promises = TEST_DATES.map(date => testSingleRequest(date));
  const results = await Promise.all(promises);
  
  const totalTime = Date.now() - startTime;
  const successCount = results.filter(r => r.success).length;
  const maxDuration = Math.max(...results.map(r => r.duration));
  
  console.log(`\n${colors.blue}📊 Итого:${colors.reset}`);
  console.log(`   Всего времени: ${totalTime}ms`);
  console.log(`   Макс. время запроса: ${maxDuration}ms`);
  console.log(`   Успешных: ${successCount}/${TEST_DATES.length}`);
  
  return { totalTime, maxDuration, results };
}

// Тест 4: Пакетная загрузка (по N штук)
async function testBatched(batchSize) {
  console.log(`\n${colors.cyan}=== ТЕСТ 3: Пакетная загрузка (по ${batchSize} штук) ===${colors.reset}`);
  console.log(`Загружаем страйки для ${TEST_DATES.length} дат пакетами по ${batchSize}...\n`);
  
  const startTime = Date.now();
  const results = [];
  
  for (let i = 0; i < TEST_DATES.length; i += batchSize) {
    const batch = TEST_DATES.slice(i, i + batchSize);
    console.log(`${colors.yellow}📦 Пакет ${Math.floor(i / batchSize) + 1}: ${batch.join(', ')}${colors.reset}`);
    
    const batchPromises = batch.map(date => testSingleRequest(date));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    console.log('');
  }
  
  const totalTime = Date.now() - startTime;
  const successCount = results.filter(r => r.success).length;
  
  console.log(`${colors.blue}📊 Итого:${colors.reset}`);
  console.log(`   Всего времени: ${totalTime}ms`);
  console.log(`   Успешных: ${successCount}/${TEST_DATES.length}`);
  
  return { totalTime, results };
}

// Тест 5: Стресс-тест (много параллельных запросов)
async function testStress(parallelCount) {
  console.log(`\n${colors.cyan}=== ТЕСТ 4: Стресс-тест (${parallelCount} параллельных запросов) ===${colors.reset}`);
  console.log(`Отправляем ${parallelCount} одинаковых запросов одновременно...\n`);
  
  const testDate = TEST_DATES[0];
  const startTime = Date.now();
  
  const promises = Array(parallelCount).fill(null).map(() => testSingleRequest(testDate));
  const results = await Promise.all(promises);
  
  const totalTime = Date.now() - startTime;
  const successCount = results.filter(r => r.success).length;
  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  
  console.log(`\n${colors.blue}📊 Итого:${colors.reset}`);
  console.log(`   Всего времени: ${totalTime}ms`);
  console.log(`   Среднее время запроса: ${avgDuration.toFixed(0)}ms`);
  console.log(`   Успешных: ${successCount}/${parallelCount}`);
  console.log(`   Неудачных: ${parallelCount - successCount}/${parallelCount}`);
  
  return { totalTime, avgDuration, successCount, failedCount: parallelCount - successCount };
}

// Главная функция
async function main() {
  console.log(`${colors.cyan}╔════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║   ТЕСТИРОВАНИЕ ПРОИЗВОДИТЕЛЬНОСТИ POLYGON API         ║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════════════════╝${colors.reset}`);
  console.log(`\nТикер: ${TICKER}`);
  console.log(`Дат для теста: ${TEST_DATES.length}`);
  console.log(`API: ${BASE_URL}`);
  
  try {
    // Тест 1: Последовательная загрузка
    const seq = await testSequential();
    
    // Тест 2: Параллельная загрузка
    const par = await testParallel();
    
    // Тест 3: Пакетная загрузка (по 3)
    const batch3 = await testBatched(3);
    
    // Тест 4: Пакетная загрузка (по 5)
    const batch5 = await testBatched(5);
    
    // Тест 5: Стресс-тест (10 параллельных)
    const stress10 = await testStress(10);
    
    // Тест 6: Стресс-тест (20 параллельных)
    const stress20 = await testStress(20);
    
    // Итоговая сводка
    console.log(`\n${colors.cyan}╔════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}║                  ИТОГОВАЯ СВОДКА                       ║${colors.reset}`);
    console.log(`${colors.cyan}╚════════════════════════════════════════════════════════╝${colors.reset}\n`);
    
    console.log(`${colors.green}🏆 РЕКОМЕНДАЦИИ:${colors.reset}`);
    console.log(`\n1. Среднее время загрузки одной даты: ${seq.avgTime.toFixed(0)}ms`);
    console.log(`2. Параллельная загрузка ${TEST_DATES.length} дат: ${par.totalTime}ms (vs ${seq.totalTime}ms последовательно)`);
    console.log(`3. Ускорение при параллельной загрузке: ${(seq.totalTime / par.totalTime).toFixed(1)}x`);
    console.log(`4. Оптимальный размер пакета: ${batch3.totalTime < batch5.totalTime ? '3' : '5'} (${Math.min(batch3.totalTime, batch5.totalTime)}ms)`);
    console.log(`5. Стресс-тест 10 запросов: ${stress10.successCount}/${10} успешных`);
    console.log(`6. Стресс-тест 20 запросов: ${stress20.successCount}/${20} успешных`);
    
    if (stress10.failedCount > 0 || stress20.failedCount > 0) {
      console.log(`\n${colors.yellow}⚠️  ВНИМАНИЕ: Обнаружены ошибки при большом количестве параллельных запросов!${colors.reset}`);
      console.log(`   Рекомендуется ограничить количество параллельных запросов до ${stress10.failedCount === 0 ? '10' : '5'}`);
    }
    
  } catch (error) {
    console.error(`\n${colors.red}❌ Ошибка при выполнении тестов:${colors.reset}`, error);
  }
}

// Запуск
main().catch(console.error);
