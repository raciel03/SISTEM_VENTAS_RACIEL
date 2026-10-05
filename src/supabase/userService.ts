import { supabase } from './client';
import { exigir } from './ids';

/**
 * Perfil del usuario autenticado, enlazado a auth.users por el mismo uuid.
 * La tabla `profiles` la crea automaticamente el trigger `trg_crear_perfil`
 * cuando alguien se registra, asi que aqui solo se lee y actualiza.
 */
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'empleado';
}

type FilaProfile = {
  id: string;
  email: string;
  nombre: string;
  rol: 'admin' | 'empleado';
  activo: boolean;
};

const aPerfil = (f: FilaProfile): UserProfile => ({
  uid: f.id,
  email: f.email,
  displayName: f.nombre,
  role: f.rol,
});

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const f = data as unknown as FilaProfile;
  if (!f.activo) return null;
  return aPerfil(f);
};

export const getAllUsers = async (): Promise<UserProfile[]> => {
  const filas = exigir(
    await supabase.from('profiles').select('*').order('nombre', { ascending: true }),
    'getAllUsers'
  ) as unknown as FilaProfile[];
  return filas.map(aPerfil);
};

export const getUserByEmail = async (email: string): Promise<UserProfile | null> => {
  const { data, error } = await supabase.from('profiles').select('*').eq('email', email).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? aPerfil(data as unknown as FilaProfile) : null;
};

export const updateUserProfile = async (uid: string, data: Partial<UserProfile>): Promise<UserProfile> => {
  const cambios: Record<string, unknown> = {};
  if (data.displayName !== undefined) cambios.nombre = data.displayName;
  if (data.role !== undefined) cambios.rol = data.role;
  if (Object.keys(cambios).length > 0) {
    exigir(await supabase.from('profiles').update(cambios).eq('id', uid), 'updateUserProfile');
  }
  return (await getUserProfile(uid)) as UserProfile;
};

export const deleteUserProfile = async (uid: string): Promise<void> => {
  exigir(await supabase.from('profiles').update({ activo: false }).eq('id', uid), 'deleteUserProfile');
};

/**
 * Crear perfiles ya no lo hace la app: el alta se hace en el panel de Supabase
 * y el trigger de la base genera la fila de `profiles` automaticamente.
 */
export const createUserProfile = async (
  _uid: string,
  _data: Omit<UserProfile, 'uid'>
): Promise<UserProfile> => {
  throw new Error(
    'El alta de usuarios se hace desde Supabase (Authentication > Users > Add user). El perfil se crea solo.'
  );
};
