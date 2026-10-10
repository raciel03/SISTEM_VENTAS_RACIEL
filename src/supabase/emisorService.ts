import { supabase } from './client'
import { num } from './ids'

export interface Emisor {
  id: string
  ruc: string
  razonSocial: string
  nombreComercial?: string
  direccion?: string
  telefono?: string
  email?: string
  igvRate: number
  redondeoEfectivo: boolean
  ambiente: string
  logoUrl?: string
}

type FilaEmisor = {
  id: number
  ruc: string
  razon_social: string
  nombre_comercial: string | null
  direccion: string | null
  telefono: string | null
  email: string | null
  igv_rate: string | number
  redondeo_efectivo: boolean
  ambiente: string
  logo_url: string | null
}

const aEmisor = (f: FilaEmisor): Emisor => ({
  id: String(f.id),
  ruc: f.ruc,
  razonSocial: f.razon_social,
  nombreComercial: f.nombre_comercial ?? undefined,
  direccion: f.direccion ?? undefined,
  telefono: f.telefono ?? undefined,
  email: f.email ?? undefined,
  igvRate: num(f.igv_rate, 18),
  redondeoEfectivo: f.redondeo_efectivo,
  ambiente: f.ambiente,
  logoUrl: f.logo_url ?? undefined,
})

export const getEmisor = async (): Promise<Emisor | null> => {
  const { data, error } = await supabase.from('emisor').select('*').eq('id', 1).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? aEmisor(data as unknown as FilaEmisor) : null
}

export interface EmisorInput {
  ruc: string
  razonSocial: string
  nombreComercial?: string
  direccion?: string
  telefono?: string
  email?: string
  igvRate?: number
  redondeoEfectivo?: boolean
  logoUrl?: string
}

export const saveEmisor = async (input: EmisorInput): Promise<Emisor> => {
  const fila = {
    id: 1,
    ruc: input.ruc.trim(),
    razon_social: input.razonSocial.trim(),
    nombre_comercial: input.nombreComercial?.trim() || null,
    direccion: input.direccion?.trim() || null,
    telefono: input.telefono?.trim() || null,
    email: input.email?.trim() || null,
    igv_rate: input.igvRate ?? 18,
    redondeo_efectivo: input.redondeoEfectivo ?? true,
    ambiente: 'produccion',
    logo_url: input.logoUrl ?? null,
  }
  const { data, error } = await supabase
    .from('emisor')
    .upsert(fila, { onConflict: 'id' })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return aEmisor(data as unknown as FilaEmisor)
}
