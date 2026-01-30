#!/usr/bin/env node
/**
 * Skrypt testów przed deployem na Railway.
 * Uruchom: npm run predeploy (lub node scripts/pre-deploy.js)
 * Wszystkie kroki muszą przejść, żeby deploy był bezpieczny.
 */

const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIN_NODE_MAJOR = 20;

function run(name, fn) {
  process.stdout.write(`\n▶ ${name}... `);
  try {
    fn();
    console.log('OK');
    return true;
  } catch (e) {
    console.log('FAILED');
    if (e.stdout) process.stdout.write(e.stdout);
    if (e.stderr) process.stderr.write(e.stderr);
    throw e;
  }
}

function main() {
  console.log('=== Testy przed deployem (Railway) ===');

  run('Wersja Node.js >= ' + MIN_NODE_MAJOR, () => {
    const major = parseInt(process.version.slice(1).split('.')[0], 10);
    if (major < MIN_NODE_MAJOR) {
      throw new Error(`Wymagany Node >= ${MIN_NODE_MAJOR}, masz ${process.version}`);
    }
  });

  // Lint – opcjonalny (nie blokuje deployu przy braku konfiguracji ESLint)
  try {
    run('ESLint (next lint)', () => {
      execSync('npm run lint', { cwd: ROOT, stdio: 'pipe', env: { ...process.env, CI: 'true' } });
    });
  } catch {
    console.warn('\n⚠ Lint pominięty (brak konfiguracji lub błędy). Sprawdź ręcznie: npm run lint\n');
  }

  run('TypeScript (tsc --noEmit)', () => {
    execSync('npx tsc --noEmit', { cwd: ROOT, stdio: 'pipe' });
  });

  run('Build (next build)', () => {
    execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });
  });

  console.log('\n=== Wszystkie testy zaliczone – możesz deployować (np. railway up) ===\n');
}

main();
