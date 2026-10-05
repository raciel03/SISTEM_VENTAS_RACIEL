/**
 * Comprueba que el proyecto de Supabase nuevo responde y que la clave publica
 * sirve. No escribe nada: solo hace lecturas.
 *
 * Uso:  node scripts/db-probar-clave.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(raiz, '.env'), 'utf8');

const leer = (clave) => {
  const m = env.match(new RegExp(`^${clave}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
};

const url = leer('VITE_SUPABASE_URL');
const key = leer('VITE_SUPABASE_PUBLISHABLE_KEY');

if (!url || !key || key.includes('PENDIENTE')) {
  console.log('  X  Falta VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en .env');
  process.exit(1);
}

console.log('  -> proyecto:', url.replace('https://', ''));
console.log('  -> clave:', key.slice(0, 22) + '...');

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let fallos = 0;
const ok = (m) => console.log('  OK ' + m);
const mal = (m) => { console.log('  X  ' + m); fallos++; };

// 1) El proyecto existe y la clave es valida: una consulta debe funcionar.
const { data, error } = await supabase
  .from('series')
  .select('serie, tipo_documento, activa');

if (error) {
  mal('La clave o la URL no funcionan: ' + error.message);
} else {
  ok(`Conexion correcta. series visibles sin sesion: ${data.length}`);
  if (data.length > 0) {
    console.log('      series:', data.map((s) => s.serie).join(', '));
  } else {
    console.log('      (0 filas: RLS bloquea la lectura sin iniciar sesion, como debe ser)');
  }
}

// 2) El login debe rechazar una contrasena inventada, y no reventar.
const { error: errAuth } = await supabase.auth.signInWithPassword({
  email: 'prueba-inexistente@example.com',
  password: 'contrasena-inventada',
});
if (errAuth) {
  ok('Login responde correctamente (rechaza credenciales falsas)');
} else {
  mal('El login acepto una contrasena inventada: hay un problema grave');
}

// 3) Las funciones de venta solo existen si corriste la migracion 005.
const { data: fn, error: errFn } = await supabase.rpc('siguiente_correlativo', {
  p_serie: 'B001',
  p_anio: new Date().getFullYear(),
});
if (errFn) {
  const m = errFn.message || '';
  if (/no existe o esta inactiva/i.test(m) || /Sesion no permitida/i.test(m)) {
    ok('La funcion siguiente_correlativo existe (solo pide sesion/serie valida)');
  } else {
    mal('siguiente_correlativo respondio raro: ' + m);
  }
} else {
  ok(`siguiente_correlativo respondio: ${fn}`);
}

console.log('');
console.log(fallos === 0
  ? '  Resultado: la clave publica funciona.'
  : `  Resultado: ${fallos} problema(s).`);
process.exit(fallos === 0 ? 0 : 1);
