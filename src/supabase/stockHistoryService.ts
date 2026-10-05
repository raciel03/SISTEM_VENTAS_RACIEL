import { supabase } from './client';
import { aTexto, aNumero, aNumeroEstricto, num } from './ids';
import type { StockHistoryItem } from './types';

type FilaMov = {
  id: number;
  producto_id: number;
  nivel_id: number | null;
  tipo: 'restock' | 'venta' | 'inicial' | 'cambio_precio';
  cantidad: string | number;
  stock_resultante: string | number;
  venta_id: number | null;
  descripcion: string | null;
  fecha: string;
};

type FilaCambio = {
  id: number;
  movimiento_id: number;
  nivel_id: number | null;
  precio_venta_anterior: string | number | null;
  precio_venta_nuevo: string | number | null;
  precio_compra_anterior: string | number | null;
  precio_compra_nuevo: string | number | null;
};

const TIPOS: Record<string, StockHistoryItem['type']> = {
  restock: 'restock',
  venta: 'sale',
  inicial: 'initial',
  cambio_precio: 'price_change',
};

const exigir = <T>(r: { data: T | null; error: { message: string } | null }, ctx: string): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

/**
 * Reconstruye el historial. El nombre del producto no se guarda duplicado en
 * cada movimiento: se lee del producto actual, que es como la app lo muestra.
 */
const aHistorial = (movs: FilaMov[], cambios: FilaCambio[], nombres: Map<number, string>): StockHistoryItem[] => {
  const cambiosPorMov = new Map<number, FilaCambio[]>();
  for (const c of cambios) {
    const l = cambiosPorMov.get(c.movimiento_id) ?? [];
    l.push(c);
    cambiosPorMov.set(c.movimiento_id, l);
  }

  return movs.map((m) => {
    const cs = cambiosPorMov.get(m.id) ?? [];
    const item: StockHistoryItem = {
      id: aTexto(m.id),
      productId: aTexto(m.producto_id),
      productName: nombres.get(m.producto_id) ?? 'Producto',
      type: TIPOS[m.tipo] ?? 'restock',
      quantity: num(m.cantidad),
      resultingStock: num(m.stock_resultante),
      date: m.fecha,
    };
    if (m.venta_id !== null) item.saleId = aTexto(m.venta_id);
    if (cs.length > 0) {
      item.priceChanges = cs.map((c) => ({
        levelName: c.nivel_id === null ? 'General' : `Nivel ${c.nivel_id}`,
        oldSalePrice: c.precio_venta_anterior === null ? undefined : num(c.precio_venta_anterior),
        newSalePrice: c.precio_venta_nuevo === null ? undefined : num(c.precio_venta_nuevo),
        oldPurchasePrice: c.precio_compra_anterior === null ? undefined : num(c.precio_compra_anterior),
        newPurchasePrice: c.precio_compra_nuevo === null ? undefined : num(c.precio_compra_nuevo),
      }));
    }
    return item;
  });
};

const nombresDeProductos = async (ids: number[]): Promise<Map<number, string>> => {
  if (ids.length === 0) return new Map();
  const r = (await supabase.from('productos').select('id, nombre').in('id', ids)) as unknown as {
    data: { id: number; nombre: string }[] | null;
    error: { message: string } | null;
  };
  if (r.error) return new Map();
  return new Map((r.data ?? []).map((p) => [p.id, p.nombre]));
};

const cargarHistorial = async (filtro?: { productoId?: string; limite?: number }): Promise<StockHistoryItem[]> => {
  let q = supabase.from('stock_movimientos').select('*').order('fecha', { ascending: false });
  if (filtro?.productoId !== undefined) {
    const pid = aNumero(filtro.productoId);
    if (pid === null) return [];
    q = q.eq('producto_id', pid);
  }
  if (filtro?.limite !== undefined) q = q.limit(filtro.limite);

  const movs = exigir(await q, 'getAllStockHistory') as unknown as FilaMov[];
  if (movs.length === 0) return [];

  const cambios = exigir(
    await supabase.from('stock_cambios_precio').select('*').in('movimiento_id', movs.map((m) => m.id)),
    'getAllStockHistory:cambios'
  ) as unknown as FilaCambio[];

  const nombres = await nombresDeProductos([...new Set(movs.map((m) => m.producto_id))]);
  return aHistorial(movs, cambios, nombres);
};

export const getAllStockHistory = async (): Promise<StockHistoryItem[]> => cargarHistorial();

export const getStockHistoryByProduct = async (productId: string): Promise<StockHistoryItem[]> =>
  cargarHistorial({ productoId: productId });

export const getRecentStockHistory = async (limite = 200): Promise<StockHistoryItem[]> =>
  cargarHistorial({ limite });

export const createStockHistoryItem = async (id: string, data: StockHistoryItem): Promise<StockHistoryItem> => {
  const pid = aNumeroEstricto(data.productId, 'createStockHistoryItem');
  const tipo: FilaMov['tipo'] =
    data.type === 'sale' ? 'venta' : data.type === 'initial' ? 'inicial' : data.type === 'price_change' ? 'cambio_precio' : 'restock';

  const mov = exigir(
    await supabase
      .from('stock_movimientos')
      .insert({
        producto_id: pid,
        tipo: tipo,
        cantidad: data.quantity,
        stock_resultante: data.resultingStock,
        venta_id: data.saleId === undefined ? null : (aNumero(data.saleId) ?? null),
        descripcion: data.levelDescription ?? null,
        fecha: data.date,
      })
      .select()
      .single(),
    'createStockHistoryItem'
  ) as unknown as FilaMov;

  if (data.priceChanges && data.priceChanges.length > 0) {
    await supabase.from('stock_cambios_precio').insert(
      data.priceChanges.map((c) => ({
        movimiento_id: mov.id,
        precio_venta_anterior: c.oldSalePrice ?? null,
        precio_venta_nuevo: c.newSalePrice ?? null,
        precio_compra_anterior: c.oldPurchasePrice ?? null,
        precio_compra_nuevo: c.newPurchasePrice ?? null,
      }))
    );
  }

  const nombres = await nombresDeProductos([pid]);
  return aHistorial([mov], [], nombres)[0];
};

export const updateStockHistoryItem = async (
  id: string,
  data: Partial<StockHistoryItem>
): Promise<StockHistoryItem> => {
  const mid = aNumeroEstricto(id, 'updateStockHistoryItem');
  const cambios: Record<string, unknown> = {};
  if (data.quantity !== undefined) cambios.cantidad = data.quantity;
  if (data.resultingStock !== undefined) cambios.stock_resultante = data.resultingStock;
  if (data.date !== undefined) cambios.fecha = data.date;
  if (data.levelDescription !== undefined) cambios.descripcion = data.levelDescription;

  if (Object.keys(cambios).length > 0) {
    exigir(await supabase.from('stock_movimientos').update(cambios).eq('id', mid), 'updateStockHistoryItem');
  }
  const mov = exigir(
    await supabase.from('stock_movimientos').select('*').eq('id', mid).single(),
    'updateStockHistoryItem'
  ) as unknown as FilaMov;
  const nombres = await nombresDeProductos([mov.producto_id]);
  return aHistorial([mov], [], nombres)[0];
};

export const deleteStockHistoryItem = async (id: string): Promise<void> => {
  const mid = aNumeroEstricto(id, 'deleteStockHistoryItem');
  exigir(await supabase.from('stock_movimientos').delete().eq('id', mid), 'deleteStockHistoryItem');
};

export const subscribeStockHistory = (callback: (items: StockHistoryItem[]) => void): (() => void) => {
  let vivo = true;
  const cargar = async () => {
    try {
      const h = await cargarHistorial({ limite: 500 });
      if (vivo) callback(h);
    } catch (e) {
      console.error('[subscribeStockHistory]', e);
    }
  };
  void cargar();
  const canal = supabase
    .channel('stock-vivo')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_movimientos' }, () => void cargar())
    .subscribe();
  return () => {
    vivo = false;
    void supabase.removeChannel(canal);
  };
};

/**
 * Registra una entrada de stock (restock) y actualiza el stock del producto
 * con la funcion bloqueante, para que dos cajas no descuenten de mas.
 */
export const registrarRestock = async (productId: string, cantidad: number, descripcion?: string): Promise<number> => {
  const pid = aNumeroEstricto(productId, 'registrarRestock');
  const r = exigir(
    await supabase.rpc('aumentar_stock_producto', { p_producto_id: pid, p_cantidad: cantidad }),
    'registrarRestock'
  );
  const stock = num(Array.isArray(r) ? r[0] : r, 0);

  await supabase.from('stock_movimientos').insert({
    producto_id: pid,
    tipo: 'restock',
    cantidad: cantidad,
    stock_resultante: stock,
    descripcion: descripcion ?? null,
  });
  return stock;
};
