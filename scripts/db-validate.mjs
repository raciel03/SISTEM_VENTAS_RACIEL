/**
 * Valida la SINTAXIS de las migraciones con libpg-query, el parser oficial
 * de PostgreSQL usado por el propio motor. No necesita servidor ni contrasena,
 * asi que se puede correr antes de tener acceso a Supabase.
 *
 *   node scripts/db-validate.mjs
 *
 * Exit code 0 = todo correcto, 1 = hay errores de sintaxis.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse } from 'libpg-query';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');

const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
let fallos = 0;
let sentencias = 0;

for (const file of files) {
  const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
  try {
    const resultado = await parse(sql);
    const n = (resultado.stmts || resultado).length;
    sentencias += n;
    console.log(`  [OK] ${file}  (${n} sentencias)`);
  } catch (e) {
    fallos++;
    console.log(`  [ERROR] ${file}`);
    console.log(`     ${e.message}`);
    // Ubica la linea a partir del cursor del parser.
    const m = /at position (\d+)/.exec(e.message);
    if (m) {
      const pos = Number(m[1]);
      const linea = sql.slice(0, pos).split('\n').length;
      const texto = sql.split('\n')[linea - 1];
      console.log(`     linea ${linea}: ${texto?.trim().slice(0, 90)}`);
    }
  }
}

console.log(`\nMigraciones: ${files.length} | sentencias: ${sentencias} | con error: ${fallos}`);
process.exit(fallos ? 1 : 0);
