-- ═══════════════════════════ ESCALADA DE PRIVILEGIOS ═══════════════════════════
--
-- Por que esta migracion existe:
--
-- La politica 'profiles_editar' es
--     using (es_admin() or id = auth.uid())
-- es decir: cada usuario puede editar SU PROPIA fila. El problema es que
-- 'rol' y 'activo' viven en ESA MISMA fila. Un empleado autenticado podia
-- basta con ejecutar
--     update profiles set rol = 'admin' where id = auth.uid();
-- y convertirse en admin. Ese par de campos son la base de toda la
-- seguridad de la app: con rol = 'admin' pasa a poder borrar ventas,
-- anular comprobantes, cambiar el IGV y cerrar caja.
--
-- RLS no puede razonar por columna, asi que el filtro va en un trigger.

create or replace function proteger_perfil_privilegiado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.rol is distinct from old.rol) or (new.activo is distinct from old.activo) then
    if not es_admin() then
      raise exception
        'No puedes cambiar tu propio rol ni activar/desactivar cuentas. Solo un administrador puede hacerlo.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_perfil on profiles;
create trigger trg_proteger_perfil
  before update on profiles
  for each row execute function proteger_perfil_privilegiado();

-- El admin puede crear y deactivate cuentas (alta de empleados, suspension).
-- La app lo hara con service_role desde el servidor, no desde el navegador,
-- asi que se permite tambien via service_role sin cambios.
comment on function proteger_perfil_privilegiado() is
  'Impide que un usuario cambie su propio rol o su estado activo. Solo es_admin() puede.';
