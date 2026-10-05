-- ═══════════════════════ ADMINISTRADORES INMOVIBLES DESDE LA APP ═══════════════════════
--
-- Por que esta migracion existe:
--
-- La politica 'profiles_borrar' (es_admin()) permite a un administrador BORRAR
-- cualquier fila de profiles, y el trigger 'proteger_perfil_privilegiado'
-- permite a un admin desactivar (activo=false) o degradar (rol) a CUALQUIER
-- otra cuenta. Eso significa que con acceso a la pantalla de Usuarios, el
-- dueno podria equivocarse y bloquear/degradar a otro admin, o un admin
-- deshonesto podria borrar a los demas.
--
-- Regla de negocio: los perfiles con rol='admin' se gestionan SOLO desde el
-- panel de Supabase (con clave de servicio). Desde la app nadie puede:
--   1) desactivarlos (activo = false)
--   2) degradarlos (rol -> empleado)
--   3) borrarlos (delete)
--
-- Ademas, esta migracion CONSERVA el ajuste de bootstrap aplicado a mano en
-- el panel: cuando NO hay sesion (auth.uid() is null, por ejemplo al dar de
-- alta el primer admin desde Authentication > Users), los cambios de perfil
-- se permiten. Sin ese hueco no se podria crear la primera cuenta admin.

create or replace function proteger_perfil_privilegiado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.rol is distinct from old.rol) or (new.activo is distinct from old.activo) then
    -- Antes era "si no eres admin, error". Ahora es "si HAY sesion Y no eres
    -- admin, error": sin sesion (panel) se permite el bootstrap del primer admin.
    if auth.uid() is not null and not es_admin() then
      raise exception
        'No puedes cambiar tu propio rol ni activar/desactivar cuentas. Solo un administrador puede hacerlo.'
        using errcode = '42501';
    end if;
    -- Los admins tampoco se desactivan ni se degradan desde la app.
    if old.rol = 'admin' then
      raise exception
        'Los administradores no se desactivan ni se degradan desde la app. Gestionalo en el panel de Supabase.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function impedir_borrar_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.rol = 'admin' then
    raise exception
      'Los administradores no se eliminan desde la app. Gestionalo en el panel de Supabase.'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_impedir_borrar_admin on profiles;
create trigger trg_impedir_borrar_admin
  before delete on profiles
  for each row execute function impedir_borrar_admin();

comment on function impedir_borrar_admin() is
  'Impide borrar perfiles con rol admin desde la app; solo el panel con clave de servicio.';