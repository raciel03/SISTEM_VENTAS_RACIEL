-- ═══════════════════════ REACTIVAR ADMINISTRADOR ═══════════════════════
--
-- Correccion de datos: el perfil de bynasza@gmail.com quedó con activo=false
-- (por una prueba anterior a la migracion 008). Con datos en ese estado el
-- dueno no aparece en la lista de Usuarios ni puede crear cuentas desde la
-- app, porque la app y la Edge Function exigen un admin activo.
--
-- El trigger 'proteger_perfil_privilegiado' bloquea CUALQUIER cambio de
-- activo/rol en un perfil admin (incluso una reactivacion legitima), por eso
-- aqui los triggers se desactivan solo durante el UPDATE y se re-activan al
-- momento. La reactivacion corre como dueno de la tabla (postgres), luego
-- RLS no aplica.

alter table profiles disable trigger user;
update profiles set activo = true where lower(email) = 'bynasza@gmail.com' and not activo;
alter table profiles enable trigger user;