import { Client } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUPABASE_DIR = resolve(__dirname, '..', 'supabase', 'migrations');

const REF = process.env.SB_REF;
const PASS = process.env.SB_DB_PASSWORD;
const REGION = process.env.SB_REGION;

if (!REF || !PASS || !REGION) {
  console.error('Faltan SB_REF, SB_REGION o SB_DB_PASSWORD');
  process.exit(1);
}

const HOSTS = [
  `aws-0-${REGION}.pooler.supabase.com`,
  `aws-0-${REGION}.pooler.supabase.com`,
];

async function conectar(host, port) {
  const client = new Client({
    host,
    port,
    user: `postgres.${REF}`,
    password: PASS,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await client.connect();
  return client;
}

let client = null;
let elegido = null;

for (const host of HOSTS) {
  for (const port of [5432, 6543]) {
    try {
      client = await conectar(host, port);
      elegido = `${host}:${port}`;
      break;
    } catch (e) {
      const m = e.message || '';
      if (/password authentication failed/i.test(m)) {
        console.error(`  ${host}:${port}  CONTRASENA INCORRECTA`);
        if (client) { try { await client.end(); } catch {} client = null; }
        continue;
      }
      console.log(`  ${host}:${port}  fallo: ${m.split('\n')[0]}`);
      if (client) { try { await client.end(); } catch {} client = null; }
    }
  }
  if (client) break;
}

if (!client) {
  console.error('\nNo se pudo conectar. Revisa SUPABASE_DB_PASSWORD en .env');
  process.exit(1);
}

console.log(`Conectado: ${elegido}`);

const yaAplicadas = new Set();

// El proyecto nuevo no tiene la tabla de control: se crea si falta.
await client.query(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version    text primary key,
    name       text,
    statements integer,
    applied_at timestamptz not null default now()
  );
`);
const r = await client.query('select version from supabase_migrations.schema_migrations');
r.rows.forEach(x => yaAplicadas.add(x.version));
console.log(`Ya aplicadas: ${[...yaAplicadas].join(', ') || 'ninguna'}`);

const archivos = readdirSync(SUPABASE_DIR).filter(f => f.endsWith('.sql')).sort();
for (const archivo of archivos) {
  const version = archivo.split('_')[0];
  if (yaAplicadas.has(version)) {
    console.log(`  ${archivo}  ya aplicada, se omite`);
    continue;
  }
  const sql = readFileSync(resolve(SUPABASE_DIR, archivo), 'utf8');
  const client2 = await conectar(elegido.split(':')[0], Number(elegido.split(':')[1]));
  try {
    await client2.query('BEGIN');
    await client2.query(sql);
    await client2.query(
      `insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)
       on conflict (version) do nothing`,
      [version, archivo.split('_').slice(1).join('_').replace('.sql', '')]
    );
    await client2.query('COMMIT');
    console.log(`  ${archivo}  APLICADA`);
  } catch (e) {
    await client2.query('ROLLBACK').catch(() => {});
    console.error(`  ${archivo}  ERROR: ${e.message.split('\n')[0]}`);
    process.exitCode = 1;
  } finally {
    await client2.end();
  }
}

await client.end();
console.log('Listo.');
