import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Falla aqui y no en la primera consulta: si la key falta o sigue siendo el
 * marcador de posicion, el error aparece al cargar la app en vez de varias
 * pantallas despues con "Failed to fetch".
 */
const PLACEHOLDER = 'PENDIENTE';
const sinConfigurar = (v?: string) => !v || !v.trim() || v.includes(PLACEHOLDER);

if (sinConfigurar(url) || sinConfigurar(publishableKey)) {
  throw new Error(
    'Supabase sin configurar. En el archivo .env define VITE_SUPABASE_URL y ' +
      'VITE_SUPABASE_PUBLISHABLE_KEY con los datos del proyecto ' +
      '(Settings > API del panel de Supabase).',
  );
}

export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // true: supabase-js procesa solo los enlaces de recuperacion de contrasena
    // (?code/token_hash) que llegan por la URL, claves para el flujo
    // "¿Olvidaste tu contrasena?". El inicio de sesion normal no se afecta.
    detectSessionInUrl: true,
  },
  global: {
    headers: { 'x-application-name': 'sistema-de-ventas-supa' },
  },
});

export const SUPABASE_URL = url;

/** Tipo minimo del usuario de Supabase que usa la app. */
export type SupabaseUser = {
  id: string;
  email: string | null;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};
