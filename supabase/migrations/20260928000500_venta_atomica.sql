-- ============================================================================
-- Venta atomica: registra cabecera + items + descuenta stock, todo o nada.
-- ============================================================================
-- Antes la app hacia 3 pasos separados (insert venta, insert items, y un RPC
-- de descuento por item). Si un item fallaba por stock, ya habia descontado los
-- anteriores: el inventario quedaba inflado y la venta se borraba a medias.
--
-- Esta funcion lo resuelve en una sola transaccion. Si CUALQUIER producto no
-- tiene stock suficiente, se revierte todo: no queda venta ni items, y el stock
-- queda intacto.

create or replace function registrar_venta(
  p_cliente_id       int,
  p_subtotal         numeric,
  p_igv              numeric,
  p_igv_rate         numeric,
  p_total            numeric,
  p_ganancia         numeric,
  p_metodo_pago      metodo_pago,
  p_monto_recibido   numeric,
  p_vuelto           numeric,
  p_items            jsonb
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_venta_id  int;
  v_item      jsonb;
  v_producto  int;
  v_cantidad  numeric;
  v_stock     numeric;
  v_total     numeric;
  v_nombre    text;
  v_tipo      tipo_producto;
begin
  if not esta_activo() then
    raise exception 'Sesion no permitida: usuario inactivo o no autenticado';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene items';
  end if;

  -- Validar TODO el stock antes de escribir nada. Asi el error aparece antes
  -- de crear la cabecera y no hay que deshacer nada.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- nullif(...,'') evita el error "invalid input syntax" si la app manda un
    -- campo vacio en vez de omitirlo.
    v_producto := nullif(v_item->>'producto_id', '')::int;
    v_cantidad := nullif(v_item->>'cantidad', '')::numeric;

    if v_producto is null then
      raise exception 'Un item no tiene producto';
    end if;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cantidad invalida en el producto %', v_producto;
    end if;

    -- for update RESERVA la fila: si otra caja esta vendiendo el mismo producto
    -- a la vez, esta venta espera en vez de leer un stock viejo. Es lo que
    -- impide vender dos veces las mismas unidades.
    select stock into v_stock from productos where id = v_producto for update;
    if v_stock is null then
      raise exception 'El producto % no existe', v_producto;
    end if;
    if v_stock < v_cantidad then
      raise exception 'Stock insuficiente: quedan % y se venden % (producto %)',
        v_stock, v_cantidad, v_producto;
    end if;
  end loop;

  -- Cabecera
  insert into ventas (
    cliente_id, subtotal, igv, igv_rate, total, ganancia,
    metodo_pago, monto_recibido, vuelto, usuario_id
  )
  values (
    p_cliente_id, p_subtotal, p_igv, p_igv_rate, p_total, p_ganancia,
    p_metodo_pago, p_monto_recibido, p_vuelto, auth.uid()
  )
  returning id into v_venta_id;

  -- Items + descuento de stock
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_producto := nullif(v_item->>'producto_id', '')::int;
    v_cantidad := nullif(v_item->>'cantidad', '')::numeric;
    v_total    := coalesce(nullif(v_item->>'total_linea', '')::numeric, 0);

    -- Se vuelve a leer el producto en CADA iteracion (no se reutiliza el valor
    -- del bucle de validacion, que al final guardaria el del ultimo producto).
    -- La fila ya esta reservada con "for update", asi que no hay coste extra.
    select coalesce(nullif(p.nombre, ''), 'Producto ' || p.id), p.tipo
      into v_nombre, v_tipo
      from productos p
     where p.id = v_producto;

    insert into venta_items (
      venta_id, producto_id, nivel_id, nombre_producto, tipo_producto,
      cantidad, precio_compra_unit, precio_venta_unit, total_linea
    )
    values (
      v_venta_id,
      v_producto,
      nullif(v_item->>'nivel_id', '')::int,
      v_nombre,
      v_tipo,
      v_cantidad,
      coalesce(nullif(v_item->>'precio_compra_unit', '')::numeric, 0),
      coalesce(nullif(v_item->>'precio_venta_unit', '')::numeric, 0),
      v_total
    );

    -- El stock SIEMPRE se descuenta del stock general del producto, en unidades.
    -- Los niveles (Paquete, Millar...) son solo referencia informativa.
    perform descontar_stock_producto(v_producto, v_cantidad);

    -- Movimiento de historial, para poder auditar el descuento.
    insert into stock_movimientos (
      producto_id, tipo, cantidad, stock_resultante, venta_id, descripcion, usuario_id
    )
    select
      v_producto, 'sale', v_cantidad, stock, v_venta_id,
      'Venta ' || v_venta_id, auth.uid()
    from productos where id = v_producto;
  end loop;

  return v_venta_id;
end;
$$;

revoke execute on function registrar_venta(
  int, numeric, numeric, numeric, numeric, numeric, metodo_pago, numeric, numeric, jsonb
) from public;
grant execute on function registrar_venta(
  int, numeric, numeric, numeric, numeric, numeric, metodo_pago, numeric, numeric, jsonb
) to authenticated;


-- ============================================================================
-- Anular venta: devuelve el stock y borra la venta, todo en una transaccion.
-- ============================================================================
-- Antes la app repovia el stock item por item y despues borraba la venta. Si el
-- borrado fallaba, el inventario habia拍戏ado de mas. Aqui es indivisible.

create or replace function eliminar_venta(p_venta_id int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
begin
  -- Primero "activo": asi un usuario desactivado recibe el mensaje que le
  -- corresponde en vez de un confuso "no eres administrador".
  if not esta_activo() then
    raise exception 'Sesion no permitida: usuario inactivo o no autenticado';
  end if;

  -- OJO: por ser SECURITY DEFINER, esta funcion se ejecuta con los permisos
  -- del dueño y POR ESO SE SALTA las politicas de RLS. La politica
  -- ventas_borrar (que exige es_admin()) no se aplicaria aqui. Si no se
  -- comprueba el rol a mano, CUALQUIER empleado podria anular cualquier venta
  -- llamando a este RPC desde la consola del navegador. Esta linea es la unica
  -- barrera, no se debe quitar.
  if not es_admin() then
    raise exception 'Solo un administrador puede anular una venta';
  end if;

  if not exists (select 1 from ventas where id = p_venta_id) then
    return;  -- ya no existe: no hay nada que hacer
  end if;

  -- Una venta con boleta o factura emitida NO se puede borrar: el correlativo
  -- ya se entrego y el comprobante debe anularse por su propio flujo. Si se
  -- permitiera, quedaria una boleta sin venta, y anularla otra vez devolveria
  -- el stock por duplicado.
  if exists (select 1 from comprobantes where venta_id = p_venta_id) then
    raise exception
      'La venta % ya tiene comprobante emitido. Anula primero el comprobante.',
      p_venta_id;
  end if;

  -- Devolver el stock de cada item (siempre sobre el stock general).
  for v_item in
    select producto_id, cantidad
      from venta_items
     where venta_id = p_venta_id and producto_id is not null
  loop
    perform aumentar_stock_producto(v_item.producto_id, v_item.cantidad);

    -- El movimiento queda anotado con el numero de venta en la descripcion: al
    -- borrar la venta, la columna venta_id se pondria en null (on delete set
    -- null) y se perderia el rastro de que stock se devolvio por que.
    insert into stock_movimientos (
      producto_id, tipo, cantidad, stock_resultante, venta_id, descripcion, usuario_id
    )
    select
      v_item.producto_id, 'adjustment', v_item.cantidad, stock, p_venta_id,
      'Anulacion de venta ' || p_venta_id, auth.uid()
    from productos where id = v_item.producto_id;
  end loop;

  delete from ventas where id = p_venta_id;  -- los items caen por cascade
end;
$$;

revoke execute on function eliminar_venta(int) from public;
grant execute on function eliminar_venta(int) to authenticated;
