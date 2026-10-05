/**
 * Crea el usuario administrador en Supabase Auth y le da el rol 'admin'.
 *
 * Por que por SQL y no por el panel: deja el proceso repetible y verificable.
 * Al final hace login de verdad con la clave publica para comprobar que la
 * cuenta funciona; si algo quedo mal, se avisa aqui mismo en vez de que el
 * usuario lo descubra intentando entrar.
 *
 * Uso:
 *   $env:SB_DB_PASSWORD='...'          # no se escribe en ningun archivo
 *   $env:ADMIN_EMAIL='tucorreo@x.com'
 *   node scripts/db-crear-admin.mjs
 *
 * La contraseña se genera aqui y se imprime una sola vez. Es temporal:
 * cambiala desde la app en cuanto entres por primera vez.
 */
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = 'yeptjlamcfyjeoqwaxib';
const REGION = 'ca-central-1';
const PASS = process.env.SB_DB_PASSWORD;
const EMAIL = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();

if (!PASS || !EMAIL) {
  console.error('  Faltan SB_DB_PASSWORD o ADMIN_EMAIL');
  process.exit(1);
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(EMAIL)) {
  console.error(`  "${EMAIL}" no parece un correo valido`);
  process.exit(1);
}

const NOMBRE = EMAIL.split('@')[0];

// Contrasena temporal: 16 caracteres de un alfabeto sin confusion (sin 0/O ni 1/l).
const ALFA = 'abcdefghijkmnpqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const temporal = Array.from(randomBytes(16))
  .map((b) => ALFA[b % ALFA.length])
  .join('');

const client = new Client({
  host: `aws-0-${REGION}.pooler.supabase.com`,
  port: 5432,
  user: `postgres.${REF}`,
  password: PASS,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

try {
  await client.connect();
} catch (e) {
  console.error('  No se pudo conectar: ' + (e.message || '').split('\n')[0]);
  process.exit(1);
}

// Si ya existe, no se duplica: se reutiliza y solo seCorrige el rol.
const existe = await client.query(
  'select id, email from auth.users where lower(email) = $1',
  [EMAIL],
);

let userId;

if (existe.rowCount > 0) {
  userId = existe.rows[0].id;
  console.log(`  El usuario ya existia. Se actualiza su rol.`);
} else {
  const r = await client.query(
    `insert into auth.users (
       instance_id, email, encrypted_password, email_confirmed_at,
       aud, role, raw_app_meta_data, raw_user_meta_data,
       created_at, updated_at
     )
     values (
       '00000000-0000-0000-0000-000000000000', $1,
       crypt($2, gen_salt('bf')), now(),
       'authenticated', 'authenticated',
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('nombre', $3),
       now(), now()
     )
     returning id`,
    [EMAIL, temporal, NOMBRE],
  );
  userId = r.rows[0].id;

  await client.query(
    `insert into auth.identities (user_id, provider_id, id, identity_data, provider, last_sign_in_at, created_at, updated_at)
     values ($1, $1, $1, $2::jsonb, 'email', now(), now(), now())`,
    [userId, JSON.stringify({ sub: userId, email: EMAIL, email_verified: true })],
  );
  console.log('  Usuario creado en auth.users.');
}

// El trigger crear_perfil_al_registrarse lo nace como 'empleado'; se sube a admin.
await client.query(
  `insert into profiles (id, email, nombre, rol, activo)
   values ($1, $2, $3, 'admin', true)
   on conflict (id) do update set rol = 'admin', activo = true, email = excluded.email`,
  [userId, EMAIL, NOMBRE],
);

const perfil = await client.query(
  'select id, email, nombre, rol, activo from profiles where id = $1',
  [userId],
);
await client.end();

console.log('');
console.log('  Perfil: ' + JSON.stringify(perfil.rows[0]));
console.log('');

// Comprobacion real: iniciar sesion con la clave publica.
const env = readFileSync(join(raiz, '.env'), 'utf8');
const url = env.match(/^VITE_SUPABASE_URL=(.*)$/m)[1].trim();
const key = env.match(/^VITE_SUPABASE_PUBLISHABLE_KEY=(.*)$/m)[1].trim();

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase.auth.signInWithPassword({
  email: EMAIL,
  password: temporal,
});

if (error) {
  console.log('  X  El login fallo: ' + error.message);
  console.log('     El usuario quedo creado, pero revisa el hash de contrasena.');
  process.exit(1);
}

const esAdmin = await supabase.rpc('siguiente_correlativo', {
  p_serie: 'B001',
  p_anio: new Date().getFullYear(),
}).then(() => 'ok').catch((e) => 'bloqueado: ' + (e.message || '').split('\n')[0]);

console.log('  OK  Login correcto. La sesion abre sin errores.');
console.log('  -> sesion iniciada para ' + data.user.email);
console.log('  -> prueba de permiso: ' + esAdmin);
console.log('');
console.log('  ------------------------------------------------------------');
console.log('   CORREO:     ' + EMAIL);
console.log('   CLAVE:      ' + temporal);
console.log('  ------------------------------------------------------------');
console.log('  Esta clave es TEMPORAL. Cambiala en cuanto entres.');
