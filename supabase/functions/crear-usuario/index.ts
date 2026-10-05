// ─────────────────────────────────────────────────────────────────────────────
// crear-usuario: alta de cuentas desde el modal "Usuarios" de la app.
//
// Por que existe: crear una cuenta de acceso exige la clave de servicio de
// Supabase, que por seguridad jamas puede vivir en el navegador. Esta funcion
// vive en el servidor de Supabase y es la UNICA via para que la app cree
// cuentas: verifica que quien llama es un administrador activo (con su propio
// token) y, si lo es, crea el usuario con la clave de servicio.
//
// El trigger crear_perfil_al_registrarse() de la base genera la fila en
// `profiles` automaticamente (rol por defecto: empleado). Si el admin pidio
// rol 'admin', aqui se promueve el perfil recien creado.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from 'jsr:@supabase/supabase-js@2';

const appUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // La app envia 'x-application-name' (header global del cliente); sin incluirlo
  // aqui, el navegador bloquea el preflight y falla con "Failed to send a request
  // to the Edge Function".
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, message: 'Metodo no permitido. Usa POST.' }, 405);
  }

  try {
    // 1) Verificar que quien llama es un usuario autenticado.
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) {
      return json({ ok: false, message: 'Falta el token de sesion.' }, 401);
    }
    const lector = createClient(appUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: quien, error: errToken } = await lector.auth.getUser(token);
    if (errToken || !quien?.user) {
      return json({ ok: false, message: 'Sesion invalida o vencida.' }, 401);
    }

    // 2) Verificar que es un ADMINISTRADOR ACTIVO.
    const { data: perfil } = await lector
      .from('profiles')
      .select('rol, activo')
      .eq('id', quien.user.id)
      .maybeSingle();
    if (!perfil || perfil.rol !== 'admin' || !perfil.activo) {
      return json({ ok: false, message: 'Solo un administrador activo puede crear cuentas.' }, 403);
    }

    // 3) Validar los datos que envia la app.
    const cuerpo: { email?: string; password?: string; nombre?: string; rol?: string } =
      await req.json();
    const email = (cuerpo.email ?? '').trim().toLowerCase();
    const password = cuerpo.password ?? '';
    const nombre = (cuerpo.nombre ?? '').trim();
    const rol = cuerpo.rol === 'admin' ? 'admin' : 'empleado';

    if (!EMAIL_RE.test(email)) {
      return json({ ok: false, message: 'Correo con formato invalido.' }, 400);
    }
    if (password.length < 6) {
      return json({ ok: false, message: 'La contrasena debe tener al menos 6 caracteres.' }, 400);
    }
    if (!nombre) {
      return json({ ok: false, message: 'Falta el nombre completo.' }, 400);
    }

    // 4) Crear la cuenta (la clave de servicio nunca sale del servidor).
    const servicio = createClient(appUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: creado, error: errCrear } = await servicio.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre },
    });
    if (errCrear) {
      return json({ ok: false, message: errCrear.message }, 400);
    }
    const idNuevo = creado.user?.id;
    if (!idNuevo) {
      return json({ ok: false, message: 'El usuario se creo sin id.' }, 500);
    }

    // 5) Si pidieron rol admin, promover el perfil (por defecto sale empleado).
    if (rol === 'admin') {
      const { error: errRol } = await servicio
        .from('profiles')
        .update({ rol: 'admin' })
        .eq('id', idNuevo);
      if (errRol) {
        // La cuenta existe; el rol se dejo por defecto. Que lo liquide el admin.
        return json({ ok: false, message: `Cuenta creada, pero no se pudo marcar admin: ${errRol.message}` }, 500);
      }
    }

    return json({ ok: true, id: idNuevo, email });
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : 'Error interno.' }, 500);
  }
});