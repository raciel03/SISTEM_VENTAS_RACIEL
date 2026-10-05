import { supabase } from './client';
import { aTexto, aNumero, num } from './ids';

/**
 * La app guarda su lista de usuarios en la tabla `profiles`, que se enlaza con
 * `auth.users` por el mismo id (uuid). El campo `password` que usaba la app
 * anterior ya no aplica: la contrasena la maneja Supabase Auth y nunca se
 * guarda en la base de datos de la app.
 */
export interface AppUser {
  id: string;
  email: string;
  role: 'admin' | 'empleado';
  name: string;
  createdAt: string;
  firebaseUid?: string;
}

type FilaProfile = {
  id: string;
  email: string;
  nombre: string;
  rol: 'admin' | 'empleado';
  activo: boolean;
  creado_en: string;
};

const exigir = <T>(r: { data: T | null; error: { message: string } | null }, ctx: string): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

const aAppUser = (f: FilaProfile): AppUser => ({
  id: aTexto(f.id),
  email: f.email,
  role: f.rol,
  name: f.nombre,
  createdAt: f.creado_en,
  firebaseUid: aTexto(f.id),
});

const cargarUsuarios = async (): Promise<AppUser[]> => {
  // Solo se listan perfiles activos: los bloqueados no deben seguir apareciendo.
  const filas = exigir(
    await supabase.from('profiles').select('*').eq('activo', true).order('nombre', { ascending: true }),
    'getAllLocalUsers'
  ) as unknown as FilaProfile[];
  return filas.map(aAppUser);
};

export const getAllLocalUsers = async (): Promise<AppUser[]> => cargarUsuarios();

export const getLocalUserById = async (id: string): Promise<AppUser | null> => {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? aAppUser(data as unknown as FilaProfile) : null;
};

export const getUserByEmail = async (email: string): Promise<AppUser | null> => {
  const { data, error } = await supabase.from('profiles').select('*').eq('email', email).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? aAppUser(data as unknown as FilaProfile) : null;
};

/**
 * Actualiza nombre y rol de un usuario existente.
 * El alta de usuarios se hace desde el panel de Supabase; aqui solo se edita
 * el perfil ya creado (el trigger de la base impide autoascenso de rol).
 */
export const updateLocalUser = async (id: string, data: Partial<AppUser>): Promise<AppUser> => {
  const cambios: Record<string, unknown> = {};
  if (data.name !== undefined) cambios.nombre = data.name;
  if (data.role !== undefined) cambios.rol = data.role;
  if (Object.keys(cambios).length > 0) {
    exigir(await supabase.from('profiles').update(cambios).eq('id', id), 'updateLocalUser');
  }
  return (await getLocalUserById(id)) as AppUser;
};

export const deleteLocalUser = async (id: string): Promise<void> => {
  // Se marca inactivo, no se borra de auth.users (eso lo hace el panel).
  exigir(await supabase.from('profiles').update({ activo: false }).eq('id', id), 'deleteLocalUser');
};

export const subscribeLocalUsers = (callback: (users: AppUser[]) => void): (() => void) => {
  let vivo = true;
  const cargar = async () => {
    try {
      const u = await cargarUsuarios();
      if (vivo) callback(u);
    } catch (e) {
      console.error('[subscribeLocalUsers]', e);
    }
  };
  void cargar();
  const canal = supabase
    .channel('usuarios-vivo')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => void cargar())
    .subscribe();
  return () => {
    vivo = false;
    void supabase.removeChannel(canal);
  };
};

export const createLocalUser = async (
  _id: string,
  _data: AppUser
): Promise<AppUser> => {
  throw new Error(
    'El alta de usuarios se hace desde Supabase (Authentication > Users > Add user). Esta accion requiere una clave de servicio que no puede estar en el navegador.'
  );
};

export const isAdmin = (user: AppUser | null | undefined): boolean => user?.role === 'admin';
export const toNum = num;
export const toId = aNumero;
