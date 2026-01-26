const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  // Pobierz commit hash
  const commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  
  // Pobierz datę commita
  const commitDate = execSync('git log -1 --format="%cd" --date=short', { encoding: 'utf8' }).trim().replace(/-/g, '');
  
  // Pobierz opis commita
  const commitMessage = execSync('git log -1 --format="%s"', { encoding: 'utf8' }).trim();
  
  const versionInfo = {
    hash: commitHash,
    date: commitDate,
    message: commitMessage,
    buildTime: new Date().toISOString()
  };
  
  // Zapisz do pliku JSON
  const versionPath = path.join(__dirname, '..', 'public', 'version.json');
  fs.writeFileSync(versionPath, JSON.stringify(versionInfo, null, 2));
  
  console.log('Version info generated:', versionInfo);
} catch (error) {
  console.error('Error generating version info:', error);
  // Fallback version
  const fallback = {
    hash: 'unknown',
    date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
    message: 'Version info not available',
    buildTime: new Date().toISOString()
  };
  const versionPath = path.join(__dirname, '..', 'public', 'version.json');
  fs.writeFileSync(versionPath, JSON.stringify(fallback, null, 2));
}