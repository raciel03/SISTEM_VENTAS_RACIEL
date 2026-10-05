import { supabase } from './client';
import { aTexto, aNumeroEstricto, num } from './ids';
import type { DailyClose } from './types';

type FilaCierre = {
  id: number;
  fecha_local: string;
  total_ventas: string | number;
  ganancia: string | number;
  total_items: string | number;
  cantidad_ventas: number;
  efectivo: string | number;
  tarjeta: string | number;
  yape: string | number;
  plin: string | number;
  cerrado_en: string;
  nota: string | null;
};

const exigir = <T>(r: { data: T | null; error: { message: string } | null }, ctx: string): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

const aCierre = (f: FilaCierre, cerradoPor: string): DailyClose => ({
  id: aTexto(f.id),
  date: f.fecha_local,
  totalSales: num(f.total_ventas),
  totalProfit: num(f.ganancia),
  totalItems: num(f.total_items),
  salesCount: f.cantidad_ventas,
  paymentMethods: {
    efectivo: num(f.efectivo),
    tarjeta: num(f.tarjeta),
    yape: num(f.yape),
    plin: num(f.plin),
  },
  closedBy: cerradoPor,
  closeTime: f.cerrado_en,
});

const cargarCierres = async (): Promise<DailyClose[]> => {
  const filas = exigir(
    await supabase.from('cierres_diarios').select('*').order('fecha_local', { ascending: false }),
    'getAllDailyCloses'
  ) as unknown as FilaCierre[];

  // El nombre de quien cerro viene del perfil; si ya no existe, queda el id.
  const ids = filas.map((f) => (f as FilaCierre & { cerrado_por?: string | null }).cerrado_por).filter(Boolean) as string[];
  const nombres = new Map<string, string>();
  if (ids.length > 0) {
    const r = (await supabase.from('profiles').select('id, nombre').in('id', ids)) as unknown as {
      data: { id: string; nombre: string }[] | null;
    };
    for (const p of r.data ?? []) nombres.set(p.id, p.nombre);
  }

  return filas.map((f) =>
    aCierre(f, nombres.get((f as FilaCierre & { cerrado_por?: string | null }).cerrado_por ?? '') ?? 'Admin')
  );
};

export const getAllDailyCloses = async (): Promise<DailyClose[]> => cargarCierres();

/** Calcula el cierre del dia a partir de las ventas reales, no de lo que dice la UI. */
export const calcularResumenDelDia = async (fechaLocal: string): Promise<Omit<DailyClose, 'id' | 'closedBy' | 'closeTime'>> => {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;

  const { data, error } = await supabase
    .from('ventas')
    .select('total, ganancia, metodo_pago, venta_items(cantidad)')
    .eq('fecha_local', fechaLocal);
  if (error) throw new Error(error.message);

  const ventas = (data ?? []) as unknown as {
    total: string | number;
    ganancia: string | number;
    metodo_pago: string;
    venta_items: { cantidad: string | number }[] | null;
  }[];

  const pm = { efectivo: 0, tarjeta: 0, yape: 0, plin: 0 };
  let total = 0;
  let ganancia = 0;
  let items = 0;

  for (const v of ventas) {
    const t = num(v.total);
    total += t;
    ganancia += num(v.ganancia);
    if (v.metodo_pago in pm) pm[v.metodo_pago as keyof typeof pm] += t;
    for (const it of v.venta_items ?? []) items += num(it.cantidad);
  }

  return {
    date: fechaLocal,
    totalSales: Number(total.toFixed(2)),
    totalProfit: Number(ganancia.toFixed(2)),
    totalItems: Number(items.toFixed(2)),
    salesCount: ventas.length,
    paymentMethods: pm,
  };
};

export const createDailyClose = async (id: string, data: DailyClose): Promise<DailyClose> => {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Sin sesion: no se puede cerrar la caja');

  const fila = exigir(
    await supabase
      .from('cierres_diarios')
      .insert({
        fecha_local: data.date,
        total_ventas: data.totalSales,
        ganancia: data.totalProfit,
        total_items: data.totalItems,
        cantidad_ventas: data.salesCount,
        efectivo: data.paymentMethods.efectivo,
        tarjeta: data.paymentMethods.tarjeta,
        yape: data.paymentMethods.yape,
        plin: data.paymentMethods.plin,
        cerrado_por: auth.user.id,
        cerrado_en: data.closeTime,
      })
      .select()
      .single(),
    'createDailyClose'
  ) as unknown as FilaCierre;

  return aCierre(fila, data.closedBy);
};

export const updateDailyClose = async (id: string, data: Partial<DailyClose>): Promise<DailyClose> => {
  const cid = aNumeroEstricto(id, 'updateDailyClose');
  const cambios: Record<string, unknown> = {};
  if (data.totalSales !== undefined) cambios.total_ventas = data.totalSales;
  if (data.totalProfit !== undefined) cambios.ganancia = data.totalProfit;
  if (data.totalItems !== undefined) cambios.total_items = data.totalItems;
  if (data.salesCount !== undefined) cambios.cantidad_ventas = data.salesCount;
  if (data.paymentMethods !== undefined) {
    cambios.efectivo = data.paymentMethods.efectivo;
    cambios.tarjeta = data.paymentMethods.tarjeta;
    cambios.yape = data.paymentMethods.yape;
    cambios.plin = data.paymentMethods.plin;
  }
  if (data.closeTime !== undefined) cambios.cerrado_en = data.closeTime;

  if (Object.keys(cambios).length > 0) {
    exigir(await supabase.from('cierres_diarios').update(cambios).eq('id', cid), 'updateDailyClose');
  }
  const fila = exigir(
    await supabase.from('cierres_diarios').select('*').eq('id', cid).single(),
    'updateDailyClose'
  ) as unknown as FilaCierre;
  return aCierre(fila, data.closedBy ?? 'Admin');
};

export const deleteDailyClose = async (id: string): Promise<void> => {
  const cid = aNumeroEstricto(id, 'deleteDailyClose');
  exigir(await supabase.from('cierres_diarios').delete().eq('id', cid), 'deleteDailyClose');
};

export const subscribeDailyCloses = (callback: (closes: DailyClose[]) => void): (() => void) => {
  let vivo = true;
  const cargar = async () => {
    try {
      const c = await cargarCierres();
      if (vivo) callback(c);
    } catch (e) {
      console.error('[subscribeDailyCloses]', e);
    }
  };
  void cargar();
  const canal = supabase
    .channel('cierres-vivo')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'cierres_diarios' }, () => void cargar())
    .subscribe();
  return () => {
    vivo = false;
    void supabase.removeChannel(canal);
  };
};
