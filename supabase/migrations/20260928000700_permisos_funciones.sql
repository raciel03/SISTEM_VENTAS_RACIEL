-- ============================================================================
-- Endurecimiento de permisos tras la verificacion de las migraciones 004-006.
-- ============================================================================
-- La verificacion con has_function_privilege mostro que el rol 'anon' todavia
-- puede INVOCAR siguiente_correlativo. La funcion es SECURITY DEFINER y por
-- dentro llama a esta_activo(), que devuelve false sin sesion, asi que hoy
-- un visitante anonimo no logra numero: la excepcion salta antes de tocar el
-- contador. Es decir, no es explotable.
--
-- Aun asi no se deja en esa: si alguien anade un "if not esta_activo() then
-- return 0" para "optimizar", el contador queda abierto al mundo entero y se
-- gastan numeros de boleta sin emitir ninguna. Quitar el execute de 'anon'
-- hace que ese fallo futuro sea imposible en vez de solo improbable.
--
-- Estos GRANT son de los mismos que ya tienen registrar_venta y eliminar_venta
-- desde la migracion 005; aqui se completa el trio.

revoke execute on function siguiente_correlativo(text, int) from public;
revoke execute on function siguiente_correlativo(text, int) from anon;
grant  execute on function siguiente_correlativo(text, int) to authenticated;

-- Las mismas dos funciones de venta, por si el GRANT quedara revocado por error
-- en una restauracion o en una base recien clonada.
grant execute on function registrar_venta(
  int, numeric, numeric, numeric, numeric, numeric, metodo_pago, numeric, numeric, jsonb
) to authenticated;

grant execute on function eliminar_venta(int) to authenticated;
