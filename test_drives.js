const { execSync } = require('child_process');
try {
  const out = execSync('powershell -c "Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Root"', { encoding: 'utf8', timeout: 5000 });
  const drives = out.split(/\r?\n/).map(l => l.trim()).filter(l => /^[A-Z]:\\$/i.test(l));
  console.log('Drives:', JSON.stringify(drives));
} catch(e) {
  console.error('Error:', e.message);
}
