const { app } = require('electron');
const Database = require('better-sqlite3');
const path = require('path');

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath('appData'), 'electerm', 'users', 'default_user', 'electerm.db');
  console.log('DB Path:', dbPath);

  const db = new Database(dbPath);

  // Find bookmark with 154.9.238.163
  const bm = db.prepare("SELECT _id, host, port, username, authType FROM bookmarks WHERE host LIKE '%154.9.238%'").all();
  console.log('Bookmark:', JSON.stringify(bm, null, 2));

  // Show all bookmarks
  const all = db.prepare("SELECT _id, host, port, username, authType FROM bookmarks").all();
  console.log('\nAll bookmarks:');
  all.forEach(b => console.log(`  ${b._id}: ${b.host}:${b.port} ${b.username} [${b.authType}]`));

  db.close();
  app.quit();
});
