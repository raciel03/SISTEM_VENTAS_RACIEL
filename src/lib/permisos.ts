import { supabase } from '../supabase/client';
import { getCurrentSupabaseUser } from '../supabase/auth';

/**
 * Permisos de acciones sensibles.
 *
 * Antes cada accion destructiva pedia la contrasena del administrador. Eso ya no
 * hace falta: Supabase Auth sabe quien esta conectado y la base de datos (RLS)
 * impide el borrado si no eres admin. Aqui solo se comprueba el rol para dar un
 * mensaje claro en vez de un error generico de la base.
 */
export type RolUsuario = 'admin' | 'empleado' | null;

const ROLES_VALIDOS: RolUsuario[] = ['admin', 'empleado', null];

/** Rol del usuario conectado, leido del perfil en la base de datos. */
export const getCurrentRole = async (): Promise<RolUsuario> => {
  const usuario = getCurrentSupabaseUser();
  if (!usuario) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('rol, activo')
    .eq('id', usuario.id)
    .maybeSingle();

  if (error || !data) return null;
  const perfil = data as unknown as { rol: string; activo: boolean };
  if (!perfil.activo) return null;

  return (ROLES_VALIDOS.find((r) => r === perfil.rol) ?? null) as RolUsuario;
};

export const esAdminActual = async (): Promise<boolean> => (await getCurrentRole()) === 'admin';

/**
 * Pide confirmacion antes de una accion irreversible.
 * Reemplaza la ventana de contrasena: el boton dice que va a pasar y el
 * permiso lo aplica la base de datos, no el navegador.
 */
export const confirmarAccionPeligrosa = async (
  titulo: string,
  descripcion: string
): Promise<boolean> => {
  const ok = window.confirm(
    `${titulo}\n\n${descripcion}\n\nEsta accion no se puede deshacer.`
  );
  return ok;
};
