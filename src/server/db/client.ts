import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const DEFAULT_URL = 'postgres://postgres@127.0.0.1:55432/salon_area_coach';

// dev HMR でコネクションが増殖しないよう globalThis に保持する
const globalForDb = globalThis as unknown as {
  __salonDbClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__salonDbClient ?? postgres(process.env.DATABASE_URL ?? DEFAULT_URL, { max: 5 });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__salonDbClient = client;
}

export const db = drizzle(client, { schema });
export type Db = typeof db;
