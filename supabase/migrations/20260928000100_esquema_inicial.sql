-- ═══════════════════════════════════════════════════════════════════════════
--  Esquema inicial — Sistema de Ventas (Migracion de Firebase a Supabase)
--
--  Modelo de negocio:
--   - El stock SIEMPRE se mide en UNIDADES (o gramos si tipo = 'peso').
--   - Los niveles (Paquete/Millar/Fardo) son referencia de precio. El paso
--     entre "Unidad + niveles" y "mayorista por niveles" es la EXISTENCIA del
--     nivel llamado 'Unidad'.
--   - Los precios de venta INCLUYEN IGV. El IGV se extrae dividiendo /1.18.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ═══════════════════════════ TIPOS ENUMERADOS ═══════════════════════════

do $$ begin create type tipo_producto as enum ('unidad','peso','mayorista');
exception when duplicate_object then null; end $$;

do $$ begin create type rol_usuario as enum ('admin','empleado');
exception when duplicate_object then null; end $$;

do $$ begin create type metodo_pago as enum ('efectivo','tarjeta','yape','plin');
exception when duplicate_object then null; end $$;

do $$ begin create type tipo_movimiento as enum
  ('initial','sale','restock','price_change','adjustment');
exception when duplicate_object then null; end $$;

do $$ begin create type tipo_documento as enum ('01','03');
exception when duplicate_object then null; end $$;

do $$ begin create type estado_comprobante as enum
  ('borrador','aceptado','observado','rechazado','anulado');
exception when duplicate_object then null; end $$;

do $$ begin create type direccion_redondeo as enum ('arriba','abajo','ninguno');
exception when duplicate_object then null; end $$;

-- ═══════════════════════════ NEGOCIO ═══════════════════════════

-- Fila unica (id = 1). Sustituye a los datos que hoy estan hardcodeados en
-- generarBoletaHTML (Index.tsx:2347-2350) y al campo useState("18") del IGV.
create table emisor (
  id                   int primary key default 1 check (id = 1),
  ruc                  text not null,
  razon_social         text not null,
  nombre_comercial     text,
  direccion            text,
  telefono             text,
  email                text,
  -- Tasa de IGV FIJA del negocio. Si es S.A.C. en Regimen General, 18.
  -- Se guarda aqui para que cada venta guarde la tasa que realmente se aplico.
  igv_rate             numeric(6,2) not null default 18 check (igv_rate between 0 and 100),
  -- Redondeo: solo aplica en efectivo (no hay monedas de 5 centimos en Peru).
  redondeo_efectivo    boolean not null default true,
  redondeo_direccion   direccion_redondeo not null default 'arriba',
  ambiente             text not null default 'produccion',
  logo_url             text,
  actualizado_en       timestamptz not null default now()
);

insert into emisor (ruc, razon_social, nombre_comercial, direccion, telefono)
values ('20614583968', 'DISTRIBUIDORA MILAM S.A.C.', 'DISTRIBUIDORA MILAM',
        'CLL JUAN MATA NRO.1040 ICA - NASCA - NASCA', '917959299 - 964264293')
on conflict (id) do nothing;

-- ═══════════════════════════ USUARIOS ═══════════════════════════

-- Colapsa las 2 colecciones de Firebase (users + local-users) en 1 sola tabla.
-- Ya NO hay columna password: Supabase Auth gestiona las contrasenas.
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  nombre      text not null default '',
  rol         rol_usuario not null default 'empleado',
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

create unique index on profiles (lower(email));
create index on profiles (rol) where activo;

-- ═══════════════════════════ CATALOGO ═══════════════════════════

create table productos (
  id                    serial primary key,
  nombre                text not null,
  tipo                  tipo_producto not null default 'unidad',
  categoria             text not null default 'General',
  -- Stock en UNIDADES. En gramos si tipo = 'peso'.
  stock                 numeric(14,4) not null default 0,
  stock_inicial         numeric(14,4) not null default 0,
  precio_compra         numeric(12,4) not null default 0,
  precio_venta          numeric(12,4) not null default 0,
  -- Solo para tipo = 'peso'
  precio_compra_kg      numeric(12,4),
  precio_venta_kg       numeric(12,4),
  gramos_equivalentes   numeric(12,4),
  gramos_minimos        numeric(12,4),
  unidad_base           text,
  unidades_por_base     numeric(14,4),
  imagen_url            text,
  activo                boolean not null default true,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

create index on productos (nombre);
create index on productos (categoria) where activo;
create index on productos (tipo) where activo;

-- Los saleLevels[] que hoy van embebidos dentro de products pasan a ser filas
-- con clave foranea. Esto es lo que hace posible consultar "todos los Paquetes
-- por debajo de S/5", imposible en Firestore sin traer el documento entero.
create table niveles (
  id                   serial primary key,
  producto_id          int not null references productos(id) on delete cascade,
  nombre               text not null,
  -- Cuantas unidades base contiene este nivel (Paquete de 25 und -> 25).
  unidades_contenidas  numeric(14,4) not null default 1 check (unidades_contenidas > 0),
  precio_compra        numeric(12,4) not null default 0,
  precio_venta         numeric(12,4) not null default 0,
  stock                numeric(14,4) not null default 0,
  stock_inicial        numeric(14,4) not null default 0,
  orden                smallint not null default 0,
  unique (producto_id, nombre)
);

-- El indice decide cual es el nivel base sin recorrer la lista en la app.
create index on niveles (producto_id);
create index on niveles (producto_id, nombre);

-- ═══════════════════════════ CLIENTES ═══════════════════════════

-- Obligatorio el RUC/DNI cuando la boleta supera S/700.
create table clientes (
  id                serial primary key,
  tipo_documento    text not null default '0'
                      check (tipo_documento in ('0','1','4','6','7')),
  numero_documento  text not null,
  razon_social      text not null,
  direccion         text,
  telefono          text,
  email             text,
  activo            boolean not null default true,
  creado_en         timestamptz not null default now(),
  unique (tipo_documento, numero_documento)
);

create index on clientes (lower(razon_social)) where activo;

-- ═══════════════════════════ VENTAS ═══════════════════════════

create table ventas (
  id                serial primary key,
  fecha             timestamptz not null default now(),
  -- Fecha LOCAL (Ica es UTC-5). Evita el error de facturar en el dia equivocado.
  fecha_local       date not null default (now() at time zone 'America/Lima')::date,
  cliente_id        int references clientes(id) on delete set null,
  -- subtotal = importe CON IGV incluido (es lo que paga el cliente).
  subtotal          numeric(14,2) not null default 0,
  -- igv = porcion del subtotal que corresponde al impuesto: subtotal / 1.18 * 0.18
  igv               numeric(14,2) not null default 0,
  -- Tasa REALMENTE aplicada. Se congela en cada venta para poder auditar.
  igv_rate          numeric(6,2) not null default 18,
  total             numeric(14,2) not null default 0,
  ganancia          numeric(14,2) not null default 0,
  metodo_pago       metodo_pago not null default 'efectivo',
  monto_recibido    numeric(14,2),
  vuelto            numeric(14,2) not null default 0,
  usuario_id        uuid references auth.users(id) on delete set null,
  creado_en         timestamptz not null default now()
);

create index on ventas (fecha_local desc);
create index on ventas (fecha desc);
create index on ventas (cliente_id);
create index on ventas (usuario_id);

-- Los items[] que hoy llevan dentro una copia del producto (con imagen base64
-- incluida) se separan. nombre_producto y los precios quedan CONGELADOS: si
-- manana subes el precio, la venta de ayer sigue mostrando el de ayer.
create table venta_items (
  id                  serial primary key,
  venta_id            int not null references ventas(id) on delete cascade,
  producto_id         int references productos(id) on delete set null,
  nivel_id            int references niveles(id) on delete set null,
  nombre_producto     text not null,
  tipo_producto       tipo_producto not null default 'unidad',
  cantidad            numeric(14,4) not null check (cantidad > 0),
  precio_compra_unit  numeric(12,4) not null default 0,
  precio_venta_unit   numeric(12,4) not null default 0,
  total_linea         numeric(14,2) not null default 0
);

create index on venta_items (venta_id);
create index on venta_items (producto_id);

-- ═══════════════════════════ COMPROBANTES ═══════════════════════════

-- B001 = boleta (tipo 03), F001 = factura (tipo 01).
create table series (
  id              serial primary key,
  tipo_documento  tipo_documento not null,
  serie           text not null unique check (serie ~ '^[A-Z][0-9]{3}$'),
  descripcion     text,
  activa          boolean not null default true,
  creado_en       timestamptz not null default now()
);

-- El correlativo vive aqui, NO en la app. Ver funcion siguiente_correlativo.
create table series_contadores (
  serie_id       int not null references series(id) on delete cascade,
  anio           int not null,
  ultimo_numero  int not null default 0 check (ultimo_numero >= 0),
  primary key (serie_id, anio)
);

create table comprobantes (
  id              serial primary key,
  serie_id        int not null references series(id) on delete restrict,
  anio            int not null,
  correlativo     int not null check (correlativo > 0),
  tipo_documento  tipo_documento not null,
  fecha_emision   timestamptz not null default now(),
  venta_id        int references ventas(id) on delete set null,
  cliente_id      int references clientes(id) on delete set null,
  -- Copia de los datos del cliente en el momento de emitir. Si el cliente
  -- cambia su razon social despues, el comprobante viejo no se altera.
  datos_cliente   jsonb not null default '{}'::jsonb,
  total_gravada   numeric(14,2) not null default 0,
  total_igv       numeric(14,2) not null default 0,
  total_venta     numeric(14,2) not null default 0,
  estado          estado_comprobante not null default 'borrador',
  cdr_hash        text,
  sunat_ticket    text,
  url_pdf         text,
  url_xml         text,
  error           text,
  creado_en       timestamptz not null default now(),
  -- Garantiza que no existan dos boletas con el mismo numero.
  unique (serie_id, anio, correlativo)
);

create index on comprobantes (fecha_emision desc);
create index on comprobantes (estado);
create index on comprobantes (venta_id);

-- ═══════════════════════════ STOCK ═══════════════════════════

create table stock_movimientos (
  id                 serial primary key,
  producto_id        int not null references productos(id) on delete cascade,
  nivel_id           int references niveles(id) on delete cascade,
  tipo               tipo_movimiento not null,
  cantidad           numeric(14,4) not null default 0,
  stock_resultante   numeric(14,4) not null default 0,
  venta_id           int references ventas(id) on delete set null,
  descripcion        text,
  usuario_id         uuid references auth.users(id) on delete set null,
  fecha              timestamptz not null default now()
);

create index on stock_movimientos (producto_id, fecha desc);
create index on stock_movimientos (venta_id);
create index on stock_movimientos (nivel_id);

-- El array priceChanges[] del historial de Firebase se vuelve tabla.
create table stock_cambios_precio (
  id                    serial primary key,
  movimiento_id         int not null references stock_movimientos(id) on delete cascade,
  nivel_id              int references niveles(id) on delete cascade,
  precio_venta_anterior numeric(12,4),
  precio_venta_nuevo    numeric(12,4),
  precio_compra_anterior numeric(12,4),
  precio_compra_nuevo   numeric(12,4)
);

create index on stock_cambios_precio (movimiento_id);

-- ═══════════════════════════ CIERRES DE CAJA ═══════════════════════════

-- YA NO se guarda el array transacciones[] con todas las ventas del dia
-- (35-40 KB por dia en Firestore, y reventaba el limite de 1 MB por documento).
-- El dia se consulta por fecha_local contra la tabla ventas.
create table cierres_diarios (
  id              serial primary key,
  fecha_local     date not null unique,
  total_ventas    numeric(14,2) not null default 0,
  ganancia        numeric(14,2) not null default 0,
  total_items     numeric(14,2) not null default 0,
  cantidad_ventas int not null default 0,
  efectivo        numeric(14,2) not null default 0,
  tarjeta         numeric(14,2) not null default 0,
  yape            numeric(14,2) not null default 0,
  plin            numeric(14,2) not null default 0,
  cerrado_por     uuid references auth.users(id) on delete set null,
  cerrado_en      timestamptz not null default now(),
  nota            text
);

-- ═══════════════════════════ SERIES POR DEFECTO ═══════════════════════════

insert into series (tipo_documento, serie, descripcion) values
  ('03', 'B001', 'Boleta de venta'),
  ('01', 'F001', 'Factura electronica')
on conflict (serie) do nothing;

-- ═══════════════════════════ TRIGGERS ═══════════════════════════

create or replace function tocar_actualizado_en()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end; $$;

drop trigger if exists trg_productos_actualizado on productos;
create trigger trg_productos_actualizado
  before update on productos
  for each row execute function tocar_actualizado_en();

drop trigger if exists trg_emisor_actualizado on emisor;
create trigger trg_emisor_actualizado
  before update on emisor
  for each row execute function tocar_actualizado_en();

-- ═══════════════════════════ FUNCIONES DE NEGOCIO ═══════════════════════════

-- Correlativo atomico. Dos cajas que piden numero en el mismo instante
-- reciben numeros distintos: nunca se repite, nunca se salta uno.
--
-- SECURITY DEFINER es obligatorio: el contador NO tiene politica de INSERT
-- para empleados (ver mas abajo), asi que sin esto el RPC fallaria con
-- "violates row-level security policy" en cuanto una caja, no el admin,
-- intentara emitir. La unica puerta sigue siendo esta_activo().
create or replace function siguiente_correlativo(p_serie text, p_anio int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_serie_id int;
  v_numero   int;
begin
  if not esta_activo() then
    raise exception 'Sesion no permitida: usuario inactivo o no autenticado';
  end if;

  select id into v_serie_id
    from series
   where serie = p_serie and activa;
  if v_serie_id is null then
    raise exception 'La serie % no existe o esta inactiva', p_serie;
  end if;

  insert into series_contadores (serie_id, anio, ultimo_numero)
  values (v_serie_id, p_anio, 1)
  on conflict (serie_id, anio) do update
    set ultimo_numero = series_contadores.ultimo_numero + 1
  returning ultimo_numero into v_numero;

  return v_numero;
end;
$$;

-- Descuento de stock atomico con validacion. Si no hay stock NO actualiza
-- nada y la app recibe la excepcion, en vez de dejar el stock inflado.
create or replace function descontar_stock_producto(p_producto_id int, p_cantidad numeric)
returns numeric
language plpgsql
as $$
declare v_stock numeric;
begin
  update productos
     set stock = stock - p_cantidad
   where id = p_producto_id and stock >= p_cantidad
  returning stock into v_stock;

  if v_stock is null then
    raise exception 'Stock insuficiente para el producto %', p_producto_id;
  end if;
  return v_stock;
end;
$$;

-- Idem para stock propio de nivel (mayorista SIN nivel 'Unidad').
create or replace function descontar_stock_nivel(p_nivel_id int, p_cantidad numeric)
returns numeric
language plpgsql
as $$
declare v_stock numeric;
begin
  update niveles
     set stock = stock - p_cantidad
   where id = p_nivel_id and stock >= p_cantidad
  returning stock into v_stock;

  if v_stock is null then
    raise exception 'Stock insuficiente en el nivel %', p_nivel_id;
  end if;
  return v_stock;
end;
$$;

create or replace function aumentar_stock_producto(p_producto_id int, p_cantidad numeric)
returns numeric
language plpgsql
as $$
declare v_stock numeric;
begin
  update productos
     set stock = stock + p_cantidad
   where id = p_producto_id
  returning stock into v_stock;
  return v_stock;
end;
$$;

create or replace function aumentar_stock_nivel(p_nivel_id int, p_cantidad numeric)
returns numeric
language plpgsql
as $$
declare v_stock numeric;
begin
  update niveles
     set stock = stock + p_cantidad
   where id = p_nivel_id
  returning stock into v_stock;
  return v_stock;
end;
$$;

-- El nivel 'Unidad' define el modelo de stock: si existe, el stock se lleva
-- en productos.stock (compartido). Esta funcion responde la pregunta.
create or replace function es_modelo_a(p_producto_id int)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from niveles
     where producto_id = p_producto_id and lower(nombre) = 'unidad'
  );
$$;

-- ═══════════════════════════ IGV ═══════════════════════════

-- Dado un importe CON IGV incluido, devuelve las 3 cifras del comprobante.
-- El IGV se extrae dividiendo entre (100 + tasa): 118.00 / 1.18 = 100.00 base.
create or replace function calcular_igv(p_total_con_igv numeric, p_tasa numeric)
returns table(total_gravada numeric, total_igv numeric, total_venta numeric)
language sql
immutable
as $$
  select
    round(p_total_con_igv / (1 + p_tasa / 100), 2)                       as total_gravada,
    round(p_total_con_igv - (p_total_con_igv / (1 + p_tasa / 100)), 2)    as total_igv,
    round(p_total_con_igv, 2)                                              as total_venta;
$$;

-- ═══════════════════════════ SEGURIDAD (RLS) ═══════════════════════════

-- Sustituye a isValidAdminPassword (Index.tsx:212-229), que comparaba un
-- hash SHA-256 dentro del navegador. Aqui la decision la toma la base.
create or replace function es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
     where id = auth.uid() and rol = 'admin' and activo
  );
$$;

create or replace function esta_activo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and activo
  );
$$;

alter table emisor                enable row level security;
alter table profiles              enable row level security;
alter table productos             enable row level security;
alter table niveles               enable row level security;
alter table clientes              enable row level security;
alter table ventas                enable row level security;
alter table venta_items           enable row level security;
alter table series                enable row level security;
alter table series_contadores    enable row level security;
alter table comprobantes          enable row level security;
alter table stock_movimientos     enable row level security;
alter table stock_cambios_precio  enable row level security;
alter table cierres_diarios       enable row level security;

-- Lectura: cualquier usuario autenticado y activo.
do $$
declare t text;
begin
  foreach t in array array[
    'emisor','productos','niveles','clientes','ventas','venta_items',
    'series','series_contadores','comprobantes','stock_movimientos',
    'stock_cambios_precio','cierres_diarios'
  ] loop
    execute format(
      'create policy %I on %I for select to authenticated using (esta_activo())',
      t || '_leer', t);
  end loop;
end $$;

-- Escritura: cualquiera autenticado y activo (vender, crear, editar).
-- El BORRADO queda restringido al admin, mas abajo.
do $$
declare t text;
begin
  foreach t in array array[
    'productos','niveles','clientes','ventas','venta_items',
    'stock_movimientos','stock_cambios_precio'
  ] loop
    execute format(
      'create policy %I on %I for insert to authenticated with check (esta_activo())',
      t || '_crear', t);
    execute format(
      'create policy %I on %I for update to authenticated using (esta_activo()) with check (esta_activo())',
      t || '_editar', t);
  end loop;
end $$;

-- Borrar: SOLO admin. Un empleado no puede borrar aunque manipule la app.
do $$
declare t text;
begin
  foreach t in array array[
    'productos','niveles','clientes','ventas','venta_items',
    'stock_movimientos','stock_cambios_precio','cierres_diarios','series'
  ] loop
    execute format(
      'create policy %I on %I for delete to authenticated using (es_admin())',
      t || '_borrar', t);
  end loop;
end $$;

-- Historial y caja: solo lectura para el admin.
drop policy if exists stock_movimientos_leer on stock_movimientos;
create policy stock_movimientos_leer on stock_movimientos
  for select to authenticated using (es_admin());

drop policy if exists cierres_diarios_leer on cierres_diarios;
create policy cierres_diarios_leer on cierres_diarios
  for select to authenticated using (es_admin());

-- El comprobante se EMITE desde la caja, asi que el empleado necesita poder
-- crearlo y leerlo (para imprimirlo). Modificar o anular uno ya emitido queda
-- en manos del admin.
drop policy if exists comprobantes_leer on comprobantes;
create policy comprobantes_leer on comprobantes
  for select to authenticated using (esta_activo());

drop policy if exists comprobantes_crear on comprobantes;
create policy comprobantes_crear on comprobantes
  for insert to authenticated with check (esta_activo());

drop policy if exists comprobantes_editar on comprobantes;
create policy comprobantes_editar on comprobantes
  for update to authenticated using (es_admin()) with check (es_admin());

drop policy if exists comprobantes_borrar on comprobantes;
create policy comprobantes_borrar on comprobantes
  for delete to authenticated using (es_admin());

-- Configuracion del emisor: solo el admin puede cambiar RUC/razon social/IGV.
drop policy if exists emisor_leer on emisor;
create policy emisor_leer on emisor
  for select to authenticated using (esta_activo());

drop policy if exists emisor_editar on emisor;
create policy emisor_editar on emisor
  for update to authenticated using (es_admin()) with check (es_admin());

-- perfiles: cada uno lee su propio perfil; el admin lee y edita todos.
drop policy if exists profiles_leer on profiles;
create policy profiles_leer on profiles
  for select to authenticated using (es_admin() or id = auth.uid());

drop policy if exists profiles_editar on profiles;
create policy profiles_editar on profiles
  for update to authenticated using (es_admin() or id = auth.uid())
  with check (es_admin() or id = auth.uid());

drop policy if exists profiles_crear on profiles;
create policy profiles_crear on profiles
  for insert to authenticated with check (es_admin());

drop policy if exists profiles_borrar on profiles;
create policy profiles_borrar on profiles
  for delete to authenticated using (es_admin());

-- El correlativo se pide por RPC (siguiente_correlativo, SECURITY DEFINER),
-- nunca con un INSERT/UPDATE directo. Estas politicas casi nunca se usan:
-- quedan como red de seguridad para el admin que corrige un contador a mano.
drop policy if exists series_contadores_editar on series_contadores;
create policy series_contadores_editar on series_contadores
  for update to authenticated using (es_admin()) with check (es_admin());

-- Alta/baja de series (B001, F001, nuevas): solo el admin. El empleado elige
-- una serie existente al emitir, no crea series nuevas.
drop policy if exists series_crear on series;
create policy series_crear on series
  for insert to authenticated with check (es_admin());

drop policy if exists series_editar on series;
create policy series_editar on series
  for update to authenticated using (es_admin()) with check (es_admin());

-- Cierre de caja: lo abre y lo cierra el admin.
drop policy if exists cierres_diarios_crear on cierres_diarios;
create policy cierres_diarios_crear on cierres_diarios
  for insert to authenticated with check (es_admin());

drop policy if exists cierres_diarios_editar on cierres_diarios;
create policy cierres_diarios_editar on cierres_diarios
  for update to authenticated using (es_admin()) with check (es_admin());

-- Al crear un usuario en Supabase Auth, nace su perfil como empleado.
create or replace function crear_perfil_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email, nombre, rol)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'nombre',
             new.raw_user_meta_data ->> 'name', ''),
    'empleado'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_crear_perfil on auth.users;
create trigger trg_crear_perfil
  after insert on auth.users
  for each row execute function crear_perfil_al_registrarse();
