-- ============================================================================
-- Realtime: publica las tablas que la app necesita escuchar en vivo.
-- ============================================================================
-- Los servicios (productService, saleService, stockHistoryService,
-- dailyCloseService) se suscriben con postgres_changes para que dos cajas
-- abiertas vean los cambios al instante. Sin esto, la suscripcion se conecta
-- sin recibir ningun evento y la app solo se actualiza al recargar.

do $$
declare
  t text;
begin
  -- En Supabase la publicacion ya existe, pero se crea si faltara para que el
  -- archivo no falle en una base nueva o restaurada.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach t in array array[
    'productos', 'niveles', 'ventas', 'venta_items',
    'stock_movimientos', 'stock_cambios_precio', 'cierres_diarios', 'profiles'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
