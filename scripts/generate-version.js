const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runGitCommand(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return null;
  }
}

function generateVersion() {
  const versionPath = path.join(__dirname, '..', 'public', 'version.json');
  
  // Pobierz dane z git
  const commitHash = runGitCommand('git rev-parse --short HEAD');
  const commitDate = runGitCommand('git log -1 --format=%cd --date=short');
  const commitMessage = runGitCommand('git log -1 --format=%s');
  
  if (commitHash && commitDate && commitMessage) {
    const versionInfo = {
      hash: commitHash,
      date: commitDate.replace(/-/g, ''),
      message: commitMessage.substring(0, 50), // Max 50 znaków
      buildTime: new Date().toISOString()
    };
    
    fs.writeFileSync(versionPath, JSON.stringify(versionInfo, null, 2));
    console.log('✅ Version info generated:', versionInfo);
    return versionInfo;
  } else {
    // Spróbuj odczytać istniejący version.json
    try {
      const existing = JSON.parse(fs.readFileSync(versionPath, 'utf8'));
      if (existing.hash && existing.hash !== 'unknown') {
        console.log('ℹ️ Using existing version info:', existing);
        return existing;
      }
    } catch (e) {}
    
    // Fallback
    const fallback = {
      hash: 'dev',
      date: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      message: 'Development build',
      buildTime: new Date().toISOString()
    };
    fs.writeFileSync(versionPath, JSON.stringify(fallback, null, 2));
    console.log('⚠️ Git not available, using fallback:', fallback);
    return fallback;
  }
}

generateVersion();