-- Ajustes para emision de comprobantes
alter type estado_comprobante add value if not exists 'emitido';
alter type estado_comprobante add value if not exists 'emitido_local';

drop policy if exists emisor_crear on emisor;
create policy emisor_crear on emisor for insert to authenticated with check (es_admin());
