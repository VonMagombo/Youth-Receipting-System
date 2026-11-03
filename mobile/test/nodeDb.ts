import { DatabaseSync } from 'node:sqlite';
import type { Db, SqlParam } from '../src/db/schema';

/** node:sqlite adapter implementing the same Db interface as the expo-sqlite adapter. */
export function nodeDb(): Db {
  const d = new DatabaseSync(':memory:');
  const self: Db = {
    async run(sql: string, params: SqlParam[] = []) {
      const r = d.prepare(sql).run(...params);
      return { changes: Number(r.changes) };
    },
    async all<T>(sql: string, params: SqlParam[] = []) {
      return d.prepare(sql).all(...params) as T[];
    },
    async get<T>(sql: string, params: SqlParam[] = []) {
      return (d.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async exec(sql: string) {
      d.exec(sql);
    },
    async transaction<T>(fn: (tx: Db) => Promise<T>) {
      d.exec('BEGIN IMMEDIATE');
      try {
        const out = await fn(self);
        d.exec('COMMIT');
        return out;
      } catch (e) {
        d.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return self;
}
