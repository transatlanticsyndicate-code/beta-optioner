#!/usr/bin/env node

/**
 * Скрипт проверки размера файлов (правило 300 строк)
 * ЗАЧЕМ: Автоматическая проверка соблюдения методологии модульного кода
 * Использование: node scripts/check-file-size.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MAX_LINES = 300;
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
  '.config.js',
  '.config.ts',
  'tailwind.config',
  'postcss.config',
];

function shouldCheckFile(filePath) {
  const ext = path.extname(filePath);
  if (!['.js', '.jsx', '.ts', '.tsx', '.py'].includes(ext)) {
    return false;
  }
  
  return !EXCLUDED_PATTERNS.some(pattern => filePath.includes(pattern));
}

function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.split('\n').length;
  } catch (error) {
    return 0;
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

function getAllFiles() {
  try {
    const output = execSync(
      'find . -type f \\( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" -o -name "*.py" \\)',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    return [];
  }
}

function checkFileSize(checkAll = false) {
  console.log('🔍 Проверка размера файлов (макс 300 строк)...\n');
  
  let files = checkAll ? getAllFiles() : getChangedFiles();
  
  if (files.length === 0) {
    console.log('ℹ️  Нет файлов для проверки\n');
    return;
  }
  
  const violations = [];
  const checkedFiles = [];
  
  for (const file of files) {
    if (!shouldCheckFile(file)) continue;
    if (!fs.existsSync(file)) continue;
    
    const lines = countLines(file);
    checkedFiles.push(file);
    
    if (lines > MAX_LINES) {
      violations.push({ file, lines });
    }
  }
  
  console.log(`📊 Проверено файлов: ${checkedFiles.length}\n`);
  
  if (violations.length > 0) {
    console.log('❌ Найдены файлы превышающие лимит:\n');
    violations.forEach(({ file, lines }) => {
      const excess = lines - MAX_LINES;
      const percentage = Math.round((excess / MAX_LINES) * 100);
      console.log(`   ${file}`);
      console.log(`   └─ ${lines} строк (превышение: +${excess} строк, +${percentage}%)\n`);
    });
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`❌ Найдено ${violations.length} файл(ов) превышающих ${MAX_LINES} строк`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📖 Инструкция по рефакторингу:');
    console.log('   См. docs/MODULAR_CODE_METHODOLOGY.md\n');
    process.exit(1);
  }
  
  console.log('✅ Все файлы соответствуют лимиту 300 строк\n');
}

const args = process.argv.slice(2);
const checkAll = args.includes('--all') || args.includes('-a');

checkFileSize(checkAll);
