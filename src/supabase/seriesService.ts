import { supabase } from './client';
import { aTexto, exigir } from './ids';

export interface Serie {
  id: string;
  tipoDocumento: string;
  serie: string;
  descripcion?: string;
  activa: boolean;
}

const exigir2 = <T>(r: { data: T | null; error: { message: string } | null }, ctx: string): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

type FilaSerie = {
  id: number;
  tipo_documento: string;
  serie: string;
  descripcion: string | null;
  activa: boolean;
};

const aSerie = (f: FilaSerie): Serie => ({
  id: aTexto(f.id),
  tipoDocumento: f.tipo_documento,
  serie: f.serie,
  descripcion: f.descripcion ?? undefined,
  activa: f.activa,
});

export const getAllSeries = async (): Promise<Serie[]> => {
  const filas = exigir2(
    await supabase.from('series').select('*').order('serie', { ascending: true }),
    'getAllSeries'
  ) as unknown as FilaSerie[];
  return filas.map(aSerie);
};

/**
 * Pide el siguiente numero de la serie a Postgres.
 * El contador vive en la base (series_contadores), no en la app, para que dos
 * cajas simultaneas no generen el mismo numero.
 */
export const siguienteNumero = async (serie: string, anio: number): Promise<number> => {
  const r = exigir(await supabase.rpc('siguiente_correlativo', { p_serie: serie, p_anio: anio }), 'siguienteNumero');
  return Array.isArray(r) ? Number(r[0]) : Number(r);
};

/**
 * Numero completo del ULTIMO comprobante emitido: B001-000042.
 *
 * Ojo: NO usa `siguiente_correlativo` a proposito. Esa funcion incrementa el
 * contador, asi que llamarla solo para mostrar un numero gastaria un
 * correlativo y dejaria un hueco en la numeracion. Para ver cual seria el
 * siguiente, se lee el contador actual y se suma uno en memoria.
 */
export const ultimoNumeroCompleto = async (serie: string, anio: number): Promise<string> => {
  const { data, error } = await supabase
    .from('series_contadores')
    .select('ultimo_numero, series ( serie )')
    .eq('anio', anio)
    .eq('series.serie', serie)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const ultimo = (data as unknown as { ultimo_numero: number } | null)?.ultimo_numero ?? 0;
  return `${serie}-${String(ultimo).padStart(6, '0')}`;
};

/** El siguiente correlativo que se usara, sin consumirlo. */
export const previsualizarSiguiente = async (serie: string, anio: number): Promise<string> => {
  const { data, error } = await supabase
    .from('series_contadores')
    .select('ultimo_numero, series ( serie )')
    .eq('anio', anio)
    .eq('series.serie', serie)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const ultimo = (data as unknown as { ultimo_numero: number } | null)?.ultimo_numero ?? 0;
  return `${serie}-${String(ultimo + 1).padStart(6, '0')}`;
};

export const crearSerie = async (serie: string, tipoDocumento: string, descripcion?: string): Promise<Serie> => {
  const fila = exigir2(
    await supabase
      .from('series')
      .insert({ serie, tipo_documento: tipoDocumento, descripcion: descripcion ?? null })
      .select()
      .single(),
    'crearSerie'
  ) as unknown as FilaSerie;
  return aSerie(fila);
};

export const desactivarSerie = async (id: string): Promise<void> => {
  const r = await supabase.from('series').update({ activa: false }).eq('id', Number(id));
  if (r.error) throw new Error(r.error.message);
};
