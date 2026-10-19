// Run with pg@8.16.3 installed in the trusted deployment build environment.
// Credentials stay in Vercel environment variables and are never printed.
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const project = new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
const connection = new URL(process.env.POSTGRES_URL);
const username = decodeURIComponent(connection.username);
if (connection.hostname !== `db.${project}.supabase.co` && !username.endsWith(`.${project}`)) {
  throw new Error('Database project does not match the application project.');
}
for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'])
  connection.searchParams.delete(key);
const client = new pg.Client({
  connectionString: connection.toString(),
  ssl: { rejectUnauthorized: true },
  connectionTimeoutMillis: 10_000,
});
let connected = false;
try {
  await client.connect();
  connected = true;
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '30s'");
  const sql = await readFile(
    new URL(
      '../supabase/migrations/20261013210638_network_activity_xrp_totals.sql',
      import.meta.url,
    ),
    'utf8',
  );
  await client.query(sql);
  const { rows } = await client.query(
    "SELECT 'mainnet' AS network, * FROM public.platform_stats_by_network('mainnet') UNION ALL SELECT 'testnet', * FROM public.platform_stats_by_network('testnet') UNION ALL SELECT 'devnet', * FROM public.platform_stats_by_network('devnet')",
  );
  await client.query('COMMIT');
  console.log('Activity migration applied. Aggregate totals:', JSON.stringify(rows));
} catch (error) {
  if (connected) await client.query('ROLLBACK').catch(() => undefined);
  const code =
    typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code) ? error.code : 'UNKNOWN';
  throw new Error(`Activity migration failed (${code}); database changes were rolled back.`);
} finally {
  await client.end().catch(() => undefined);
}
