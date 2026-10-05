// TRASLADOR DE IDs
// La app trabaja con IDs de tipo texto ("1", "42") y compara con ===.
// La base de datos usa enteros (serial). Este archivo es la frontera:
//   - Salida hacia la app  -> SIEMPRE texto
//   - Entrada hacia la base -> SIEMPRE entero
//
// Regla: "1" y "0001" y 1 son el mismo producto.

/** Convierte un id de la base (number | string) a texto para la app. */
export const aTexto = (id: number | string | bigint | null | undefined): string => {
  if (id === null || id === undefined) return '';
  if (typeof id === 'number') return String(id);
  // BigInt puede venir si la columna fuera bigint
  if (typeof id === 'bigint') return id.toString();
  return String(id);
};

/**
 * Convierte un id de la app a entero para consultar la base.
 * Acepta "1", "0001", " 1 " y 1.
 * Si el id no es un número entero válido devuelve null, para que la
 * consulta no falle de forma silenciosa.
 */
export const aNumero = (id: string | number | null | undefined): number | null => {
  if (id === null || id === undefined) return null;
  if (typeof id === 'number') return Number.isInteger(id) ? id : null;
  const limpio = String(id).trim();
  if (limpio === '') return null;
  // Solo digitos: evita que "12abc" se convierta en 12 en silencio.
  if (!/^\d+$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isSafeInteger(n) ? n : null;
};

/** Igual que aNumero pero lanza error si el id no es valido. */
export const aNumeroEstricto = (id: string | number | null | undefined, contexto = 'id'): number => {
  const n = aNumero(id);
  if (n === null) throw new Error(`Id invalido para ${contexto}: ${String(id)}`);
  return n;
};

/** Compara dos ids sin importar si vienen como texto o como numero. */
export const mismoId = (a: string | number | null | undefined, b: string | number | null | undefined): boolean => {
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return aTexto(a) === aTexto(b);
};

/** Convierte un array de filas de la base a objetos con id de texto. */
export const aTextos = <T extends { id: number | string }>(filas: T[]): (Omit<T, 'id'> & { id: string })[] =>
  filas.map((f) => ({ ...f, id: aTexto(f.id) }));

/**
 * Postgres devuelve numeric como string para no perder precision.
 * La app espera number en precios, stock y cantidades.
 */
export const num = (v: unknown, porDefecto = 0): number => {
  if (v === null || v === undefined || v === '') return porDefecto;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : porDefecto;
};

/** Elimina claves con valor undefined, que Supabase rechaza. */
export const sinUndefined = <T extends Record<string, unknown>>(obj: T): Partial<T> => {
  const salida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) salida[k] = v;
  }
  return salida as Partial<T>;
};

/** Lanza si Supabase devolvio error, con mensaje util para la UI. */
export const exigir = <T>(resultado: { data: T | null; error: { message: string } | null }, contexto: string): T => {
  if (resultado.error) {
    console.error(`[${contexto}]`, resultado.error.message);
    throw new Error(resultado.error.message);
  }
  return resultado.data as T;
};
