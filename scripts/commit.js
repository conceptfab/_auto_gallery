/**
 * Szybki interaktywny commit z aktualizacją wersji
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, r));
const git = cmd => execSync(`git ${cmd}`, { encoding: 'utf8', stdio: 'pipe' }).trim();

const pkgPath = path.join(__dirname, '..', 'package.json');
const verPath = path.join(__dirname, '..', 'public', 'version.json');

async function main() {
  console.log('\n🚀 Commit\n');

  // Sprawdź zmiany
  try {
    const status = git('status --porcelain');
    if (!status) {
      console.log('ℹ️ Brak zmian');
      return rl.close();
    }
    console.log('📋 Zmiany:\n' + git('status --short') + '\n');
  } catch { 
    console.log('❌ Git error'); 
    return rl.close(); 
  }

  // Pobierz wersję
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const ver = await ask(`📦 Wersja (${pkg.version}): `);
  const msg = await ask('📝 Opis: ');
  rl.close();

  if (!ver.trim() || !msg.trim()) {
    return console.log('❌ Wersja i opis wymagane');
  }

  console.log('\n⏳ Commit...');

  // Update package.json
  pkg.version = ver.trim();
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  // Commit wszystko
  git('add -A');
  git(`commit -m "v${ver.trim()}: ${msg.trim()}"`);

  // Update version.json z nowym hashem
  const hash = git('rev-parse --short HEAD');
  const date = git('log -1 --format=%cd --date=short').replace(/-/g, '');
  fs.writeFileSync(verPath, JSON.stringify({
    hash, date,
    message: `v${ver.trim()}: ${msg.trim()}`.substring(0, 50),
    buildTime: new Date().toISOString()
  }, null, 2));

  // Amend z version.json
  git('add public/version.json');
  git('commit --amend --no-edit');

  console.log(`\n✅ v${ver.trim()}: ${msg.trim()}`);
  console.log(`   Hash: ${git('rev-parse --short HEAD')}`);
  console.log('\n💡 git push\n');
}

main();
