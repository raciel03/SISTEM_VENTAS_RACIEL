/**
 * Conecta a la base por el pooler y ejecuta SOLO lecturas de la lista VERIFICAR.
 * No escribe nada en la base. La contraseña se recibe por variable de
 * entorno SB_DB_PASSWORD para no dejarla escrita en ningun archivo.
 *
 * Uso:  $env:SB_DB_PASSWORD='...' ; node scripts/db-verificar.mjs
 */
import { Client } from 'pg';

const REF = 'yeptjlamcfyjeoqwaxib';
const REGION = 'ca-central-1';
const PASS = process.env.SB_DB_PASSWORD;

if (!PASS) {
  console.error('  FALTA SB_DB_PASSWORD');
  process.exit(1);
}

let client = null;
let elegido = null;

for (const port of [5432, 6543]) {
  const host = `aws-0-${REGION}.pooler.supabase.com`;
  try {
    const c = new Client({
      host,
      port,
      user: `postgres.${REF}`,
      password: PASS,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    });
    await c.connect();
    client = c;
    elegido = `${host}:${port}`;
    break;
  } catch (e) {
    const m = e.message || '';
    if (/password authentication failed/i.test(m)) {
      console.error(`  ${host}:${port}  CONTRASENA INCORRECTA`);
    } else {
      console.error(`  ${host}:${port}  ${m.split('\n')[0]}`);
    }
  }
}

if (!client) {
  console.error('\n  No se pudo conectar con esa contrasena.');
  process.exit(1);
}
console.log(`  Conectado: ${elegido}\n`);

const consultas = [
  ['Migracion 004: datos de la empresa anterior', `
    select 'series' as tabla, count(*) as filas from series
    union all select 'emisor', count(*) from emisor
    union all select 'comprobantes', count(*) from comprobantes
    union all select 'series_contadores', count(*) from series_contadores
    union all select 'productos', count(*) from productos
    union all select 'ventas', count(*) from ventas
    union all select 'clientes', count(*) from clientes
    union all select 'profiles', count(*) from profiles
    order by 1`],

  ['Series B001 / F001', `
    select s.serie, s.tipo_documento, s.activa,
           coalesce(c.ultimo_numero, 0) as ultimo_numero
      from series s
      left join series_contadores c
             on c.serie_id = s.id and c.anio = extract(year from now())::int
     order by s.serie`],

  ['Migracion 005: funciones atomicas', `
    select p.proname,
           pg_get_function_identity_arguments(p.oid) as argumentos,
           p.prosecdef as security_definer
      from pg_proc p
     where p.proname in ('registrar_venta','eliminar_venta','siguiente_correlativo')
     order by p.proname`],

  ['Permisos: anon no debe poder ejecutar nada', `
    select g.rolname, p.proname,
           has_function_privilege(g.rolname, p.oid, 'EXECUTE') as puede
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join pg_roles g
     where n.nspname = 'public'
       and p.proname in ('registrar_venta','eliminar_venta','siguiente_correlativo')
       and g.rolname in ('anon','authenticated')
     order by g.rolname, p.proname`],

  ['Migracion 006: tiempo real', `
    select tablename from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
     order by tablename`],

  ['RLS encendido', `
    select count(*) filter (where relrowsecurity) as con_rls,
           count(*) as total
      from pg_class
     where relnamespace = 'public'::regnamespace and relkind = 'r'
       and relname in ('productos','niveles','clientes','ventas','venta_items',
                       'comprobantes','series','emisor','profiles',
                       'stock_movimientos','cierres_diarios')`],
];

for (const [titulo, sql] of consultas) {
  console.log(`  ${titulo}`);
  try {
    const r = await client.query(sql);
    if (!r.rows.length) {
      console.log('    (sin filas)');
    } else {
      r.rows.forEach((row) => {
        const txt = Object.entries(row).map(([k, v]) => `${k}=${v}`).join('  ');
        console.log('    ' + txt);
      });
    }
  } catch (e) {
    console.log('    ERROR: ' + e.message.split('\n')[0]);
  }
  console.log('');
}

await client.end();
