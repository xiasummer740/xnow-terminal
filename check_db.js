/**
 * 检查 SQLite 数据库中的书签和配置数据
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const home = process.env.APPDATA;
const dbs = [
  path.join(home, 'electerm', 'users', 'default_user', 'electerm.db'),
  path.join(home, 'xnow-terminal', 'electerm.db'),
  path.join(home, 'xnow-terminal', 'electerm_data.db')
];

for (const dbPath of dbs) {
  console.log(`\n=== ${path.basename(dbPath)} (${dbPath}) ===`);
  try {
    const db = new DatabaseSync(dbPath);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Tables:', tables.map(t => t.name).join(', '));

    for (const t of tables) {
      try {
        const count = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).all();
        console.log(`  ${t.name}: ${count[0].c} rows`);

        const sample = db.prepare(`SELECT * FROM "${t.name}" LIMIT 2`).all();
        if (sample.length > 0) {
          console.log('    keys:', Object.keys(sample[0]).join(', '));

          // 检查是否有书签或配置数据
          const rowStr = JSON.stringify(sample[0]).substring(0, 300);
          if (rowStr.includes('bookmark') || rowStr.includes('baseURL') || rowStr.includes('modelAI') || rowStr.includes('ssh')) {
            console.log('    CONTAINS RELEVANT DATA:', rowStr);
          }
        }
      } catch(e) {
        console.log(`  ${t.name}: error - ${e.message}`);
      }
    }
    db.close();
  } catch(e) {
    console.log('Error:', e.message);
  }
}
