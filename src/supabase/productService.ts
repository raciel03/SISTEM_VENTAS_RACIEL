import { supabase } from './client';
import { aTexto, aNumero, aNumeroEstricto, num, sinUndefined, exigir } from './ids';
import type { Product, SaleLevel } from './types';

type FilaProducto = {
  id: number;
  nombre: string;
  tipo: 'unidad' | 'peso' | 'mayorista';
  categoria: string;
  stock: string | number;
  stock_inicial: string | number;
  precio_compra: string | number;
  precio_venta: string | number;
  precio_compra_kg: string | number | null;
  precio_venta_kg: string | number | null;
  gramos_equivalentes: string | number | null;
  gramos_minimos: string | number | null;
  unidad_base: string | null;
  unidades_por_base: string | number | null;
  imagen_url: string | null;
  activo: boolean;
};

type FilaNivel = {
  id: number;
  producto_id: number;
  nombre: string;
  unidades_contenidas: string | number;
  precio_compra: string | number;
  precio_venta: string | number;
  stock: string | number;
  stock_inicial: string | number;
  orden: number;
};

const aProducto = (f: FilaProducto, niveles: SaleLevel[]): Product => ({
  id: aTexto(f.id),
  name: f.nombre,
  type: f.tipo,
  category: f.categoria,
  stock: num(f.stock),
  initialStock: num(f.stock_inicial),
  purchasePrice: num(f.precio_compra),
  salePrice: num(f.precio_venta),
  purchasePricePerKg: f.precio_compra_kg === null ? undefined : num(f.precio_compra_kg),
  salePricePerKg: f.precio_venta_kg === null ? undefined : num(f.precio_venta_kg),
  equivalentGrams: f.gramos_equivalentes === null ? undefined : num(f.gramos_equivalentes),
  minWeightGrams: f.gramos_minimos === null ? undefined : num(f.gramos_minimos),
  baseUnit: f.unidad_base ?? undefined,
  unitsPerBase: f.unidades_por_base === null ? undefined : num(f.unidades_por_base),
  imageUrl: f.imagen_url ?? undefined,
  saleLevels: niveles.length > 0 ? niveles : undefined,
});

const aNivel = (f: FilaNivel): SaleLevel => ({
  id: aTexto(f.id),
  name: f.nombre,
  baseUnitsContained: num(f.unidades_contenidas),
  purchasePrice: num(f.precio_compra),
  salePrice: num(f.precio_venta),
  stock: num(f.stock),
  initialStock: num(f.stock_inicial),
});

/** Carga productos con sus niveles agrupados en una sola pasada. */
const cargarProductos = async (): Promise<Product[]> => {
  const productos = exigir(
    await supabase
      .from('productos')
      .select('*')
      .eq('activo', true)
      .order('id', { ascending: true }),
    'getAllProducts'
  ) as unknown as FilaProducto[];

  if (productos.length === 0) return [];

  const ids = productos.map((p) => p.id);
  const niveles = exigir(
    await supabase
      .from('niveles')
      .select('*')
      .in('producto_id', ids)
      .order('orden', { ascending: true }),
    'getAllProducts:niveles'
  ) as unknown as FilaNivel[];

  const porProducto = new Map<number, SaleLevel[]>();
  for (const n of niveles) {
    const lista = porProducto.get(n.producto_id) ?? [];
    lista.push(aNivel(n));
    porProducto.set(n.producto_id, lista);
  }

  return productos.map((p) => aProducto(p, porProducto.get(p.id) ?? []));
};

export const getAllProducts = async (): Promise<Product[]> => cargarProductos();

export const getProductById = async (id: string): Promise<Product | null> => {
  const pid = aNumero(id);
  if (pid === null) return null;
  const todos = await cargarProductos();
  return todos.find((p) => p.id === aTexto(pid)) ?? null;
};

/** Inserta el producto y sus niveles. Devuelve el producto con el id real. */
export const createProduct = async (id: string, data: Product): Promise<Product> => {
  const fila = exigir(
    await supabase
      .from('productos')
      .insert({
        nombre: data.name,
        tipo: data.type,
        categoria: data.category || 'General',
        stock: data.stock,
        stock_inicial: data.initialStock ?? data.stock,
        precio_compra: data.purchasePrice,
        precio_venta: data.salePrice,
        precio_compra_kg: data.purchasePricePerKg ?? null,
        precio_venta_kg: data.salePricePerKg ?? null,
        gramos_equivalentes: data.equivalentGrams ?? null,
        gramos_minimos: data.minWeightGrams ?? null,
        unidad_base: data.baseUnit ?? null,
        unidades_por_base: data.unitsPerBase ?? null,
        imagen_url: data.imageUrl ?? null,
      })
      .select()
      .single(),
    'createProduct'
  ) as unknown as FilaProducto;

  const creado = aProducto(fila, []);

  if (data.saleLevels && data.saleLevels.length > 0) {
    const filasNivel = data.saleLevels.map((n, i) => ({
      producto_id: fila.id,
      nombre: n.name,
      unidades_contenidas: n.baseUnitsContained,
      precio_compra: n.purchasePrice,
      precio_venta: n.salePrice,
      stock: n.stock,
      stock_inicial: n.initialStock,
      orden: i,
    }));
    const insertados = exigir(
      await supabase.from('niveles').insert(filasNivel).select(),
      'createProduct:niveles'
    ) as unknown as FilaNivel[];
    creado.saleLevels = insertados.map(aNivel);
  }

  return creado;
};

export const updateProduct = async (id: string, data: Partial<Product>): Promise<Product> => {
  const pid = aNumeroEstricto(id, 'updateProduct');

  const cambios: Record<string, unknown> = {};
  if (data.name !== undefined) cambios.nombre = data.name;
  if (data.category !== undefined) cambios.categoria = data.category;
  if (data.type !== undefined) cambios.tipo = data.type;
  if (data.stock !== undefined) cambios.stock = data.stock;
  if (data.initialStock !== undefined) cambios.stock_inicial = data.initialStock;
  if (data.purchasePrice !== undefined) cambios.precio_compra = data.purchasePrice;
  if (data.salePrice !== undefined) cambios.precio_venta = data.salePrice;
  if (data.purchasePricePerKg !== undefined) cambios.precio_compra_kg = data.purchasePricePerKg;
  if (data.salePricePerKg !== undefined) cambios.precio_venta_kg = data.salePricePerKg;
  if (data.equivalentGrams !== undefined) cambios.gramos_equivalentes = data.equivalentGrams;
  if (data.minWeightGrams !== undefined) cambios.gramos_minimos = data.minWeightGrams;
  if (data.baseUnit !== undefined) cambios.unidad_base = data.baseUnit;
  if (data.unitsPerBase !== undefined) cambios.unidades_por_base = data.unitsPerBase;
  if (data.imageUrl !== undefined) cambios.imagen_url = data.imageUrl;

  if (Object.keys(cambios).length > 0) {
    exigir(
      await supabase.from('productos').update(cambios).eq('id', pid),
      'updateProduct'
    );
  }

  // Los niveles se sincronizan por nombre: se actualizan los existentes y se
  // crean los nuevos. Los que desaparecen se desactivan.
  if (data.saleLevels !== undefined) {
    const actuales = exigir(
      await supabase.from('niveles').select('*').eq('producto_id', pid),
      'updateProduct:niveles'
    ) as unknown as FilaNivel[];

    const porNombre = new Map(actuales.map((n) => [n.nombre, n]));
    const nombresNuevos = new Set(data.saleLevels.map((n) => n.name));

    for (const nivel of data.saleLevels) {
      const existente = porNombre.get(nivel.name);
      if (existente) {
        const campos = sinUndefined({
          unidades_contenidas: nivel.baseUnitsContained,
          precio_compra: nivel.purchasePrice,
          precio_venta: nivel.salePrice,
          stock: nivel.stock,
          stock_inicial: nivel.initialStock,
        });
        if (Object.keys(campos).length > 0) {
          await supabase.from('niveles').update(campos).eq('id', existente.id);
        }
      } else {
        await supabase.from('niveles').insert({
          producto_id: pid,
          nombre: nivel.name,
          unidades_contenidas: nivel.baseUnitsContained,
          precio_compra: nivel.purchasePrice,
          precio_venta: nivel.salePrice,
          stock: nivel.stock,
          stock_inicial: nivel.initialStock,
          orden: data.saleLevels.findIndex((n) => n.name === nivel.name),
        });
      }
    }

    const sobrantes = actuales.filter((n) => !nombresNuevos.has(n.nombre));
    if (sobrantes.length > 0) {
      await supabase.from('niveles').delete().in('id', sobrantes.map((n) => n.id));
    }
  }

  return (await getProductById(id)) as Product;
};

/**
 * Borrado logico: la app tiene ventas historicas que apuntan a productos.
 * Un borrado fisico dejaria esas ventas huerfanas.
 */
export const deleteProduct = async (id: string): Promise<void> => {
  const pid = aNumeroEstricto(id, 'deleteProduct');
  exigir(await supabase.from('productos').update({ activo: false }).eq('id', pid), 'deleteProduct');
};

/** Suscripcion en vivo a productos. Devuelve la funcion para cancelar. */
export const subscribeProducts = (callback: (products: Product[]) => void): (() => void) => {
  let vivo = true;

  const cargar = async () => {
    try {
      const productos = await cargarProductos();
      if (vivo) callback(productos);
    } catch (e) {
      console.error('[subscribeProducts]', e);
    }
  };

  void cargar();

  const canal = supabase
    .channel('productos-vivo')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'productos' }, () => void cargar())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'niveles' }, () => void cargar())
    .subscribe();

  return () => {
    vivo = false;
    void supabase.removeChannel(canal);
  };
};

/**
 * Suscripcion en vivo a productos. Devuelve la funcion para cancelar.
 * Nota: requiere que productos y niveles esten en la publicacion
 * `supabase_realtime` (ver migracion 20260928000600).
 */
