-- ═══════════════════════════ PERMISOS DE ACCESO ═══════════════════════════
--
-- Por que esta migracion existe:
--
-- Las tablas de 20260928000100 se crearon con el rol 'postgres'. Los
-- 'default privileges' de ese rol conceden a 'authenticated' SOLO
-- DELETE, TRUNCATE, REFERENCES y TRIGGER: nunca SELECT, INSERT ni UPDATE.
-- Con solo RLS, un usuario autenticado podia entrar pero no leer ni
-- escribir ninguna fila: la app fallaria con "permission denied for table".
--
-- Por eso el orden correcto es: permisos primero, y RLS encima como segunda
-- capa. RLS decide QUE filas puede ver cada usuario; los GRANTs deciden si
-- puede siquiera tocar la tabla.

-- Lectura y escritura general para toda la app.
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;

-- El que no ha iniciado sesion solo puede leer lo que es publico por defecto
-- (series, y el catalogo). RLS se encarga del resto.
grant select on all tables in schema public to anon;

-- El historico y la configuracion sensible no se leen sin sesion.
revoke select on profiles, stock_movimientos, stock_cambios_precio, cierres_diarios from anon;

-- Las funciones son la unica via para el stock y los correlativos.
grant execute on all functions in schema public to authenticated, service_role;

-- Las secuencias alimentan los serial; sin esto el INSERT falla al avanzar.
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Que esto se mantenga solo: las proximas migraciones heredan los mismos
-- permisos sin tener que repetirlos.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to authenticated, service_role;
alter default privileges in schema public
  grant select on tables to anon;
