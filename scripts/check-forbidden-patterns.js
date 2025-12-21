#!/usr/bin/env node

/**
 * Скрипт проверки запрещенных практик в коде
 * ЗАЧЕМ: Автоматический поиск mock данных, хардкода, console.log и других антипаттернов
 * Использование: node scripts/check-forbidden-patterns.js [--all]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FORBIDDEN_PATTERNS = [
  {
    pattern: /mock\w*\s*=\s*\[/gi,
    message: '🚫 Найдены mock данные (массивы)',
    severity: 'error',
    exclude: ['test', 'spec', '__tests__', 'mocks']
  },
  {
    pattern: /mock\w*\s*=\s*\{/gi,
    message: '🚫 Найдены mock данные (объекты)',
    severity: 'error',
    exclude: ['test', 'spec', '__tests__', 'mocks']
  },
  {
    pattern: /fake\w*(Data|Response|Api)/gi,
    message: '🚫 Найдена имитация данных',
    severity: 'error',
    exclude: ['test', 'spec', '__tests__']
  },
  {
    pattern: /Math\.random\(\)/g,
    message: '⚠️  Найдена генерация случайных данных',
    severity: 'warning',
    exclude: ['test', 'spec', '__tests__']
  },
  {
    pattern: /import.*faker/gi,
    message: '🚫 Использование faker.js в production коде',
    severity: 'error',
    exclude: ['test', 'spec', '__tests__']
  },
  {
    pattern: /TODO:|FIXME:|HACK:/gi,
    message: '⚠️  Найдены TODO/FIXME/HACK комментарии',
    severity: 'warning',
    exclude: []
  },
  {
    pattern: /console\.(log|debug|info)/g,
    message: '⚠️  Найдены console.log (должны быть удалены перед production)',
    severity: 'warning',
    exclude: ['test', 'spec', '__tests__']
  },
  {
    pattern: /debugger;/g,
    message: '🚫 Найден debugger statement',
    severity: 'error',
    exclude: ['test', 'spec', '__tests__']
  }
];

const EXCLUDED_PATTERNS = [
  'node_modules',
  'build',
  'dist',
  '.next',
  'venv',
  '.venv',
  '__pycache__',
  '.git',
  'coverage',
];

function shouldCheckFile(filePath) {
  const ext = path.extname(filePath);
  if (!['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
    return false;
  }
  
  return !EXCLUDED_PATTERNS.some(pattern => filePath.includes(pattern));
}

function findLineNumbers(content, pattern) {
  const lines = content.split('\n');
  const matches = [];
  
  lines.forEach((line, index) => {
    if (pattern.test(line)) {
      matches.push(index + 1);
    }
  });
  
  return matches;
}

function checkFile(filePath) {
  if (!shouldCheckFile(filePath)) return [];
  if (!fs.existsSync(filePath)) return [];
  
  const content = fs.readFileSync(filePath, 'utf8');
  const violations = [];
  
  FORBIDDEN_PATTERNS.forEach(({ pattern, message, severity, exclude }) => {
    // Проверяем исключения для конкретного паттерна
    const shouldExclude = exclude.some(exc => filePath.includes(exc));
    if (shouldExclude) return;
    
    const matches = content.match(pattern);
    if (matches) {
      const lines = findLineNumbers(content, pattern);
      violations.push({
        file: filePath,
        message,
        severity,
        count: matches.length,
        lines: lines.slice(0, 5) // Показываем только первые 5 совпадений
      });
    }
  });
  
  return violations;
}

function getAllFiles() {
  try {
    const output = execSync(
      'find . -type f \\( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \\)',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    return [];
  }
}

function getChangedFiles() {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    return [];
  }
}

function checkForbiddenPatterns(checkAll = false) {
  console.log('🔍 Проверка запрещенных практик в коде...\n');
  
  const files = checkAll ? getAllFiles() : getChangedFiles();
  
  if (files.length === 0) {
    console.log('ℹ️  Нет файлов для проверки\n');
    return;
  }
  
  const allViolations = [];
  let checkedFiles = 0;
  
  for (const file of files) {
    const violations = checkFile(file);
    if (violations.length > 0) {
      allViolations.push(...violations);
    }
    if (shouldCheckFile(file)) {
      checkedFiles++;
    }
  }
  
  console.log(`📊 Проверено файлов: ${checkedFiles}\n`);
  
  if (allViolations.length === 0) {
    console.log('✅ Запрещенные практики не найдены\n');
    return;
  }
  
  // Группируем по файлам
  const violationsByFile = {};
  allViolations.forEach(v => {
    if (!violationsByFile[v.file]) {
      violationsByFile[v.file] = [];
    }
    violationsByFile[v.file].push(v);
  });
  
  // Выводим результаты
  const errors = allViolations.filter(v => v.severity === 'error');
  const warnings = allViolations.filter(v => v.severity === 'warning');
  
  if (errors.length > 0) {
    console.log('❌ ОШИБКИ (критические проблемы):\n');
    Object.entries(violationsByFile).forEach(([file, violations]) => {
      const fileErrors = violations.filter(v => v.severity === 'error');
      if (fileErrors.length > 0) {
        console.log(`📄 ${file}`);
        fileErrors.forEach(v => {
          console.log(`   ${v.message}`);
          console.log(`   └─ Найдено: ${v.count} совпадений на строках: ${v.lines.join(', ')}`);
        });
        console.log('');
      }
    });
  }
  
  if (warnings.length > 0) {
    console.log('⚠️  ПРЕДУПРЕЖДЕНИЯ:\n');
    Object.entries(violationsByFile).forEach(([file, violations]) => {
      const fileWarnings = violations.filter(v => v.severity === 'warning');
      if (fileWarnings.length > 0) {
        console.log(`📄 ${file}`);
        fileWarnings.forEach(v => {
          console.log(`   ${v.message}`);
          console.log(`   └─ Найдено: ${v.count} совпадений на строках: ${v.lines.join(', ')}`);
        });
        console.log('');
      }
    });
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Найдено: ${errors.length} ошибок, ${warnings.length} предупреждений`);
  console.log(`Затронуто файлов: ${Object.keys(violationsByFile).length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  if (errors.length > 0) {
    console.log('📖 Рекомендации:');
    console.log('   - Удалите mock данные из production кода');
    console.log('   - Замените хардкод на константы');
    console.log('   - Удалите console.log и debugger statements');
    console.log('   См. docs/MODULAR_CODE_METHODOLOGY.md\n');
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const checkAll = args.includes('--all') || args.includes('-a');

checkForbiddenPatterns(checkAll);
