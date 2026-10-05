import { supabase } from './client';
import { aTexto, aNumero, aNumeroEstricto, num } from './ids';
import type { Sale, SaleItem, Product } from './types';

type FilaVenta = {
  id: number;
  fecha: string;
  fecha_local: string;
  cliente_id: number | null;
  subtotal: string | number;
  igv: string | number;
  igv_rate: string | number;
  total: string | number;
  ganancia: string | number;
  metodo_pago: 'efectivo' | 'tarjeta' | 'yape' | 'plin';
  monto_recibido: string | number | null;
  vuelto: string | number;
};

type FilaItem = {
  id: number;
  venta_id: number;
  producto_id: number | null;
  nivel_id: number | null;
  nombre_producto: string;
  tipo_producto: 'unidad' | 'peso' | 'mayorista';
  cantidad: string | number;
  precio_compra_unit: string | number;
  precio_venta_unit: string | number;
  total_linea: string | number;
};

const METODOS = ['efectivo', 'tarjeta', 'yape', 'plin'] as const;
const metodoValido = (m: string): Sale['paymentMethod'] =>
  (METODOS as readonly string[]).includes(m) ? (m as Sale['paymentMethod']) : 'efectivo';

/**
 * Reconstruye una venta. Los items guardan una foto del producto (nombre, precio,
 * stock) para que un cierre de caja antiguo siga mostrando lo que se vendio,
 * aunque el producto luego cambie de precio.
 */
const aVenta = (f: FilaVenta, items: FilaItem[]): Sale => {
  const m = metodoValido(f.metodo_pago);
  const subtotal = num(f.subtotal);
  const total = num(f.total);
  return {
    id: aTexto(f.id),
    items: items.map((i) => ({
      product: {
        id: aTexto(i.producto_id ?? 0),
        name: i.nombre_producto,
        type: i.tipo_producto,
        category: '',
        stock: 0,
        initialStock: 0,
        purchasePrice: num(i.precio_compra_unit),
        salePrice: num(i.precio_venta_unit),
      } as Product,
      quantity: num(i.cantidad),
      totalLinea: num(i.total_linea),
    } as SaleItem)),
    subtotal,
    igv: num(f.igv),
    igvRate: num(f.igv_rate),
    total,
    totalProfit: num(f.ganancia),
    date: f.fecha,
    localDate: f.fecha_local,
    paymentMethod: m,
    amountPaid: f.monto_recibido === null ? undefined : num(f.monto_recibido),
    change: num(f.vuelto),
  };
};

const cargarVentas = async (limite?: number): Promise<Sale[]> => {
  let q = supabase.from('ventas').select('*').order('fecha', { ascending: false });
  if (limite !== undefined) q = q.limit(limite);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const ventas = data as unknown as FilaVenta[];
  if (ventas.length === 0) return [];

  const { data: datosItems, error: errItems } = await supabase
    .from('venta_items')
    .select('*')
    .in('venta_id', ventas.map((v) => v.id))
    .order('id', { ascending: true });
  if (errItems) throw new Error(errItems.message);

  const items = (datosItems ?? []) as unknown as FilaItem[];

  const porVenta = new Map<number, FilaItem[]>();
  for (const it of items) {
    const lista = porVenta.get(it.venta_id) ?? [];
    lista.push(it);
    porVenta.set(it.venta_id, lista);
  }

  return ventas.map((v) => aVenta(v, porVenta.get(v.id) ?? []));
};

export const getAllSales = async (): Promise<Sale[]> => cargarVentas();

export const getRecentSales = async (limite = 500): Promise<Sale[]> => cargarVentas(limite);

export const getSaleById = async (id: string): Promise<Sale | null> => {
  const sid = aNumero(id);
  if (sid === null) return null;
  const { data, error } = await supabase.from('ventas').select('*').eq('id', sid).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { data: datosItems, error: errItems } = await supabase
    .from('venta_items')
    .select('*')
    .eq('venta_id', sid)
    .order('id', { ascending: true });
  if (errItems) throw new Error(errItems.message);
  return aVenta(data as unknown as FilaVenta, (datosItems ?? []) as unknown as FilaItem[]);
};

/**
 * Registra la venta completa (cabecera, items y descuento de stock) en una sola
 * transaccion, mediante la funcion `registrar_venta` de Postgres.
 *
 * Antes se hacia en 3 pasos desde el navegador. Si un producto no tenia stock,
 * ya se habian descontado los anteriores: el inventario quedava inflado y la
 * venta se borraba a medias. Ahora Postgres valida todo el stock ANTES de
 * escribir, y si algo falla no queda ni venta ni descuento.
 *
 * El descuento es siempre sobre el stock general del producto, en unidades.
 * Los niveles (Paquete, Millar...) solo quedan registrados como referencia.
 */
export const createSale = async (_id: string, data: Sale): Promise<Sale> => {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Sin sesion: no se puede registrar la venta');
  if (data.items.length === 0) throw new Error('La venta no tiene items');

  const items = data.items.map((it) => {
    const pid = aNumero(it.product.id);
    if (pid === null) {
      throw new Error(`El producto "${it.product.name}" no tiene un id valido`);
    }
    return {
      producto_id: pid,
      nivel_id: (it.product as { levelId?: number | string }).levelId ?? null,
      nombre_producto: it.product.name,
      tipo_producto: it.product.type,
      cantidad: it.quantity,
      precio_compra_unit: it.product.purchasePrice,
      precio_venta_unit: it.product.salePrice,
      total_linea: Number((it.quantity * it.product.salePrice).toFixed(2)),
    };
  });

  const { data: ventaId, error } = await supabase.rpc('registrar_venta', {
    p_cliente_id: (data as { clientId?: string | number }).clientId ? aNumero((data as { clientId?: string | number }).clientId) : null,
    p_subtotal: data.subtotal,
    p_igv: data.igv,
    p_igv_rate: data.igvRate,
    p_total: data.total,
    p_ganancia: data.totalProfit,
    p_metodo_pago: data.paymentMethod,
    p_monto_recibido: data.amountPaid ?? null,
    p_vuelto: data.change ?? 0,
    p_items: items,
  });
  if (error) throw new Error(error.message);

  const venta = await getSaleById(aTexto(ventaId));
  if (!venta) throw new Error('La venta se guardo pero no se pudo leer de vuelta');
  return venta;
};

export const updateSale = async (id: string, data: Partial<Sale>): Promise<Sale> => {
  const sid = aNumeroEstricto(id, 'updateSale');
  const cambios: Record<string, unknown> = {};
  if (data.subtotal !== undefined) cambios.subtotal = data.subtotal;
  if (data.igv !== undefined) cambios.igv = data.igv;
  if (data.igvRate !== undefined) cambios.igv_rate = data.igvRate;
  if (data.total !== undefined) cambios.total = data.total;
  if (data.totalProfit !== undefined) cambios.ganancia = data.totalProfit;
  if (data.paymentMethod !== undefined) cambios.metodo_pago = data.paymentMethod;
  if (data.amountPaid !== undefined) cambios.monto_recibido = data.amountPaid;
  if (data.change !== undefined) cambios.vuelto = data.change;

  if (Object.keys(cambios).length > 0) {
    const { error } = await supabase.from('ventas').update(cambios).eq('id', sid);
    if (error) throw new Error(error.message);
  }
  return (await getSaleById(id)) as Sale;
};

/**
 * Elimina la venta y devuelve el stock de sus items, en una sola transaccion
 * (funcion `eliminar_venta`). Si algo falla, no se devuelve stock ni se borra
 * nada: el inventario nunca queda desfasado.
 */
export const deleteSale = async (id: string): Promise<void> => {
  const sid = aNumeroEstricto(id, 'deleteSale');
  const { error } = await supabase.rpc('eliminar_venta', { p_venta_id: sid });
  if (error) throw new Error(error.message);
};

export const subscribeSales = (callback: (sales: Sale[]) => void): (() => void) => {
  let vivo = true;

  const cargar = async () => {
    try {
      const ventas = await cargarVentas(500);
      if (vivo) callback(ventas);
    } catch (e) {
      console.error('[subscribeSales]', e);
    }
  };

  void cargar();

  const canal = supabase
    .channel('ventas-vivo')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas' }, () => void cargar())
    .subscribe();

  return () => {
    vivo = false;
    void supabase.removeChannel(canal);
  };
};
