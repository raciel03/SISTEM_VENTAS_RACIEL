import { supabase } from './client';
import { aTexto, aNumeroEstricto, num } from './ids';

/**
 * Comprobantes (boleta / factura).
 *
 * El numero NO lo decide la app: lo asigna la funcion `siguiente_correlativo`
 * de Postgres, que incrementa el contador con `on conflict ... do update` dentro
 * de la misma sentencia. Asi dos cajas abiertas a la vez nunca repiten numero.
 */
export interface Comprobante {
  id: string;
  serie_id: string;
  serie: string;
  anio: number;
  correlativo: number;
  numero: string;
  tipo_documento: string;
  venta_id: string;
  cliente_id: string;
  total_gravada: number;
  total_igv: number;
  total_venta: number;
  estado: string;
  fecha_emision: string;
  sunat_ticket: string;
}

/** Columnas reales de la tabla `comprobantes`. */
type FilaComprobante = {
  id: number;
  serie_id: number;
  anio: number;
  correlativo: number;
  tipo_documento: string;
  venta_id: number | null;
  cliente_id: number | null;
  total_gravada: string | number;
  total_igv: string | number;
  total_venta: string | number;
  estado: string;
  fecha_emision: string;
  sunat_ticket: string | null;
  series?: { serie: string } | null;
};

const SELECT = `
  id, serie_id, anio, correlativo, tipo_documento, venta_id, cliente_id,
  total_gravada, total_igv, total_venta, estado, fecha_emision, sunat_ticket,
  series ( serie )
`;

const aComprobante = (f: FilaComprobante): Comprobante => {
  const serie = f.series?.serie ?? '';
  return {
    id: aTexto(f.id),
    serie_id: aTexto(f.serie_id),
    serie,
    anio: f.anio,
    correlativo: f.correlativo,
    numero: serie ? `${serie}-${String(f.correlativo).padStart(6, '0')}` : aTexto(f.correlativo),
    tipo_documento: f.tipo_documento,
    venta_id: f.venta_id === null ? '' : aTexto(f.venta_id),
    cliente_id: f.cliente_id === null ? '' : aTexto(f.cliente_id),
    total_gravada: num(f.total_gravada),
    total_igv: num(f.total_igv),
    total_venta: num(f.total_venta),
    estado: f.estado,
    fecha_emision: f.fecha_emision,
    sunat_ticket: f.sunat_ticket ?? '',
  };
};

const exigir = <T>(r: { data: T | null; error: { message: string } | null }, ctx: string): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export const getAllComprobantes = async (): Promise<Comprobante[]> => {
  const filas = exigir(
    await supabase.from('comprobantes').select(SELECT).order('fecha_emision', { ascending: false }),
    'getAllComprobantes'
  ) as unknown as FilaComprobante[];
  return filas.map(aComprobante);
};

export const getComprobantesByVenta = async (ventaId: string): Promise<Comprobante[]> => {
  const filas = exigir(
    await supabase
      .from('comprobantes')
      .select(SELECT)
      .eq('venta_id', aNumeroEstricto(ventaId, 'getComprobantesByVenta'))
      .order('fecha_emision', { ascending: false }),
    'getComprobantesByVenta'
  ) as unknown as FilaComprobante[];
  return filas.map(aComprobante);
};

/**
 * Emite un comprobante para una venta. El total llega con IGV incluido, asi que
 * la base y el IGV se separan aqui con la misma regla que usa la app.
 */
export const emitirComprobante = async (params: {
  ventaId: string;
  serie: string;
  clienteId?: string | null;
  tipoDocumento?: '01' | '03';
  totalVenta: number;
  igvRate: number;
  datosCliente?: Record<string, unknown>;
}): Promise<Comprobante> => {
  const { ventaId, serie, clienteId = null, tipoDocumento = '01', totalVenta, igvRate } = params;

  // La serie debe existir y estar activa; si no, la funcion lanza el error.
  const serieRow = exigir(
    await supabase.from('series').select('id, tipo_documento').eq('serie', serie).eq('activa', true).maybeSingle(),
    'emitirComprobante:serie'
  ) as unknown as { id: number; tipo_documento: string } | null;
  if (!serieRow) throw new Error(`La serie ${serie} no existe o esta inactiva`);

  const anio = new Date().getFullYear();
  const correlativo = exigir(
    await supabase.rpc('siguiente_correlativo', { p_serie: serie, p_anio: anio }),
    'emitirComprobante:correlativo'
  ) as unknown as number;

  // Total con IGV incluido: base = total / (1 + tasa/100).
  const base = totalVenta / (1 + igvRate / 100);
  const totalIgv = totalVenta - base;
  const totalGravada = Math.round(base * 100) / 100;
  const totalRedondeado = Math.round(totalVenta * 100) / 100;

  const fila = exigir(
    await supabase
      .from('comprobantes')
      .insert({
        serie_id: serieRow.id,
        anio,
        correlativo,
        tipo_documento: tipoDocumento ?? serieRow.tipo_documento,
        venta_id: aNumeroEstricto(ventaId, 'emitirComprobante'),
        cliente_id: clienteId === null ? null : aNumeroEstricto(clienteId, 'emitirComprobante:cliente'),
        datos_cliente: params.datosCliente ?? {},
        total_gravada: totalGravada,
        total_igv: totalRedondeado - totalGravada,
        total_venta: totalRedondeado,
        estado: 'emitido',
      })
      .select(SELECT)
      .single(),
    'emitirComprobante'
  ) as unknown as FilaComprobante;

  return aComprobante(fila);
};

/** Anula un comprobante. No lo borra: el correlativo queda consumido. */
export const anularComprobante = async (id: string): Promise<void> => {
  const r = await supabase
    .from('comprobantes')
    .update({ estado: 'anulado' })
    .eq('id', aNumeroEstricto(id, 'anularComprobante'));
  if (r.error) throw new Error(r.error.message);
};


export const getComprobanteById = async (id: string): Promise<Comprobante | null> => {
  const filas = exigir(
    await supabase.from('comprobantes').select(SELECT).eq('id', aNumeroEstricto(id, 'getComprobanteById')),
    'getComprobanteById'
  ) as unknown as FilaComprobante[]
  return filas[0] ? aComprobante(filas[0]) : null
}

export const updateComprobanteSunat = async (
  id: string,
  r: { estado: string; sunatTicket?: string; cdrHash?: string; urlPdf?: string; urlXml?: string; error?: string },
): Promise<void> => {
  const fila: Record<string, unknown> = { estado: r.estado }
  if (r.sunatTicket !== undefined) fila.sunat_ticket = r.sunatTicket
  if (r.cdrHash !== undefined) fila.cdr_hash = r.cdrHash
  if (r.urlPdf !== undefined) fila.url_pdf = r.urlPdf
  if (r.urlXml !== undefined) fila.url_xml = r.urlXml
  if (r.error !== undefined) fila.error = r.error
  const { error } = await supabase
    .from('comprobantes')
    .update(fila)
    .eq('id', aNumeroEstricto(id, 'updateComprobanteSunat'))
  if (error) throw new Error(error.message)
}

export const subscribeComprobantes = (callback: (c: Comprobante[]) => void): (() => void) => {
  let vivo = true
  const cargar = async () => {
    try {
      const c = await getAllComprobantes()
      if (vivo) callback(c)
    } catch (e) {
      console.error('[subscribeComprobantes]', e)
    }
  }
  void cargar()
  const canal = supabase
    .channel('comprobantes-vivo')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'comprobantes' }, () => void cargar())
    .subscribe()
  return () => {
    vivo = false
    void supabase.removeChannel(canal)
  }
}
