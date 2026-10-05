/**
 * Ruta alternativa para aplicar el esquema cuando el pooler rechaza la
 * contrasena: usa un Personal Access Token de la cuenta de Supabase contra
 * la Management API, que ejecuta SQL sin necesitar la contrasena de la BD.
 *
 *   $env:SB_ACCESS_TOKEN = 'sbp_...'
 *   node scripts/db-apply.mjs
 *
 * El token NUNCA se escribe en disco: solo se lee del entorno.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REF = process.env.SB_PROJECT_REF || 'ulhrsfwvjmvlagtqglcx';
const TOKEN = process.env.SB_ACCESS_TOKEN;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

if (!TOKEN) {
  console.error('Falta SB_ACCESS_TOKEN. Crealo en https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const texto = await res.text();
  let datos;
  try { datos = JSON.parse(texto); } catch { datos = texto; }
  if (!res.ok) {
    const msg = typeof datos === 'string' ? datos : (datos.message || JSON.stringify(datos));
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  return Array.isArray(datos) ? datos : [];
}

await sql('select 1');
console.log(`Management API conectada al proyecto ${REF}\n`);

await sql(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key,
    statements text[],
    name text
  );
`);

const archivos = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
const aplicadas = new Set((await sql('select version from supabase_migrations.schema_migrations')).map((r) => r.version));
const pendientes = archivos.filter((f) => !aplicadas.has(f.split('_')[0]));

console.log(`Migraciones: ${archivos.length} | aplicadas: ${archivos.length - pendientes.length} | pendientes: ${pendientes.length}\n`);

if (process.argv.includes('--status')) {
  for (const f of archivos) {
    console.log(`  ${aplicadas.has(f.split('_')[0]) ? '[aplicada]  ' : '[pendiente]'} ${f}`);
  }
  process.exit(0);
}

for (const archivo of pendientes) {
  const version = archivo.split('_')[0];
  const nombre = archivo.replace(/^\d+_/, '').replace(/\.sql$/, '');
  const contenido = readFileSync(join(MIGRATIONS, archivo), 'utf8');
  process.stdout.write(`Aplicando ${archivo} ... `);
  try {
    // Una sola llamada: si algo falla, la migracion se deshace entera.
    await sql(`${contenido}\ninsert into supabase_migrations.schema_migrations (version, name) values ('${version}', '${nombre}') on conflict (version) do nothing;`);
    console.log('OK');
  } catch (e) {
    console.log('FALLO');
    console.error(`\n${e.message}\n`);
    process.exit(1);
  }
}

console.log(`\nAplicadas ahora: ${pendientes.length}`);
