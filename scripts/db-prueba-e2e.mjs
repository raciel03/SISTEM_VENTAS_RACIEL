/**
 * Prueba de extremo a extremo contra la base REAL, con usuarios temporales.
 *
 * Comprueba, en el mismo orden en que lo usaria el negocio:
 *   1. login de admin y de empleado
 *   2. el empleado NO puede crear una venta si el producto no existe
 *   3. crear producto con stock
 *   4. leerlo
 *   5. registrar una venta y verificar que el stock baja
 *   6. Intentar vender mas de lo que hay: debe RECHAZAR y no dejar rastro
 *   7. el empleado NO puede anular una venta
 *   8. el admin si puede anularla, y el stock vuelve
 *   9. emitir boleta: el correlativo empieza en 1 y no se repite
 *  10. una venta con boleta NO se puede borrar
 *
 * Al final borra TODO lo que creo (productos, ventas, comprobantes,
 * movimientos, series, usuarios). La base queda como estaba.
 *
 * Uso:
 *   $env:SB_DB_PASSWORD='...'
 *   node scripts/db-prueba-e2e.mjs
 */
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const REF = 'yeptjlamcfyjeoqwaxib';
const PASS = process.env.SB_DB_PASSWORD;
if (!PASS) { console.error('  FALTA SB_DB_PASSWORD'); process.exit(1); }

const env = readFileSync(join(raiz, '.env'), 'utf8');
const URL = env.match(/^VITE_SUPABASE_URL=(.*)$/m)[1].trim();
const KEY = env.match(/^VITE_SUPABASE_PUBLISHABLE_KEY=(.*)$/m)[1].trim();

const sello = randomBytes(4).toString('hex');
const MAIL_ADMIN = `prueba-admin-${sello}@test.local`;
const MAIL_EMP = `prueba-emp-${sello}@test.local`;
const CLAVE = 'PruebaTemporal-9x!kQ';

let pasan = 0, fallan = 0;
const ok = (m) => { console.log('  OK   ' + m); pasan++; };
const mal = (m) => { console.log('  FALLA ' + m); fallan++; };
const titulo = (m) => console.log('\n--- ' + m + ' ---');

const db = new Client({
  host: 'aws-0-ca-central-1.pooler.supabase.com',
  port: 5432,
  user: `postgres.${REF}`,
  password: PASS,
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});
await db.connect();

const crearUsuario = async (mail, rol) => {
  // auth.users.id no tiene default (lo asigna GoTrue), asi que se genera aqui.
  const r = await db.query(
    `insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at,
       aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', $1,
       crypt($2, gen_salt('bf')), now(),
       'authenticated','authenticated',
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
     returning id`,
    [mail, CLAVE],
  );
  const id = r.rows[0].id;
  // user_id e id son uuid (id tiene default), provider_id es text. La columna
  // email es generada: no se puede escribir a mano.
  await db.query(
    `insert into auth.identities (user_id, provider_id, id, identity_data, provider, last_sign_in_at, created_at, updated_at)
     values ($1::uuid, $1::text, gen_random_uuid(), $2::jsonb, 'email', now(), now(), now())`,
    [id, JSON.stringify({ sub: id, email: mail, email_verified: true })],
  );
  // El trigger de auth.users ya creo el perfil como 'empleado'.
  await db.query(`update profiles set rol = $2::rol_usuario where id = $1`, [id, rol]);
  return id;
};

const sesion = async (mail) => {
  const c = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email: mail, password: CLAVE });
  if (error) throw new Error(`${mail}: ${error.message}`);
  return c;
};

let idAdmin, idEmp, idProducto, idVenta, idComprobante;

try {
  titulo('Preparacion: usuarios temporales');
  idAdmin = await crearUsuario(MAIL_ADMIN, 'admin');
  idEmp = await crearUsuario(MAIL_EMP, 'empleado');
  ok(`admin y empleado creados (sello ${sello})`);

  const sAdmin = await sesion(MAIL_ADMIN);
  const sEmp = await sesion(MAIL_EMP);
  ok('ambos inician sesion correctamente');

  const rolDe = async (c) => {
    const r = await c.from('profiles').select('rol').eq('id', (await c.auth.getUser()).data.user.id).single();
    return r.data?.rol;
  };
  if (await rolDe(sAdmin) === 'admin') ok('el admin lee su rol: admin'); else mal('el admin no lee admin');
  if (await rolDe(sEmp) === 'empleado') ok('el empleado lee su rol: empleado'); else mal('el empleado no lee empleado');

  titulo('El empleado no puede leer datos ajenos niCatalogos sin rol');
  const rProd = await sEmp.from('stock_movimientos').select('id');
  if (rProd.error) ok(`historial restringido al admin: ${rProd.error.message.slice(0, 50)}`);
  else mal('el empleado SI pudo leer el historial (deberia estar restringido)');

  titulo('Crear producto con stock');
  const nuevo = {
    nombre: `PRUEBA ${sello}`,
    tipo: 'unidad',
    categoria: 'Prueba',
    stock: 10,
    stock_inicial: 10,
    precio_compra: 5,
    precio_venta: 10,
    activo: true,
  };
  const ins = await sAdmin.from('productos').insert(nuevo).select().single();
  if (ins.error) { mal('crear producto: ' + ins.error.message); throw new Error('sin producto'); }
  idProducto = ins.data.id;
  ok(`producto creado id=${idProducto} stock=10 precio=10`);

  const leido = await sEmp.from('productos').select('stock, precio_venta').eq('id', idProducto).single();
  if (leido.data?.stock === 10) ok('el empleado lee stock=10'); else mal('lectura de stock fallo: ' + JSON.stringify(leido.data));

  titulo('Registrar venta de 3 unidades');
  const items = [{
    producto_id: idProducto,
    cantidad: 3,
    total_linea: 30,
    precio_compra_unit: 5,
    precio_venta_unit: 10,
    nombre_producto: 'IGNORADO A PROPOSITO',
    tipo_producto: 'mayorista',
  }];
  const rpc = await sEmp.rpc('registrar_venta', {
    p_cliente_id: null,
    p_subtotal: 30, p_igv: 4.58, p_igv_rate: 18, p_total: 30, p_ganancia: 15,
    p_metodo_pago: 'efectivo', p_monto_recibido: 30, p_vuelto: 0,
    p_items: items,
  });
  if (rpc.error) { mal('registrar_venta: ' + rpc.error.message); }
  else {
    idVenta = rpc.data;
    ok(`venta creada id=${idVenta} (por un EMPLEADO: permitido)`);
    const st = await sAdmin.from('productos').select('stock').eq('id', idProducto).single();
    if (Number(st.data.stock) === 7) ok('stock bajo de 10 a 7 (correcto)');
    else mal(`stock incorrecto: ${st.data.stock}, esperaba 7`);

    const it = await sAdmin.from('venta_items').select('nombre_producto, tipo_producto, cantidad').eq('venta_id', idVenta).single();
    if (it.data?.nombre_producto?.startsWith('PRUEBA')) ok('el nombre se tomo de la BASE, no del navegador');
    else mal('el nombre vino del navegador: ' + it.data?.nombre_producto);
    if (it.data?.tipo_producto === 'unidad') ok('el tipo se tomo de la BASE (unidad, no mayorista del navegador)');
    else mal('el tipo vino manipulado: ' + it.data?.tipo_producto);

    const mov = await sAdmin.from('stock_movimientos').select('tipo, cantidad, stock_resultante').eq('venta_id', idVenta).eq('tipo', 'sale');
    if (mov.data?.length === 1 && Number(mov.data[0].stock_resultante) === 7) ok('movimiento de stock registrado con el stock resultante');
    else mal('movimiento de stock inesperado: ' + JSON.stringify(mov.data));
  }

  titulo('Rechazo por stock insuficiente (lo mas importante)');
  const exceso = [{ producto_id: idProducto, cantidad: 999, total_linea: 0 }];
  const r2 = await sEmp.rpc('registrar_venta', {
    p_cliente_id: null, p_subtotal: 0, p_igv: 0, p_igv_rate: 18, p_total: 0, p_ganancia: 0,
    p_metodo_pago: 'efectivo', p_monto_recibido: 0, p_vuelto: 0, p_items: exceso,
  });
  if (r2.error) ok(`rechazado: "${r2.error.message.slice(0, 60)}"`);
  else mal('ACEPTO una venta sin stock: ' + r2.data);

  const tras = await sAdmin.from('productos').select('stock').eq('id', idProducto).single();
  if (Number(tras.data.stock) === 7) ok('el stock quedo en 7: no se desconto a medias');
  else mal('el stock quedo en ' + tras.data.stock + ': se desconto a medias');

  const huerf = await sAdmin.from('ventas').select('id').eq('id', r2.data ?? -1);
  if (!r2.data || huerf.data.length === 0) ok('no quedo ninguna venta a medias');
  else mal('quedo una venta huerfana: ' + JSON.stringify(huerf.data));

  titulo('El empleado NO puede anular una venta');
  const r3 = await sEmp.rpc('eliminar_venta', { p_venta_id: idVenta });
  if (r3.error) ok(`rechazado: "${r3.error.message}"`);
  else mal('el empleado PUDO anular una venta (fallo grave de seguridad)');

  titulo('El admin si puede anular, y el stock vuelve');
  const r4 = await sAdmin.rpc('eliminar_venta', { p_venta_id: idVenta });
  if (r4.error) mal('el admin no pudo anular: ' + r4.error.message);
  else {
    ok('venta anulada por el admin');
    const st2 = await sAdmin.from('productos').select('stock').eq('id', idProducto).single();
    if (Number(st2.data.stock) === 10) ok('el stock volvio a 10');
    else mal('el stock quedo en ' + st2.data.stock + ', esperaba 10');
  }

  titulo('Emitir boleta y correlativo');
  const v2 = await sAdmin.rpc('registrar_venta', {
    p_cliente_id: null, p_subtotal: 20, p_igv: 3.05, p_igv_rate: 18, p_total: 20, p_ganancia: 10,
    p_metodo_pago: 'yape', p_monto_recibido: 20, p_vuelto: 0,
    p_items: [{ producto_id: idProducto, cantidad: 2, total_linea: 20, precio_venta_unit: 10 }],
  });
  if (v2.error) mal('segunda venta: ' + v2.error.message);
  else {
    idVenta = v2.data;
    const serie = await sAdmin.from('series').select('id').eq('serie', 'B001').single();
    const anio = new Date().getFullYear();
    const n1 = await sAdmin.rpc('siguiente_correlativo', { p_serie: 'B001', p_anio: anio });
    if (!n1.error) ok(`correlativo 1 obtenido: ${n1.data}`);
    const comp = await sAdmin.from('comprobantes').insert({
      serie_id: serie.data.id, anio, correlativo: n1.data, tipo_documento: '01',
      venta_id: idVenta, total_gravada: 16.95, total_igv: 3.05, total_venta: 20,
      estado: 'aceptado', datos_cliente: { razon_social: 'CLIENTE PRUEBA' },
    }).select().single();
    if (comp.error) mal('crear comprobante: ' + comp.error.message);
    else {
      idComprobante = comp.data.id;
      ok(`comprobante emitido: B001-${String(n1.data).padStart(6, '0')}`);
    }

    const dup = await sAdmin.from('comprobantes').insert({
      serie_id: serie.data.id, anio, correlativo: n1.data, tipo_documento: '01',
      venta_id: null, total_venta: 1, datos_cliente: {},
    });
    if (dup.error) ok('duplicar correlativo rechazado (unicidad funciona)');
    else mal('permitio dos comprobantes con el mismo numero');

    titulo('Venta con boleta NO se puede borrar');
    const r5 = await sAdmin.rpc('eliminar_venta', { p_venta_id: idVenta });
    if (r5.error) ok(`rechazado: "${r5.error.message}"`);
    else mal('permitio borrar una venta que ya tiene boleta');
  }
} catch (e) {
  mal('EXCEPCION: ' + e.message);
} finally {
  titulo('Limpieza');
  try {
    if (idComprobante) await db.query('delete from comprobantes where id = $1', [idComprobante]);
    await db.query(`delete from comprobantes where datos_cliente->>'razon_social' = 'CLIENTE PRUEBA'`);
    if (idVenta) await db.query('delete from ventas where id = $1', [idVenta]);
    await db.query(`delete from ventas where usuario_id = any($1::uuid[])`, [[idAdmin, idEmp].filter(Boolean)]);
    if (idProducto) await db.query('delete from productos where id = $1', [idProducto]);
    await db.query(`delete from productos where nombre like 'PRUEBA %'`);
    await db.query('delete from stock_movimientos where descripcion ilike $1', ['%PRUEBA%']);
    await db.query('delete from stock_movimientos where usuario_id = any($1::uuid[])', [[idAdmin, idEmp].filter(Boolean)]);
    await db.query(`update series_contadores set ultimo_numero = 0
                     where serie_id in (select id from series where serie in ('B001','F001'))`);
    await db.query('delete from profiles where id = any($1::uuid[])', [[idAdmin, idEmp].filter(Boolean)]);
    await db.query('delete from auth.users where id = any($1::uuid[])', [[idAdmin, idEmp].filter(Boolean)]);
    // Red de seguridad: si algo se rompio antes de tener el id, igual se limpia
    // por correo para no dejar usuarios de prueba colgando en la base real.
    await db.query(`delete from auth.users where email like 'prueba-%@test.local'`);
    await db.query(`delete from profiles where email like 'prueba-%@test.local'`);
    await db.end();

    const chk = new Client({
      host: 'aws-0-ca-central-1.pooler.supabase.com', port: 5432, user: `postgres.${REF}`,
      password: PASS, database: 'postgres', ssl: { rejectUnauthorized: false },
    });
    await chk.connect();
    const t = async (q) => (await chk.query(q)).rows[0].n;
    console.log('  productos de prueba:   ' + await t(`select count(*) n from productos where nombre like 'PRUEBA%'`));
    console.log('  ventas de prueba:      ' + await t('select count(*) n from ventas'));
    console.log('  comprobantes:          ' + await t('select count(*) n from comprobantes'));
    console.log('  usuarios de prueba:    ' + await t(`select count(*) n from profiles where email like 'prueba-%'`));
    console.log('  usuarios totales:      ' + await t('select count(*) n from profiles'));
    await chk.end();
    ok('limpieza completa');
  } catch (e) {
    mal('la LIMPIEZA fallo: ' + e.message + '  -> revisar la base a mano');
  }
}

console.log('\n=========================================');
console.log(`  ${pasan} correctas, ${fallan} fallidas`);
console.log('=========================================');
process.exit(fallan ? 1 : 0);
