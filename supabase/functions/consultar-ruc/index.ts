// Consultar RUC - Consulta Perú API
import { createClient } from 'jsr:@supabase/supabase-js@2'

const appUrl = Deno.env.get('SUPABASE_URL') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const consultaUrl = Deno.env.get('CONSULTA_PERU_URL') ?? ''
const consultaToken = Deno.env.get('CONSULTA_PERU_TOKEN') ?? ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, message: 'Metodo no permitido. Usa POST.' }, 405)

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ ok: false, message: 'Falta el token de sesion.' }, 401)
    const lector = createClient(appUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: quien, error: errToken } = await lector.auth.getUser(token)
    if (errToken || !quien?.user) return json({ ok: false, message: 'Sesion invalida o vencida.' }, 401)

    const { ruc } = await req.json().catch(() => ({ ruc: '' }))
    const limpio = String(ruc ?? '').replace(/\D/g, '')
    if (limpio.length !== 11) return json({ ok: false, message: 'El RUC debe tener 11 digitos.' }, 400)
    if (!consultaUrl || !consultaToken) {
      return json({ ok: false, message: 'Consulta de RUC no configurada (secrets CONSULTA_PERU_URL / CONSULTA_PERU_TOKEN).' }, 500)
    }

    const resp = await fetch(`${consultaUrl}${limpio}`, {
      headers: { Authorization: `Bearer ${consultaToken}`, Accept: 'application/json' },
    })
    const raw = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      return json({ ok: false, message: (raw as any)?.message ?? `El proveedor respondio ${resp.status}.` }, 502)
    }

    const d = (raw as any)?.data ?? raw
    return json({
      ok: true,
      data: {
        ruc: limpio,
        razonSocial: d.nombre_o_razon_social ?? d.razon_social ?? d.razonSocial ?? '',
        nombreComercial: d.nombre_comercial ?? undefined,
        direccion: d.direccion ?? d.domicilio_fiscal ?? d.direccion_fiscal ?? undefined,
        estado: d.estado_del_contribuyente ?? d.estado ?? undefined,
        condicion: d.condicion_de_domicilio ?? d.condicion ?? undefined,
      },
    })
  } catch (e) {
    return json({ ok: false, message: e instanceof Error ? e.message : 'Error interno.' }, 500)
  }
})
