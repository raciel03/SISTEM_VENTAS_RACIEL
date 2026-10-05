-- ============================================================================
-- Empresa nueva: se borran los datos fiscales de la empresa anterior.
-- ============================================================================
-- La migracion 20260928000100 sembro un emisor (DISTRIBUIDORA MILAM S.A.C.,
-- RUC 20614583968) que pertenece al negocio anterior. Este sistema es para una
-- empresa distinta, asi que esa fila no debe quedar.
--
-- No se hace "update" con datos inventados: la empresa nueva todavia no tiene
-- RUC ni razon social confirmados. Se deja la tabla vacia y los datos se
-- cargan cuando el usuario los proportione, leyendo src/config/empresa.ts.

delete from comprobantes;
delete from series_contadores;
delete from series;
delete from emisor;

-- Las series B001/F001 tambien eran de la empresa anterior. Se recrean sin
-- contador, para que el correlativo 1 se genere en el primer comprobante real.
insert into series (tipo_documento, serie, descripcion, activa)
values
  ('01', 'B001', 'Boleta de venta',  true),
  ('03', 'F001', 'Factura de venta', true);

comment on table emisor is
  'Datos fiscales del emisor. Vacia a proposito: la empresa nueva aun no ha registrado su RUC.';
