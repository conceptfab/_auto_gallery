/**
 * Interaktywny commit z aktualizacją wersji
 * Po uruchomieniu pyta o wersję i opis
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function run(command, options = {}) {
  try {
    const result = execSync(command, { 
      encoding: 'utf8', 
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options 
    });
    return result ? result.trim() : '';
  } catch (error) {
    if (!options.ignoreError) {
      console.error(`❌ Błąd: ${error.message}`);
      process.exit(1);
    }
    return null;
  }
}

function getCurrentVersion() {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return pkg.version || '0.1.0';
}

function updatePackageVersion(newVersion) {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  pkg.version = newVersion;
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n');
}

async function main() {
  console.log('\n🚀 Automatyczny commit\n');

  // Sprawdź czy są zmiany
  const status = run('git status --porcelain', { silent: true });
  if (!status) {
    console.log('ℹ️ Brak zmian do commitu');
    rl.close();
    process.exit(0);
  }

  // Pokaż zmiany
  console.log('📋 Zmienione pliki:');
  run('git status --short');
  console.log('');

  // Pobierz aktualną wersję
  const currentVersion = getCurrentVersion();
  
  // Zapytaj o wersję
  const version = await ask(`📦 Wersja (obecna: ${currentVersion}): `);
  if (!version.trim()) {
    console.log('❌ Wersja jest wymagana');
    rl.close();
    process.exit(1);
  }

  // Zapytaj o opis
  const message = await ask('📝 Opis zmian: ');
  if (!message.trim()) {
    console.log('❌ Opis jest wymagany');
    rl.close();
    process.exit(1);
  }

  rl.close();
  
  console.log('\n⏳ Tworzenie commitu...\n');

  // Zaktualizuj package.json
  updatePackageVersion(version.trim());
  console.log(`📦 package.json → v${version.trim()}`);

  // Dodaj wszystkie zmiany
  run('git add -A', { silent: true });

  // Stwórz commit
  const fullMessage = `v${version.trim()}: ${message.trim()}`;
  run(`git commit -m "${fullMessage}"`, { silent: true });

  // Wygeneruj version.json
  console.log('📝 Generowanie version.json...');
  run('node scripts/generate-version.js', { silent: true });

  // Dodaj version.json do commita
  run('git add public/version.json', { silent: true });
  run('git commit --amend --no-edit', { silent: true });

  // Pokaż wynik
  const hash = run('git rev-parse --short HEAD', { silent: true });
  
  console.log('\n✅ Commit utworzony!');
  console.log(`   Wersja: v${version.trim()}`);
  console.log(`   Opis: ${message.trim()}`);
  console.log(`   Hash: ${hash}`);
  console.log('\n💡 Aby wypchnąć: git push\n');
}

main();
