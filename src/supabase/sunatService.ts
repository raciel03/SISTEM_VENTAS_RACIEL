import type { Comprobante } from './comprobanteService'
import type { Emisor } from './emisorService'
import type { Cliente } from './clientService'

export type EstadoSunat = 'emitido_local' | 'aceptado' | 'observado' | 'rechazado'

export interface ResultadoSunat {
  estado: EstadoSunat
  sunatTicket?: string
  cdrHash?: string
  urlPdf?: string
  urlXml?: string
  error?: string
}

export const OSE_CONFIG = {
  activo: false,
  proveedor: '',
  urlBase: (import.meta.env.VITE_OSE_URL as string | undefined) ?? '',
  token: (import.meta.env.VITE_OSE_TOKEN as string | undefined) ?? '',
}

export const emitirSunat = async (
  comprobante: Comprobante,
  emisor: Emisor | null,
  cliente: Cliente | null,
): Promise<ResultadoSunat> => {
  if (!OSE_CONFIG.activo || !OSE_CONFIG.urlBase) {
    return { estado: 'emitido_local' }
  }
  try {
    const resp = await fetch(`${OSE_CONFIG.urlBase}/comprobantes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OSE_CONFIG.token}` },
      body: JSON.stringify({ comprobante, emisor, cliente }),
    })
    const j = await resp.json().catch(() => ({}))
    return {
      estado: j.estado === 'aceptado' ? 'aceptado' : j.estado === 'rechazado' ? 'rechazado' : 'observado',
      sunatTicket: j.ticket,
      cdrHash: j.cdr_hash,
      urlPdf: j.url_pdf,
      urlXml: j.url_xml,
      error: j.error,
    }
  } catch (e) {
    return { estado: 'emitido_local', error: e instanceof Error ? e.message : 'Error OSE' }
  }
}

export const anularSunat = async (): Promise<ResultadoSunat> => {
  if (!OSE_CONFIG.activo || !OSE_CONFIG.urlBase) return { estado: 'emitido_local' }
  return { estado: 'emitido_local' }
}
