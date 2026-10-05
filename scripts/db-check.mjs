import { Client } from 'pg';

const client = new Client({
  host: `aws-0-${process.env.SB_REGION}.pooler.supabase.com`,
  port: 5432,
  user: `postgres.${process.env.SB_REF}`,
  password: process.env.SB_DB_PASSWORD,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});
await client.connect();

const t = await client.query(`
  select table_name from information_schema.tables
  where table_schema='public' and table_type='BASE TABLE' order by table_name`);
console.log(`Tablas (${t.rowCount}): ${t.rows.map(r => r.table_name).join(', ')}`);

const p = await client.query(`
  select count(*)::int n, bool_and(rowsecurity) todos
  from pg_tables where schemaname='public'`);
console.log(`RLS activo en todas: ${p.rows[0].todos}  (${p.rows[0].n} tablas)`);

const pol = await client.query(`select count(*)::int n from pg_policies where schemaname='public'`);
console.log(`Politicas: ${pol.rows[0].n}`);

const f = await client.query(`
  select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
  where ns.nspname='public'`);
console.log(`Funciones: ${f.rows[0].n}`);

const em = await client.query(`select ruc, razon_social, igv_rate from emisor`);
console.log(`Emisor: ${em.rows.map(r => `${r.razon_social} (${r.ruc}) IGV ${r.igv_rate}`).join(', ')}`);

const s = await client.query(`select tipo_documento, serie, descripcion from series order by serie`);
console.log(`Series: ${s.rows.map(r => `${r.serie} (${r.tipo_documento}) ${r.descripcion}`).join(', ')}`);

for (const tabla of ['productos', 'ventas', 'clientes', 'profiles']) {
  const c = await client.query(`select count(*)::int n from ${tabla}`);
  console.log(`Filas en ${tabla}: ${c.rows[0].n}`);
}

const trig = await client.query(`
  select tgname from pg_trigger where not tgisinternal and tgname like '%perfil%'`);
console.log(`Triggers de seguridad: ${trig.rows.map(r => r.tgname).join(', ') || 'NINGUNO'}`);

const m = await client.query(`select version, name from supabase_migrations.schema_migrations order by version`);
console.log(`Migraciones aplicadas: ${m.rowCount}`);

await client.end();
