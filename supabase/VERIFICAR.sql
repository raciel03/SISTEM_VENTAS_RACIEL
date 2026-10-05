-- ============================================================================
--  VERIFICACION: pega este archivo entero en Supabase -> SQL Editor -> Run
-- ============================================================================
--  Ejecutalo DESPUES de correr las migraciones 004, 005 y 006.
--  Es solo lectura: no cambia nada.
--  Cada bloque se lee en la pestana "Results" de abajo; el ultimo muestra un
--  resumen con OK/FALLA para saber de un vistazo si falta algo.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1) La migracion 004: la empresa anterior quedo borrada
-- ---------------------------------------------------------------------------
select 'series'              as que, count(*) as filas, 'debe ser 2'  as esperado from series
union all select 'emisor',              count(*), 'debe ser 0' from emisor
union all select 'comprobantes',        count(*), 'debe ser 0' from comprobantes
union all select 'series_contadores',   count(*), 'debe ser 0' from series_contadores
union all select 'productos',           count(*), 'debe ser 0' from productos
union all select 'ventas',              count(*), 'debe ser 0' from ventas
union all select 'clientes',            count(*), 'debe ser 0' from clientes
union all select 'profiles',            count(*), 'debe ser 0 hasta que crees el admin' from profiles;


-- ---------------------------------------------------------------------------
-- 2) Las series B001 y F001 existen, sin contador todavia
-- ---------------------------------------------------------------------------
select s.serie, s.tipo_documento, s.descripcion, s.activa,
       coalesce(c.ultimo_numero, 0) as ultimo_numero
  from series s
  left join series_contadores c
         on c.serie_id = s.id and c.anio = extract(year from now())::int
 order by s.serie;
--  esperado: B001 (01) y F001 (03), ambas activa = true, ultimo_numero = 0


-- ---------------------------------------------------------------------------
-- 3) La migracion 005: las dos funciones atomicas existen
-- ---------------------------------------------------------------------------
select p.proname,
       pg_get_function_identity_arguments(p.oid) as argumentos,
       p.prosecdef as usa_security_definer
  from pg_proc p
 where p.proname in ('registrar_venta', 'eliminar_venta')
 order by p.proname;
--  esperado: 2 filas. uses_security_definer = true en ambas.


-- ---------------------------------------------------------------------------
-- 4) La seguridad: ningun anonimo nilogged puede ejecutar las funciones
-- ---------------------------------------------------------------------------
--  Si aqui apareciera una fila con 'anon', cualquier visitante de la web
--  podria registrar o anular ventas sin iniciar sesion. Debe salir 0 filas.
select g.rolname, p.proname, has_function_privilege(g.rolname, p.oid, 'EXECUTE') as puede
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join pg_roles g
 where n.nspname = 'public'
   and p.proname in ('registrar_venta', 'eliminar_venta', 'siguiente_correlativo')
   and g.rolname in ('anon', 'authenticated')
 order by g.rolname, p.proname;
--  esperado: solo filas de 'authenticated' con puede = true. Ninguna de 'anon'.


-- ---------------------------------------------------------------------------
-- 5) La migracion 006: tiempo real activo en las 8 tablas
-- ---------------------------------------------------------------------------
select tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime' and schemaname = 'public'
 order by tablename;
--  esperado: 8 filas
--  productos, niveles, ventas, venta_items, stock_movimientos,
--  stock_cambios_precio, cierres_diarios, profiles


-- ---------------------------------------------------------------------------
-- 6) RLS encendido en todas las tablas
-- ---------------------------------------------------------------------------
select relname as tabla, relrowsecurity as rls_activado
  from pg_class
 where relnamespace = 'public'::regnamespace
   and relkind = 'r'
   and relname in ('productos','niveles','clientes','ventas','venta_items',
                   'comprobantes','series','emisor','profiles',
                   'stock_movimientos','cierres_diarios')
 order by relname;
--  esperado: rls_activado = true en todas.


-- ---------------------------------------------------------------------------
-- 7) RESUMEN: una sola fila con el veredicto
-- ---------------------------------------------------------------------------
with checks as (
  select 'series B001 y F001'            as prueba,
         (select count(*) = 2 from series) as ok
  union all
  select 'emisor vacio (empresa nueva)',
         (select count(*) = 0 from emisor)
  union all
  select 'productos vacios',
         (select count(*) = 0 from productos)
  union all
  select 'ventas vacias',
         (select count(*) = 0 from ventas)
  union all
  select 'funcion registrar_venta existe',
         (select count(*) = 1 from pg_proc where proname = 'registrar_venta')
  union all
  select 'funcion eliminar_venta existe',
         (select count(*) = 1 from pg_proc where proname = 'eliminar_venta')
  union all
  select 'anon NO puede anular ventas',
         (select not has_function_privilege('anon', 'eliminar_venta(int)', 'EXECUTE'))
  union all
  select 'realtime en 8 tablas',
         (select count(*) = 8 from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public')
  union all
  select 'RLS activo en las 11 tablas',
         (select count(*) = 11 from pg_class
           where relnamespace = 'public'::regnamespace
             and relkind = 'r' and relrowsecurity
             and relname in ('productos','niveles','clientes','ventas','venta_items',
                             'comprobantes','series','emisor','profiles',
                             'stock_movimientos','cierres_diarios'))
)
select prueba,
       case when ok then 'OK' else 'FALTA' end as resultado,
       case
         when ok then 'Todo correcto'
         else 'Revisar: la migracion correspondiente no se aplico bien'
       end as detalle
  from checks
 order by resultado, prueba;
--  esperado: las 9 filas deben decir OK. Si alguna dice FALTA, avisame.
