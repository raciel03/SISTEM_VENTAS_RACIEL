/**
 * Datos de la empresa que imprime los comprobantes.
 *
 * Se guardan aqui a proposito y NO en la base: son los datos fiscales del
 * negocio y hay que editarlos en un solo lugar. La tabla `emisor` de Supabase
 * guarda la copia que se leyo de esta configuracion, mas el IGV y la serie.
 *
 * IMPORTANTE: esta informacion es de la empresa nueva. La anterior quedo
 * eliminada; completa estos campos con los datos reales antes de emitir
 * comprobantes reales.
 */
export const EMPRESA = {
  ruc: '',
  razonSocial: '',
  nombreComercial: '',
  direccion: '',
  telefono: '',
  email: '',
  /** Tasa de IGV en porcentaje. 18 si estan en el regimen general. */
  igvRate: 18,
  redondeoEfectivo: true,
};

export const moneda = (valor: number): string =>
  `S/ ${(Number.isFinite(valor) ? valor : 0).toFixed(2)}`;

/** Etiqueta de la cabecera del comprobante, con respaldo si falta el RUC. */
export const cabeceraEmpresa = (): string[] => [
  EMPRESA.razonSocial || 'EMPRESA SIN CONFIGURAR',
  EMPRESA.ruc ? `RUC ${EMPRESA.ruc}` : 'RUC PENDIENTE',
  EMPRESA.direccion || 'DIRECCION PENDIENTE',
  EMPRESA.telefono ? `CEL: ${EMPRESA.telefono}` : '',
].filter(Boolean);

/** Avisa si faltan los datos fiscales obligatorios para emitir. */
export const faltaConfiguracionEmisor = (): boolean =>
  !EMPRESA.ruc || !EMPRESA.razonSocial;
