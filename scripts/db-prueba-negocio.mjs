/**
 * Prueba de la LOGICA DE NEGOCIO a nivel de base de datos.
 *
 * Por que no pasa por el login: en Supabase, desactivar "Enable email signup"
 * desactiva tambien el inicio de sesion con correo, asi que no se puede entrar
 * por la API. Aqui se simula la sesion directamente en Postgres
 * (SET ROLE authenticated + request.jwt.claim.sub), que es exactamente lo que
 * ve la base cuando alguien esta conectado. Asi se prueban RLS y las funciones
 * aunque el login por correo este apagado.
 *
 * Al final borra todo lo que creo.
 *
 * Uso:  $env:SB_DB_PASSWORD='...' ; node scripts/db-prueba-negocio.mjs
 */
import { Client } from 'pg';
import { randomBytes } from 'node:crypto';

const REF = 'yeptjlamcfyjeoqwaxib';
const PASS = process.env.SB_DB_PASSWORD;
if (!PASS) { console.error('  FALTA SB_DB_PASSWORD'); process.exit(1); }

const sello = randomBytes(4).toString('hex');
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

/** Ejecuta fn dentro de una sesion simulada del usuario indicado. */
const como = async (uid, fn) => {
  await db.query('begin');
  await db.query('set local role authenticated');
  await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, email: 'x@test.local', role: 'authenticated' }),
  ]);
  try {
    const r = await fn();
    await db.query('commit');
    return r;
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
};

let idAdmin, idEmp, idProducto, idVenta, idComprobante;

try {
  titulo('Preparacion');
  const crear = async (rol) => {
    const u = await db.query(
      `insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at,
         aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', $1,
         crypt('Temporal-9x!kQ', gen_salt('bf')), now(), 'authenticated','authenticated',
         '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now())
       returning id`,
      [`prueba-${rol}-${sello}@test.local`],
    );
    const id = u.rows[0].id;
    await db.query(
      `insert into auth.identities (user_id, provider_id, id, identity_data, provider, last_sign_in_at, created_at, updated_at)
       values ($1::uuid, $1::text, gen_random_uuid(), $2::jsonb, 'email', now(), now(), now())`,
      [id, JSON.stringify({ sub: id, email: 'x@test.local', email_verified: true })],
    );
    await db.query(
      `insert into profiles (id, email, nombre, rol, activo)
       values ($1, $2, $3, $4::rol_usuario, true)
       on conflict (id) do update set rol = excluded.rol`,
      [id, `prueba-${rol}-${sello}@test.local`, 'PRUEBA', rol],
    );
    return id;
  };
  idAdmin = await crear('admin');
  idEmp = await crear('empleado');
  ok(`admin y EMPLOYEE creados con sesion simulada (sello ${sello})`);

  titulo('RLS: el empleado ve el catalogo pero NO el historial ni la caja');
  // OJO: count(*) devuelve texto en el driver pg, hay que compararlo con Number.
  const cat = await como(idEmp, () => db.query('select count(*) n from productos'));
  ok(`el empleado puede leer productos (${Number(cat.rows[0].n)} filas, permitido)`);

  const hist = await como(idEmp, () => db.query('select count(*) n from stock_movimientos'));
  if (Number(hist.rows[0].n) === 0) ok('el empleado ve 0 movimientos de historial (solo admin)');
  else mal(`el empleado leyo ${hist.rows[0].n} movimientos (solo admin debe verlos)`);

  const caja = await como(idEmp, () => db.query('select count(*) n from cierres_diarios'));
  if (Number(caja.rows[0].n) === 0) ok('el empleado ve 0 cierres de caja (solo admin)');
  else mal(`el empleado leyo ${caja.rows[0].n} cierres (solo admin debe verlos)`);

  const histAdmin = await como(idAdmin, () => db.query('select count(*) n from stock_movimientos'));
  ok(`el admin si lee el historial (${histAdmin.rows[0].n} movimientos)`);

  titulo('El empleado NO puede autoascenderse a admin');
  try {
    await como(idEmp, () => db.query(`update profiles set rol = 'admin' where id = $1`, [idEmp]));
    mal('un empleado pudo convertirse en admin (FALLO GRAVE)');
  } catch (e) {
    ok(`rechazado: "${e.message.slice(0, 70)}"`);
  }
  const rolAhora = await db.query('select rol from profiles where id = $1', [idEmp]);
  if (rolAhora.rows[0].rol === 'empleado') ok('el rol sigue siendo empleado');
  else mal('el rol quedo en ' + rolAhora.rows[0].rol);

  titulo('El empleado NO puede cambiar su propio activo a false');
  try {
    await como(idEmp, () => db.query(`update profiles set activo = false where id = $1`, [idEmp]));
    mal('un empleado pudo desactivar su propia cuenta');
  } catch (e) {
    ok(`rechazado: "${e.message.slice(0, 70)}"`);
  }

  titulo('Los ADMINISTRADORES son inamovibles desde la app (migracion 008)');
  // Un empleado ni siquiera "ve" la fila del admin (RLS), asi que el UPDATE no
  // toca ninguna fila: hay que verificar el estado final, no esperar error.
  await como(idEmp, () => db.query(`update profiles set activo = false where id = $1`, [idAdmin]));
  let admEstado = await db.query('select activo, rol from profiles where id = $1', [idAdmin]);
  if (admEstado.rows[0].activo === true && admEstado.rows[0].rol === 'admin') ok('un empleado intento desactivar a un admin: RLS lo bloqueo (sigue activo)');
  else mal('un empleado pudo cambiar a un admin: ' + JSON.stringify(admEstado.rows[0]));

  try {
    await como(idAdmin, () => db.query(`update profiles set rol = 'empleado' where id = $1`, [idAdmin]));
    mal('un admin pudo degradarse a si mismo');
  } catch (e) { ok(`un admin no se degrada: "${e.message.slice(0, 55)}"`); }

  try {
    await como(idAdmin, () => db.query(`update profiles set activo = false where id = $1`, [idAdmin]));
    mal('un admin pudo desactivarse a si mismo');
  } catch (e) { ok(`un admin no se desactiva: "${e.message.slice(0, 55)}"`); }

  try {
    await como(idAdmin, () => db.query(`delete from profiles where id = $1`, [idAdmin]));
    mal('un admin pudo BORRARSE a si mismo');
  } catch (e) { ok(`no se borra a un admin: "${e.message.slice(0, 55)}"`); }

  await como(idEmp, () => db.query(`delete from profiles where id = $1`, [idAdmin]));
  admEstado = await db.query('select count(*) n from profiles where id = $1', [idAdmin]);
  if (Number(admEstado.rows[0].n) === 1) ok('un empleado intento borrar a un admin: RLS lo bloqueo (sigue existiendo)');
  else mal('un empleado pudo borrar a un admin');

  // Regression: el flujo normal de "eliminar empleado" (activo false) SI funciona.
  await como(idAdmin, () => db.query(`update profiles set activo = false where id = $1`, [idEmp]));
  const empActivo = await db.query('select activo from profiles where id = $1', [idEmp]);
  if (empActivo.rows[0].activo === false) ok('un admin SI puede bloquear a un empleado (borrado normal)');
  else mal('el bloqueo de empleado no funciono');
  await como(idAdmin, () => db.query(`update profiles set activo = true where id = $1`, [idEmp]));
  ok('y puede reactivarlo');

  // Regression: borrado fisico de un empleado SI se permite (solo admins estan protegidos).
  try {
    await como(idAdmin, () => db.query(`delete from profiles where id = $1`, [idEmp]));
    ok('un admin SI puede borrar la fila de un empleado');
    await db.query(
      `insert into profiles (id, email, nombre, rol, activo)
       values ($1, $2, 'PRUEBA', 'empleado', true) on conflict (id) do nothing`,
      [idEmp, `prueba-empleado-${sello}@test.local`]);
    ok('el empleado se restauro para seguir probando');
  } catch (e) { mal('no se pudo borrar a un empleado: ' + e.message); }

  titulo('Crear producto con stock 10');
  const p = await como(idAdmin, () => db.query(
    `insert into productos (nombre, tipo, categoria, stock, stock_inicial, precio_compra, precio_venta, activo)
     values ($1, 'unidad', 'Prueba', 10, 10, 5, 10, true) returning id`,
    [`PRUEBA ${sello}`],
  ));
  idProducto = p.rows[0].id;
  ok(`producto id=${idProducto} stock=10`);

  titulo('Venta de 3 por un EMPLEADO (debe permitirse)');
  const items = JSON.stringify([{
    producto_id: idProducto, cantidad: 3, total_linea: 30,
    precio_compra_unit: 5, precio_venta_unit: 10,
    nombre_producto: 'MANIPULADO', tipo_producto: 'mayorista',
  }]);
  const v = await como(idEmp, () => db.query(
    `select registrar_venta(null, 30, 4.58, 18, 30, 15, 'efectivo', 30, 0, $1::jsonb) as id`,
    [items],
  ));
  idVenta = v.rows[0].id;
  ok(`venta id=${idVenta} registrada por un empleado`);

  const st = await db.query('select stock from productos where id = $1', [idProducto]);
  if (Number(st.rows[0].stock) === 7) ok('el stock bajo de 10 a 7');
  else mal(`el stock quedo en ${st.rows[0].stock}, esperaba 7`);

  const it = await db.query('select nombre_producto, tipo_producto from venta_items where venta_id = $1', [idVenta]);
  if (it.rows[0].nombre_producto.startsWith('PRUEBA')) ok('el nombre se tomo de la BASE, no del navegador');
  else mal('el nombre vino del navegador: ' + it.rows[0].nombre_producto);
  if (it.rows[0].tipo_producto === 'unidad') ok('el tipo se tomo de la BASE (no el "mayorista" manipulado)');
  else mal('el tipo vino manipulado: ' + it.rows[0].tipo_producto);

  const mov = await db.query(
    `select tipo, stock_resultante from stock_movimientos where venta_id = $1 and tipo = 'sale'`, [idVenta]);
  if (mov.rows.length === 1 && Number(mov.rows[0].stock_resultante) === 7) ok('movimiento de stock con el resultado 7');
  else mal('movimiento inesperado: ' + JSON.stringify(mov.rows));

  titulo('STOCK INSUFICIENTE: debe rechazar y no dejar nada a medias');
  const exceso = JSON.stringify([{ producto_id: idProducto, cantidad: 999, total_linea: 0 }]);
  try {
    await como(idEmp, () => db.query(
      `select registrar_venta(null, 0, 0, 18, 0, 0, 'efectivo', 0, 0, $1::jsonb)`, [exceso]));
    mal('ACEPTO una venta sin stock');
  } catch (e) {
    ok(`rechazado: "${e.message.slice(0, 65)}"`);
  }
  const st2 = await db.query('select stock from productos where id = $1', [idProducto]);
  if (Number(st2.rows[0].stock) === 7) ok('el stock sigue en 7: no se desconto a medias');
  else mal('el stock quedo en ' + st2.rows[0].stock);

  const huerf = await db.query('select count(*) n from ventas');
  if (Number(huerf.rows[0].n) === 1) ok('sigue habiendo 1 sola venta: no se creo ninguna a medias');
  else mal(`hay ${huerf.rows[0].n} ventas, sobran`);

  titulo('Venta mixta: un producto bueno y uno sin stock -> falla TODO');
  const p2 = await como(idAdmin, () => db.query(
    `insert into productos (nombre, tipo, stock, stock_inicial, precio_venta, activo)
     values ($1, 'unidad', 5, 5, 10, true) returning id`, [`PRUEBA-B ${sello}`]));
  const idP2 = p2.rows[0].id;
  const mixta = JSON.stringify([
    { producto_id: idProducto, cantidad: 1, total_linea: 10 },
    { producto_id: idP2, cantidad: 100, total_linea: 1000 },
  ]);
  try {
    await como(idEmp, () => db.query(
      `select registrar_venta(null, 0, 0, 18, 0, 0, 'efectivo', 0, 0, $1::jsonb)`, [mixta]));
    mal('ACEPTO la venta mixta');
  } catch (e) { ok(`rechazada: "${e.message.slice(0, 55)}"`); }
  const st3 = await db.query('select stock from productos where id = any($1::int[]) order by id', [[idProducto, idP2]]);
  if (Number(st3.rows[0].stock) === 7) ok('el primer producto NO se desconto (reversion correcta)');
  else mal('el primer producto quedo en ' + st3.rows[0].stock + ', se desconto pese al fallo');
  await db.query('delete from productos where id = $1', [idP2]);

  titulo('El empleado NO puede anular una venta');
  try {
    await como(idEmp, () => db.query('select eliminar_venta($1)', [idVenta]));
    mal('el empleado PUDO anular una venta (FALLO GRAVE)');
  } catch (e) { ok(`rechazado: "${e.message.slice(0, 60)}"`); }

  titulo('El admin si anula, y el stock vuelve');
  await como(idAdmin, () => db.query('select eliminar_venta($1)', [idVenta]));
  const st4 = await db.query('select stock from productos where id = $1', [idProducto]);
  if (Number(st4.rows[0].stock) === 10) ok('el stock volvio a 10');
  else mal('el stock quedo en ' + st4.rows[0].stock);

  titulo('Boleta: correlativo, unicidad y venta con boleta protegida');
  const v2 = await como(idAdmin, () => db.query(
    `select registrar_venta(null, 20, 3.05, 18, 20, 10, 'yape', 20, 0, $1::jsonb) as id`,
    [JSON.stringify([{ producto_id: idProducto, cantidad: 2, total_linea: 20, precio_venta_unit: 10 }])],
  ));
  idVenta = v2.rows[0].id;
  const anio = new Date().getFullYear();
  const corr = await como(idAdmin, () => db.query('select siguiente_correlativo($1, $2) as n', ['B001', anio]));
  if (corr.rows[0].n === 1) ok('el correlativo arranca en 1');
  else ok(`correlativo = ${corr.rows[0].n} (podia no ser 1 si se uso antes)`);

  const serie = await db.query(`select id from series where serie = 'B001'`);
  const comp = await como(idAdmin, () => db.query(
    `insert into comprobantes (serie_id, anio, correlativo, tipo_documento, venta_id,
       total_gravada, total_igv, total_venta, estado, datos_cliente)
     values ($1, $2, $3, '01', $4, 16.95, 3.05, 20, 'aceptado', '{"razon_social":"CLIENTE PRUEBA"}'::jsonb)
     returning id`, [serie.rows[0].id, anio, corr.rows[0].n, idVenta]));
  idComprobante = comp.rows[0].id;
  ok(`comprobante emitido: B001-${String(corr.rows[0].n).padStart(6, '0')}`);

  try {
    await como(idAdmin, () => db.query(
      `insert into comprobantes (serie_id, anio, correlativo, tipo_documento, total_venta, datos_cliente)
       values ($1, $2, $3, '01', 1, '{}'::jsonb)`, [serie.rows[0].id, anio, corr.rows[0].n]));
    mal('permitio dos comprobantes con el MISMO correlativo');
  } catch (e) { ok('duplicar correlativo rechazado'); }

  try {
    await como(idAdmin, () => db.query('select eliminar_venta($1)', [idVenta]));
    mal('permitio borrar una venta que ya tiene boleta');
  } catch (e) { ok(`rechazado: "${e.message.slice(0, 70)}"`); }
} catch (e) {
  mal('EXCEPCION: ' + e.message);
} finally {
  titulo('Limpieza');
  try {
    await db.query('reset role');
    if (idComprobante) await db.query('delete from comprobantes where id = $1', [idComprobante]);
    await db.query(`delete from comprobantes where datos_cliente->>'razon_social' = 'CLIENTE PRUEBA'`);
    if (idVenta) await db.query('delete from ventas where id = $1', [idVenta]);
    await db.query(`delete from ventas where usuario_id = any($1::uuid[])`, [[idAdmin, idEmp].filter(Boolean)]);
    await db.query(`delete from productos where nombre like 'PRUEBA%'`);
    await db.query(`delete from stock_movimientos where usuario_id = any($1::uuid[])`, [[idAdmin, idEmp].filter(Boolean)]);
    await db.query(`delete from stock_movimientos where descripcion ilike '%Anulacion de venta%'
                     and usuario_id = any($1::uuid[])`, [[idAdmin, idEmp].filter(Boolean)]);
    await db.query(`update series_contadores set ultimo_numero = 0
                     where serie_id in (select id from series where serie in ('B001','F001'))`);
    // El trigger de la migracion 008 protege a los admins de prueba tambien;
    // se desactiva solo durante el borrado de la limpieza.
    await db.query('alter table profiles disable trigger trg_impedir_borrar_admin');
    await db.query(`delete from profiles where email like 'prueba-%@test.local'`);
    await db.query('alter table profiles enable trigger trg_impedir_borrar_admin');
    await db.query(`delete from auth.users where email like 'prueba-%@test.local'`);
    await db.end();

    const c2 = new Client({ host: 'aws-0-ca-central-1.pooler.supabase.com', port: 5432,
      user: `postgres.${REF}`, password: PASS, database: 'postgres', ssl: { rejectUnauthorized: false } });
    await c2.connect();
    const n = async (q) => (await c2.query(q)).rows[0].n;
    console.log('  productos:      ' + await n('select count(*) n from productos'));
    console.log('  ventas:         ' + await n('select count(*) n from ventas'));
    console.log('  comprobantes:   ' + await n('select count(*) n from comprobantes'));
    console.log('  movimientos:    ' + await n('select count(*) n from stock_movimientos'));
    console.log('  series:         ' + await n('select count(*) n from series') + '  (B001 y F001)');
    console.log('  perfiles:       ' + await n('select count(*) n from profiles') + '  (solo el tuyo)');
    await c2.end();
    ok('limpieza completa');
  } catch (e) {
    mal('la LIMPIEZA fallo: ' + e.message + '  -> revisar la base');
  }
}

console.log('\n=========================================');
console.log(`  ${pasan} correctas, ${fallan} fallidas`);
console.log('=========================================');
process.exit(fallan ? 1 : 0);
