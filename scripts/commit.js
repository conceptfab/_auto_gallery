/**
 * Interaktywny commit z logami
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const pkgPath = path.join(__dirname, '..', 'package.json');
const verPath = path.join(__dirname, '..', 'public', 'version.json');

function log(msg) {
  // Logging disabled for production
}

function git(cmd) {
  log(`GIT: ${cmd}`);
  try {
    const result = execSync(`git ${cmd}`, { encoding: 'utf8', timeout: 10000 });
    log(`GIT OK`);
    return result.trim();
  } catch (e) {
    log(`GIT ERROR: ${e.message}`);
    throw e;
  }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise(resolve => {
    log(`PYTANIE: ${question}`);
    rl.question(question, answer => {
      log(`ODPOWIEDŹ: ${answer}`);
      resolve(answer);
    });
  });
}

async function main() {
  log('START');
  
  try {
    log('Sprawdzam status git...');
    const status = git('status --porcelain');
    
    if (!status) {
      log('Brak zmian');
      rl.close();
      return;
    }
    
    console.log('\n📋 Zmiany:');
    console.log(status);
    console.log('');

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    log(`Obecna wersja: ${pkg.version}`);

    const ver = await ask(`📦 Wersja (${pkg.version}): `);
    log(`Wpisana wersja: "${ver}"`);
    
    const msg = await ask('📝 Opis: ');
    log(`Wpisany opis: "${msg}"`);
    
    rl.close();
    log('readline zamknięty');

    if (!ver.trim() || !msg.trim()) {
      log('Brak wersji lub opisu - koniec');
      return;
    }

    log('Aktualizuję package.json...');
    pkg.version = ver.trim();
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    log('package.json zapisany');

    log('git add -A...');
    git('add -A');

    log('git commit...');
    git(`commit -m "v${ver.trim()}: ${msg.trim()}"`);

    log('Pobieram hash...');
    const hash = git('rev-parse --short HEAD');
    
    log('Pobieram datę...');
    const date = git('log -1 --format=%cd --date=short').replace(/-/g, '');

    log('Zapisuję version.json...');
    fs.writeFileSync(verPath, JSON.stringify({
      hash, date,
      message: `v${ver.trim()}: ${msg.trim()}`.substring(0, 50),
      buildTime: new Date().toISOString()
    }, null, 2));
    log('version.json zapisany');

    log('git add version.json...');
    git('add public/version.json');

    log('git commit --amend...');
    git('commit --amend --no-edit');

    log('Pobieram finalny hash...');
    const finalHash = git('rev-parse --short HEAD');

    console.log(`\n✅ v${ver.trim()}: ${msg.trim()}`);
    console.log(`   Hash: ${finalHash}`);
    
    log('git push...');
    try {
      git('push');
    } catch (e) {
      log('Push failed, trying force push...');
      git('push --force');
    }
    
    console.log('\n🚀 Wypchnięto na GitHub!\n');
    log('KONIEC - sukces');

  } catch (error) {
    log(`BŁĄD: ${error.message}`);
    console.error('\n❌ Błąd:', error.message);
    rl.close();
  }
}

main();
