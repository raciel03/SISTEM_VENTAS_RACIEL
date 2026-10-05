/**
 * Verifica el esquema recien aplicado: tablas, RLS, funciones, seeds y el
 * comportamiento real del correlativo y del descuento de stock.
 *
 *   $env:SB_DB_PASSWORD = '...' ; node scripts/db-verify.mjs
 *
 * Todo corre en una transaccion que se REVIERTE al final, salvo las
 * comprobaciones de escritura que se deshacen explicitamente.
 */
import { Client } from 'pg';

const REF = 'ulhrsfwvjmvlagtqglcx';
const c = new Client({
  host: 'aws-0-us-east-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: `postgres.${REF}`,
  password: process.env.SB_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

await c.connect();
const q = async (sql, params) => (await c.query(sql, params)).rows;
let fallos = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'OK  ' : 'FALLO'} ${msg}`); if (!cond) fallos++; };

// Prueba que se espera que quede filtrada por RLS. OJO: cuando una politica
// USING devuelve false, Postgres NO da error: simplemente NO toca la fila y
// el UPDATE/DELETE afecta 0 filas. Por eso el fallo se comprueba por numero
// de filas afectadas, y no por exception.
const esperaSinEfecto = async (fn) => {
  await c.query('savepoint prueba');
  try {
    const res = await c.query(fn.sql, fn.params);
    const n = res.rowCount;
    await c.query('release savepoint prueba');
    return { n, e: null };
  } catch (e) {
    await c.query('rollback to savepoint prueba');
    return { n: -1, e };
  }
};

// Limpia restos de pruebas anteriores (quedan si un run fallo a mitad).
const UID = '11111111-1111-4111-8111-111111111111';
const restos = await q('select id from auth.users where id = $1', [UID]);
if (restos.length) {
  await q('delete from auth.users where id = $1', [UID]);
  console.log(`(limpiado el usuario de prueba de una corrida anterior)\n`);
}

// Todo lo que sigue corre DENTRO de esta transaccion y se revierte al final:
// ni el usuario de prueba, ni los clientes/productos de prueba quedan.
await c.query('begin');
console.log('=== 0. Transaccion de prueba (se revierte al final) ===');

console.log('\n=== 1. Tablas creadas ===');
const esperadas = ['emisor','profiles','productos','niveles','clientes','ventas','venta_items','series','series_contadores','comprobantes','stock_movimientos','stock_cambios_precio','cierres_diarios'];
const reales = (await q("select table_name from information_schema.tables where table_schema='public' order by 1")).map(r => r.table_name);
console.log(`  encontradas: ${reales.length}`);
for (const t of esperadas) ok(reales.includes(t), t);
ok(reales.length === esperadas.length, `total esperado ${esperadas.length}, real ${reales.length}`);

console.log('\n=== 2. RLS activo en todas ===');
const sinRls = await q(`select relname from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity`);
ok(sinRls.length === 0, sinRls.length ? `sin RLS: ${sinRls.map(r=>r.relname).join(', ')}` : 'las 13 tablas tienen RLS');

console.log('\n=== 3. Politicas creadas ===');
const pol = (await q("select count(*)::int n from pg_policies where schemaname='public'"))[0].n;
ok(pol > 0, `${pol} politicas`);

console.log('\n=== 4. Funciones de negocio ===');
for (const f of ['siguiente_correlativo','descontar_stock_producto','descontar_stock_nivel','aumentar_stock_producto','aumentar_stock_nivel','calcular_igv','es_admin','esta_activo']) {
  const r = await q("select prosecdef as sd from pg_proc where proname=$1 and pronamespace='public'::regnamespace limit 1", [f]);
  ok(r.length === 1, f);
}

console.log('\n=== 5. Seeds ===');
const series = await q('select serie, tipo_documento from series order by serie');
ok(series.length >= 2, `series: ${series.map(s=>s.serie).join(', ')}`);
const emisor = await q('select * from emisor');
ok(emisor.length === 1 && emisor[0].igv_rate != null, `emisor: RUC ${emisor[0]?.ruc}, igv ${emisor[0]?.igv_rate}%`);

console.log('\n=== 6. Usuario de prueba y contexto autenticado ===');
// Las funciones y politicas leen auth.uid(), que sale del JWT. Para probarlas
// hay que fingir una sesion: se crea un usuario en auth.users, se le da un
// perfil y se fija el claim del JWT.
await q(`
  insert into auth.users (id, instance_id, aud, role, email,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'caja@prueba.local', '{"provider":"email","providers":["email"]}'::jsonb,
          '{"nombre":"Caja de Prueba"}'::jsonb, now(), now())
`, [UID]);
const perfil = await q('select rol, activo from profiles where id=$1', [UID]);
ok(perfil.length === 1, `perfil creado por el trigger: rol=${perfil[0]?.rol}`);
ok(perfil[0]?.rol === 'empleado', 'un usuario nuevo nace como empleado, no como admin');
await q('update profiles set rol = $1 where id = $2', ['empleado', UID]);
// Claim del JWT: es lo que auth.uid() lee.
const setClaims = async (uid) => {
  await c.query(`select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`,
    [JSON.stringify({ sub: uid, role: 'authenticated' }), uid]);
  await c.query(`select set_config('request.jwt.claim.role', 'authenticated', true)`);
};
await setClaims(UID);
const activo = (await q('select esta_activo() a, es_admin() b'))[0];
ok(activo.a === true, 'esta_activo() = true para el empleado autenticado');
ok(activo.b === false, 'es_admin() = false para el empleado');

console.log('\n=== 7. Correlativo atomico (3 llamadas seguidas) ===');
const c1 = await q("select siguiente_correlativo('B001', 2026) n");
const c2 = await q("select siguiente_correlativo('B001', 2026) n");
const c3 = await q("select siguiente_correlativo('F001', 2026) n");
ok(c1[0].n === 1 && c2[0].n === 2, `B001 -> ${c1[0].n}, ${c2[0].n} (deben ser 1 y 2)`);
ok(c3[0].n === 1, `F001 -> ${c3[0].n} (serie independiente)`);
const contador = await q("select ultimo_numero from series_contadores sc join series s on s.id=sc.serie_id where s.serie='B001' and anio=2026");
ok(contador[0]?.ultimo_numero === 2, `contador B001/2026 = ${contador[0]?.ultimo_numero}`);
try {
  const e = await esperaFallo(() => q("select siguiente_correlativo('X999', 2026)"));
  ok(/no existe o esta inactiva/i.test(e?.message || ''), `rechaza serie inexistente: ${e?.message}`);
} catch { ok(false, 'debio rechazar una serie inexistente'); }

console.log('\n=== 8. RLS: un empleado NO puede tocar lo restringido ===');
// Clave: hasta aqui se probo como superusuario, que IGNORA RLS (bypassrls).
// A partir de aqui se baja al rol 'authenticated' con set local role, que si
// obedece las politicas: es la situacion real de un usuario de la app.
await c.query('set local role authenticated');
const rol = (await q("select current_user u"))[0].u;
ok(rol === 'authenticated', `probando como rol '${rol}' (obedece RLS)`);
const flags = (await q("select rolbypassrls, rolsuper from pg_roles where rolname = current_user"))[0];
ok(flags.rolbypassrls === false && flags.rolsuper === false, 'este rol NO tiene bypassrls: las politicas se aplican de verdad');

let e1 = await esperaSinEfecto({ sql: "update profiles set rol='admin' where id=$1", params: [UID] });
ok(e1.e !== null, `empleado NO puede auto-asignarse admin -> bloqueado por trigger${e1.e ? '' : ' (PERMITIDO!)'}`);
let e2 = await esperaSinEfecto({ sql: 'delete from clientes' });
ok(e2.n === 0, `empleado no puede ejecutar DELETE (0 filas afectadas)${e2.n === 0 ? '' : ` (borro ${e2.n}!)`}`);
let e3 = await esperaSinEfecto({ sql: 'delete from comprobantes' });
ok(e3.n === 0, `empleado no puede anular comprobantes${e3.n === 0 ? '' : ` (borro ${e3.n}!)`}`);
let e4 = await esperaSinEfecto({ sql: 'update emisor set igv_rate = 0' });
ok(e4.n === 0, `empleado no puede cambiar el IGV${e4.n === 0 ? '' : ` (cambio ${e4.n}!)'}`);
let e5 = await esperaSinEfecto({ sql: 'update series set activa = false' });
ok(e5.n === 0, `empleado no puede desactivar series${e5.n === 0 ? '' : ` (cambio ${e5.n}!)`}`);
let e5b = await esperaSinEfecto({ sql: "insert into series (tipo_documento, serie) values ('03','Z001')" });
ok(e5b.e !== null, `empleado no puede crear series nuevas${e5b.e ? '' : ' (PERMITIDO!)'}`);
let e5c = await esperaSinEfecto({ sql: "insert into cierres_diarios (fecha_local) values (current_date)" });
ok(e5c.e !== null, `empleado no puede abrir un cierre de caja${e5c.e ? '' : ' (PERMITIDO!)'}`);
// El historial interno sigue reservado al admin.
let e5d = await esperaSinEfecto({ sql: 'select * from stock_movimientos' });
ok(e5d.e !== null, `empleado no puede leer el historial de movimientos${e5d.e ? '' : ' (PERMITIDO!)'}`);

// Y lo que SI debe poder hacer un empleado (si esto falla, la app no vende).
const puedeEmitir = await q("insert into clientes (tipo_documento, numero_documento, razon_social) values ('0','99999999','Prueba RLS') returning id");
ok(puedeEmitir.length === 1, 'un empleado SI puede crear clientes (necesario para vender)');
const puedeVender = await q("insert into ventas (subtotal, igv, total, usuario_id) values (118, 18, 118, $1) returning id", [UID]);
ok(puedeVender.length === 1, 'un empleado SI puede registrar una venta');
const prod = (await q(`insert into productos (nombre, stock, precio_venta) values ('Prueba', 10, 5) returning id`))[0];
ok(!!prod, 'un empleado SI puede crear productos');

console.log('\n=== 9. Descuento de stock desde la caja ===');
const d1 = await q('select descontar_stock_producto($1, 4) s', [prod.id]);
ok(Number(d1[0].s) === 6, `descontar 4 de 10 -> ${d1[0].s} (esperado 6)`);
const eStock = await esperaSinEfecto({ sql: 'select descontar_stock_producto($1, 999)', params: [prod.id] });
ok(/insuficiente/i.test(eStock.e?.message || ''), `rechazo stock insuficiente: ${eStock.e?.message}`);
const tras = (await q('select stock from productos where id=$1', [prod.id]))[0];
ok(Number(tras.stock) === 6, `stock intacto tras el rechazo: ${tras.stock} (no quedo en negativo)`);
const movOk = await q("insert into stock_movimientos (producto_id, tipo, cantidad, stock_resultante) values ($1, 'sale', 4, 6) returning id", [prod.id]);
ok(movOk.length === 1, 'un empleado SI puede registrar el movimiento de stock');

console.log('\n=== 10. El admin puede hacer lo que el empleado no puede ===');
// Se vuelve al propietario para promoverlo, y luego se baja de nuevo al rol
// de la app para comprobar que los permisos se ampliaron de verdad.
await c.query('reset role');
await q('update profiles set rol = $1 where id = $2', ['admin', UID]);
await c.query('set local role authenticated');
const esAdmin = (await q('select es_admin() b'))[0];
ok(esAdmin.b === true, 'es_admin() = true tras promover a admin');
let e11 = await esperaSinEfecto({ sql: 'delete from clientes' });
ok(e11.n >= 0 && e11.e === null, `el admin SI puede ejecutar DELETE${e11.e ? ` (error: ${e11.e.message})` : ''}`);
let e12 = await esperaSinEfecto({ sql: 'update series set activa = false' });
ok(e12.n === 2, `el admin SI puede desactivar las 2 series${e12.n === 2 ? '' : ` (afecto ${e12.n})`}`);
let e13 = await esperaSinEfecto({ sql: "insert into series (tipo_documento, serie) values ('03','Z001')" });
ok(e13.n === 1, 'el admin SI puede crear series nuevas');
let e14 = await esperaSinEfecto({ sql: "update profiles set rol='admin' where id=$1", params: [UID] });
ok(e14.e === null, 'el admin SI puede cambiar roles');
const corr = await q('select siguiente_correlativo($1, 2026) n', ['F001']);
ok(corr[0].n === 2, `F001 sigue la secuencia -> ${corr[0].n} (esperado 2)`);
await c.query('reset role');

console.log('\n=== 11. Calculo de IGV ===');
const igv = (await q("select * from calcular_igv(118, 18)"))[0];
ok(Number(igv.total_gravada) === 100 && Number(igv.total_igv) === 18, `118.00 -> base ${igv.total_gravada} + igv ${igv.total_igv}`);
const igv2 = (await q("select * from calcular_igv(0.5, 18)"))[0];
ok(Number(igv2.total_gravada) + Number(igv2.total_igv) === Number(igv2.total_venta), `redondeo cuadra: ${igv2.total_gravada} + ${igv2.total_igv} = ${igv2.total_venta}`);

console.log('\n=== 12. Trigger de perfil en auth.users ===');
const trg = (await q("select tgname from pg_trigger where tgname='trg_crear_perfil' and not tgisinternal"));
ok(trg.length === 1, 'trg_crear_perfil activo');

console.log('\n=== 13. Integridad referencial y CHECKs ===');
let e6 = await esperaSinEfecto({ sql: `insert into niveles (producto_id, nombre, unidades_contenidas) values (999999, 'X', 1)` });
ok(e6.e !== null, `FK de niveles.producto_id rechaza id inexistente${e6.e ? '' : ' (PERMITIDO!)'}`);
let e7 = await esperaSinEfecto({ sql: `insert into venta_items (venta_id, nombre_producto, cantidad) values (999999, 'X', 1)` });
ok(e7.e !== null, `FK de venta_items.venta_id rechaza id inexistente${e7.e ? '' : ' (PERMITIDO!)'}`);
let e8 = await esperaSinEfecto({ sql: `insert into venta_items (venta_id, nombre_producto, cantidad) values (${puedeVender[0].id}, 'X', 0)` });
ok(e8.e !== null, `cantidad <= 0 rechazada por el CHECK${e8.e ? '' : ' (PERMITIDO!)'}`);
// Dos boletas con el mismo numero no pueden existir.
const serieId = (await q("select id from series where serie='B001'"))[0].id;
await q(`insert into comprobantes (serie_id, anio, correlativo, tipo_documento) values ($1, 2026, 99, '03')`, [serieId]);
let e10 = await esperaSinEfecto({ sql: `insert into comprobantes (serie_id, anio, correlativo, tipo_documento) values ($1, 2026, 99, '03')`, params: [serieId] });
ok(e10.e !== null, `no se puede duplicar un numero de boleta${e10.e ? '' : ' (PERMITIDO!)'}`);

// Todo lo de prueba se deshace.
await c.query('rollback');

console.log(`\n${fallos === 0 ? 'TODO CORRECTO' : fallos + ' COMPROBACIONES FALLARON'}`);
console.log('(los datos de prueba se revirtieron; la base queda solo con el esquema y los seeds)\n');
await c.end();
process.exit(fallos ? 1 : 0);
