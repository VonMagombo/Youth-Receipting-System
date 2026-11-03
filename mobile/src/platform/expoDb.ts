import * as SQLite from 'expo-sqlite';
import type { Db, SqlParam } from '../db/schema';

type Conn = Pick<SQLite.SQLiteDatabase, 'runAsync' | 'getAllAsync' | 'getFirstAsync' | 'execAsync'>;

function wrap(conn: Conn, root: SQLite.SQLiteDatabase): Db {
  const self: Db = {
    async run(sql: string, params: SqlParam[] = []) {
      const r = await conn.runAsync(sql, params);
      return { changes: r.changes };
    },
    all: <T,>(sql: string, params: SqlParam[] = []) => conn.getAllAsync<T>(sql, params),
    get: <T,>(sql: string, params: SqlParam[] = []) => conn.getFirstAsync<T>(sql, params),
    exec: (sql: string) => conn.execAsync(sql),
    async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
      let out!: T;
      // Exclusive: no other query can interleave, so receipt numbers stay strictly sequential.
      await root.withExclusiveTransactionAsync(async (txn) => {
        out = await fn(wrap(txn, root));
      });
      return out;
    },
  };
  return self;
}

export async function openAppDb(): Promise<Db> {
  const db = await SQLite.openDatabaseAsync('youth-receipts.db');
  await db.execAsync('PRAGMA journal_mode = WAL;');
  return wrap(db, db);
}
