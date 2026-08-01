#!/usr/bin/env node

/**
 * Скрипт проверки затенённых модулей (файл X.jsx рядом с каталогом X/index.*)
 * ЗАЧЕМ: react-scripts 5 резолвит ФАЙЛ раньше КАТАЛОГА при импорте './X'.
 * Если рядом лежат X.jsx и X/index.jsx — каталог мёртв, но выглядит живым,
 * и правки в него молча уходят в пустоту (см. инцидент с OptionsTable/index.jsx:
 * коммиты 8b94cad, ed655bd, 25ea878 — правки в мёртвый каталог).
 * Использование: node scripts/check-shadowed-modules.js
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'frontend', 'src');

const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
const INDEX_NAMES = CODE_EXTENSIONS.map(ext => `index${ext}`);

const EXCLUDED_DIR_NAMES = ['node_modules', 'build', 'dist', '.next', 'coverage', '.git'];

// Список легитимных исключений (относительный путь от frontend/src),
// на случай если где-то сосуществование файла и каталога сделано осознанно.
// Формат: 'components/Example' (без расширения и без /index.*)
const ALLOWED_EXCEPTIONS = [];

function walk(dir, files) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (EXCLUDED_DIR_NAMES.includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
}

function findShadowedModules() {
  if (!fs.existsSync(SRC_DIR)) {
    console.log(`ℹ️  Каталог не найден: ${SRC_DIR}\n`);
    return [];
  }

  const allFiles = [];
  walk(SRC_DIR, allFiles);

  const fileSet = new Set(allFiles);
  const violations = [];
  const seen = new Set();

  for (const filePath of allFiles) {
    const ext = path.extname(filePath);
    if (!CODE_EXTENSIONS.includes(ext)) continue;

    const base = path.basename(filePath, ext);
    if (base === 'index') continue; // сам index-файл не считается

    const dir = path.dirname(filePath);
    const candidateDir = path.join(dir, base);

    if (!fs.existsSync(candidateDir)) continue;
    if (!fs.statSync(candidateDir).isDirectory()) continue;

    const hasIndex = INDEX_NAMES.some(name => fileSet.has(path.join(candidateDir, name)));
    if (!hasIndex) continue;

    const relativeKey = path.relative(SRC_DIR, path.join(dir, base));
    if (ALLOWED_EXCEPTIONS.includes(relativeKey)) continue;
    if (seen.has(relativeKey)) continue;
    seen.add(relativeKey);

    violations.push({
      file: path.relative(process.cwd(), filePath),
      dir: path.relative(process.cwd(), candidateDir),
    });
  }

  return violations;
}

function checkShadowedModules() {
  console.log('🔍 Проверка затенённых модулей (X.jsx рядом с X/index.*)...\n');

  const violations = findShadowedModules();

  if (violations.length === 0) {
    console.log('✅ Затенённых модулей не найдено\n');
    return;
  }

  console.log('❌ Найдены затенённые каталоги (резолвер импортирует файл, каталог мёртв):\n');
  violations.forEach(({ file, dir }) => {
    console.log(`   ${dir}/`);
    console.log(`   └─ затенён файлом: ${file}\n`);
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`❌ Найдено ${violations.length} затенённых каталог(ов)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📖 Что делать:');
  console.log('   - Если каталог не нужен — удалите его.');
  console.log('   - Если каталог нужен — удалите одноимённый файл и перенесите импорты на него.');
  console.log('   - Если сосуществование сделано осознанно — добавьте путь в ALLOWED_EXCEPTIONS');
  console.log('     в scripts/check-shadowed-modules.js.\n');
  process.exit(1);
}

checkShadowedModules();
