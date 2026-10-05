import { supabase } from './client';
import { aTexto, aNumeroEstricto, aTexto as txt } from './ids';

type FilaCliente = {
  id: number;
  tipo_documento: string;
  numero_documento: string;
  razon_social: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  activo: boolean;
};

export interface Cliente {
  id: string;
  tipoDocumento: string;
  numeroDocumento: string;
  razonSocial: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  activo: boolean;
}

const aCliente = (f: FilaCliente): Cliente => ({
  id: txt(f.id),
  tipoDocumento: f.tipo_documento,
  numeroDocumento: f.numero_documento,
  razonSocial: f.razon_social,
  direccion: f.direccion ?? undefined,
  telefono: f.telefono ?? undefined,
  email: f.email ?? undefined,
  activo: f.activo,
});

const exigir = <T>(r: { data: T | null; error: { message: string } | null }, ctx: string): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export const getAllClients = async (): Promise<Cliente[]> => {
  const filas = exigir(
    await supabase.from('clientes').select('*').eq('activo', true).order('razon_social', { ascending: true }),
    'getAllClients'
  ) as unknown as FilaCliente[];
  return filas.map(aCliente);
};

export const getClientById = async (id: string): Promise<Cliente | null> => {
  const cid = Number(id);
  if (!Number.isInteger(cid)) return null;
  const r = await supabase.from('clientes').select('*').eq('id', cid).maybeSingle();
  if (r.error) throw new Error(r.error.message);
  return r.data ? aCliente(r.data as unknown as FilaCliente) : null;
};

export const createClient = async (data: Omit<Cliente, 'id' | 'activo'>): Promise<Cliente> => {
  const fila = exigir(
    await supabase
      .from('clientes')
      .insert({
        tipo_documento: data.tipoDocumento || '0',
        numero_documento: data.numeroDocumento,
        razon_social: data.razonSocial,
        direccion: data.direccion ?? null,
        telefono: data.telefono ?? null,
        email: data.email ?? null,
      })
      .select()
      .single(),
    'createClient'
  ) as unknown as FilaCliente;
  return aCliente(fila);
};

export const updateClient = async (id: string, data: Partial<Cliente>): Promise<Cliente> => {
  const cid = aNumeroEstricto(id, 'updateClient');
  const cambios: Record<string, unknown> = {};
  if (data.tipoDocumento !== undefined) cambios.tipo_documento = data.tipoDocumento;
  if (data.numeroDocumento !== undefined) cambios.numero_documento = data.numeroDocumento;
  if (data.razonSocial !== undefined) cambios.razon_social = data.razonSocial;
  if (data.direccion !== undefined) cambios.direccion = data.direccion;
  if (data.telefono !== undefined) cambios.telefono = data.telefono;
  if (data.email !== undefined) cambios.email = data.email;
  if (data.activo !== undefined) cambios.activo = data.activo;

  if (Object.keys(cambios).length > 0) {
    exigir(await supabase.from('clientes').update(cambios).eq('id', cid), 'updateClient');
  }
  return (await getClientById(aTexto(cid))) as Cliente;
};

/** Borrado logico: las ventas historicas siguen necesitando el cliente. */
export const deleteClient = async (id: string): Promise<void> => {
  const cid = aNumeroEstricto(id, 'deleteClient');
  exigir(await supabase.from('clientes').update({ activo: false }).eq('id', cid), 'deleteClient');
};

export const subscribeClients = (callback: (clientes: Cliente[]) => void): (() => void) => {
  let vivo = true;
  const cargar = async () => {
    try {
      const c = await getAllClients();
      if (vivo) callback(c);
    } catch (e) {
      console.error('[subscribeClients]', e);
    }
  };
  void cargar();
  const canal = supabase
    .channel('clientes-vivo')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => void cargar())
    .subscribe();
  return () => {
    vivo = false;
    void supabase.removeChannel(canal);
  };
};
