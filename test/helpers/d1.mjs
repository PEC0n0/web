import { DatabaseSync } from 'node:sqlite';

// Use actual SQLite semantics while matching D1's documented BLOB conversion.
export class TestD1 {
  constructor(path = ':memory:') {
    this.sqlite = new DatabaseSync(path);
    this.sqlite.exec('PRAGMA foreign_keys=ON');
  }
  prepare(sql) {
    const database = this.sqlite;
    let parameters = [];
    const values = () => parameters.map(value => value instanceof ArrayBuffer ? new Uint8Array(value) : value);
    const convert = row => row ? Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value instanceof Uint8Array ? Array.from(value) : value])) : null;
    const query = {
      bind(...args) { parameters = args; return query; },
      execute() { const result = database.prepare(sql).run(...values()); return { success: true, results: [], meta: { changes: result.changes, last_row_id: Number(result.lastInsertRowid) } }; },
      async run() { return query.execute(); },
      async first(column) { const row = convert(database.prepare(sql).get(...values())); return column ? row?.[column] ?? null : row; },
      async all() { return { success: true, results: database.prepare(sql).all(...values()).map(convert), meta: {} }; },
    };
    return query;
  }
  async batch(queries) {
    this.sqlite.exec('BEGIN');
    try { const results = queries.map(query => query.execute()); this.sqlite.exec('COMMIT'); return results; }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
  legacySchema() {
    this.sqlite.exec(`CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,page_id TEXT,nickname TEXT,content TEXT,created_at TEXT,parent_id INTEGER,
      ip TEXT,ua TEXT,device_model TEXT,device_os TEXT
    ); CREATE TABLE IF NOT EXISTS likes (page_id TEXT PRIMARY KEY,count INTEGER NOT NULL DEFAULT 0);`);
  }
  close() { this.sqlite.close(); }
}
