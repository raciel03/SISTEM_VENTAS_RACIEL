import type { SupabaseUser } from './client';
import { supabase } from './client';

export type User = SupabaseUser;
export type AuthCallback = (user: User | null, event?: string) => void;

// Sesion en memoria: getSession() es async en esta version de supabase-js, pero
// varios llamadores la necesitan sincrona (render). El observador la mantiene
// actualizada en cada cambio de sesion.
let sesionActual: { user: SupabaseUser | null } | null = null;

export const onAuthChange = (callback: AuthCallback): (() => void) => {
  const { data } = supabase.auth.onAuthStateChange((evento, session) => {
    sesionActual = { user: (session?.user as SupabaseUser) ?? null };
    callback((session?.user as SupabaseUser) ?? null, evento);
  });
  return () => data.subscription.unsubscribe();
};

export const loginWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data.user;
};

/**
 * Envia el correo de recuperacion de contrasena. El enlace vuelve a la app,
 * supabase-js procesa el token (detectSessionInUrl) y dispara el evento
 * PASSWORD_RECOVERY, donde la app muestra el formulario de nueva contrasena.
 */
export const enviarResetPassword = async (email: string) => {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw new Error(error.message);
};

/** Reemplaza la contrasena de la sesion actual (flujo de recuperacion). */
export const cambiarPassword = async (nueva: string) => {
  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) throw new Error(error.message);
};

export const registerWithEmail = async (email: string, password: string) => {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  return data.user;
};

/**
 * Google quedo deshabilitado en Supabase: cada proveedor OAuth exige registrar
 * la app y una clave de cliente en el panel. Si se necesita, hay que configurarlo
 * en Settings -> Auth -> Providers. Aqui queda el hueco claro para no fallar en silencio.
 */
export const loginWithGoogle = async (): Promise<User> => {
  throw new Error(
    'El acceso con Google no esta configurado en este proyecto. Usa correo y contrasena, o activa el proveedor en Supabase (Settings > Authentication > Providers > Google).'
  );
};

export const logout = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
};

/** Usuario de la sesion actual, o null si no hay sesion. */
export const getCurrentUser = (): User | null => sesionActual?.user ?? null;

/**
 * Reemplaza los usos de `auth.currentUser?.email` de Firebase.
 * Supabase guarda la sesion de forma sincrona, asi que no hace falta await.
 */
export const getCurrentSupabaseUser = (): User | null => getCurrentUser();

/**
 * Alta de usuarios desde la app. Se delega en la Supabase Edge Function
 * 'crear-usuario' (supabase/functions/crear-usuario), que verifica que quien
 * llama es un administrador activo y crea la cuenta con la clave de servicio
 * que SOLO existe en el servidor. La clave de servicio jamas viaja al navegador.
 */
export const crearUsuarioPorAdmin = async (args: {
  email: string;
  password: string;
  nombre: string;
  rol: 'admin' | 'empleado';
}): Promise<string> => {
  // Adjuntar explícitamente el token de la sesion actual: la funcion lo
  // necesita para validar que quien llama es un admin activo. El auto-attach
  // de invoke() puede correr antes de que la sesion se haya recuperado.
  const { data: sesionRes } = await supabase.auth.getSession();
  const token = sesionRes?.session?.access_token;
  const { data, error } = await supabase.functions.invoke('crear-usuario', {
    body: args,
    ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  });
  if (error) throw new Error(error.message);
  const res = data as { ok?: boolean; id?: string; message?: string };
  if (!res?.ok) throw new Error(res?.message ?? 'La función no respondió correctamente.');
  return res.id as string;
};

/**
 * Envia un enlace de acceso por correo. */
export const sendMagicLink = async (email: string) => {
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) throw new Error(error.message);
};
