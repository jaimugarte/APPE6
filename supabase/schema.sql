-- =====================================================================
-- HUB DE APPS PARA ASOCIACIONES JUVENILES · Esquema Supabase (PostgreSQL)
-- Ejecutar en Supabase > SQL Editor. Después:
--   1) Authentication > Providers > activar Google
--   2) Insertar el primer admin global:
--      insert into global_admins(email) values ('tu-correo@gmail.com');
-- =====================================================================

-- ---------- TIPOS ----------
create type rol_usuario as enum ('encargado', 'preceptor', 'familia');
create type periodicidad as enum ('semanal', 'mensual', 'trimestral', 'anual');

-- ---------- NÚCLEO: asociaciones, apps, usuarios ----------
create table global_admins (email text primary key check (email = lower(email)));

create table perfiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null unique,
  nombre text,
  es_admin_global boolean not null default false,
  creado_en timestamptz not null default now()
);

create table asociaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  foto_ruta text,                    -- foto de la asociación (objeto en el bucket asociacion-fotos)
  creada_en timestamptz not null default now()
);

-- Catálogo de apps del hub (lo gestiona el admin global)
create table apps (
  clave text primary key,            -- 'socios', 'asistencia', ...
  nombre text not null,
  descripcion text
);
insert into apps(clave, nombre, descripcion) values
  ('socios',       'Socios',       'Base de datos de socios, altas y bajas'),
  ('asistencia',   'Asistencia',   'Registro de asistencia a actividades'),
  ('estadisticas', 'Estadísticas', 'Gráficos y paneles'),
  ('anuncios',     'Anuncios',     'Planes y avisos (futuro)'),
  ('fotos',        'Fotos',        'Galería de actividades (futuro)');

-- permitida: la concede el admin global · activa: la elige el encargado
create table asociacion_apps (
  asociacion_id uuid references asociaciones on delete cascade,
  app_clave text references apps,
  permitida boolean not null default false,
  activa boolean not null default false,
  primary key (asociacion_id, app_clave),
  check (not activa or permitida)
);

-- Lista blanca de correos (un correo = una asociación)
-- Admin global añade encargados; los encargados añaden preceptores y familias.
create table accesos_permitidos (
  email text primary key check (email = lower(email)),
  asociacion_id uuid not null references asociaciones on delete cascade,
  rol rol_usuario not null,
  anadido_por uuid references perfiles,
  creado_en timestamptz not null default now()
);

create table membresias (
  user_id uuid primary key references perfiles on delete cascade,
  asociacion_id uuid not null references asociaciones on delete cascade,
  rol rol_usuario not null
);

-- Permisos de los preceptores, configurados por el encargado, por app
create table permisos_preceptor (
  asociacion_id uuid references asociaciones on delete cascade,
  app_clave text references apps,
  puede_ver boolean not null default false,
  puede_editar boolean not null default false,
  ambito text not null default 'su_nivel' check (ambito in ('su_nivel', 'todos')),
  primary key (asociacion_id, app_clave),
  check (not puede_editar or puede_ver)
);

-- Niveles que atiende cada preceptor (se usa si ámbito = 'su_nivel')
create table preceptor_niveles (
  asociacion_id uuid references asociaciones on delete cascade,
  email text check (email = lower(email)),
  nivel text,
  primary key (asociacion_id, email, nivel)
);

-- ---------- SOCIOS ----------
create table socios (
  id uuid primary key default gen_random_uuid(),
  asociacion_id uuid not null references asociaciones on delete cascade,
  nombre text not null,
  apellidos text not null,
  fecha_nacimiento date,
  nivel text,
  nombre_padre text,
  nombre_madre text,
  alergias text,
  direccion text,
  correo_padre text,
  correo_madre text,
  correo_socio text,
  movil_padre text,
  movil_madre text,
  creado_en timestamptz not null default now()
);
create index on socios(asociacion_id, nivel);

-- Historial de altas y bajas (puede haber varias; nunca se borra nada)
create table periodos_alta (
  id uuid primary key default gen_random_uuid(),
  socio_id uuid not null references socios on delete cascade,
  fecha_alta date not null,
  fecha_baja date,
  motivo_baja text,
  check (fecha_baja is null or fecha_baja >= fecha_alta)
);
-- Solo un periodo abierto por socio
create unique index un_periodo_abierto on periodos_alta(socio_id) where fecha_baja is null;

-- Datos bancarios aparte, con acceso más restringido
create table socios_bancarios (
  socio_id uuid primary key references socios on delete cascade,
  iban text not null
);

-- Familias vinculadas a socios (una familia puede tener varios hijos)
create table familiares_socios (
  email text check (email = lower(email)),
  socio_id uuid references socios on delete cascade,
  primary key (email, socio_id)
);

-- ---------- ACTIVIDADES Y ASISTENCIA ----------
create table tipos_actividad (
  id uuid primary key default gen_random_uuid(),
  asociacion_id uuid not null references asociaciones on delete cascade,
  nombre text not null,
  abreviatura text check (abreviatura is null or (abreviatura = upper(abreviatura) and char_length(abreviatura) between 2 and 6)),
  periodicidad periodicidad not null,
  activa boolean not null default true,   -- "de interés" para la asociación
  orden int not null default 0,
  unique (asociacion_id, nombre),
  unique (asociacion_id, abreviatura)
);

-- Actividades por defecto al crear una asociación
create function sembrar_actividades() returns trigger language plpgsql as $$
begin
  insert into tipos_actividad(asociacion_id, nombre, abreviatura, periodicidad, orden) values
    (new.id, 'Charla', 'CHAR', 'semanal', 1),
    (new.id, 'Círculo', 'CIRC', 'semanal', 2),
    (new.id, 'Visita de pobres', 'VIPO', 'mensual', 3),
    (new.id, 'Retiro mensual', 'RTME', 'mensual', 4),
    (new.id, 'Curso de retiro', 'CRT', 'anual', 5),
    (new.id, 'Preceptuación', 'PREC', 'semanal', 6),
    (new.id, 'Sacerdote', 'SACD', 'semanal', 7);
  return new;
end $$;
create trigger t_sembrar after insert on asociaciones
  for each row execute function sembrar_actividades();

-- Asistencia por periodo. periodo_inicio se normaliza: lunes de la semana,
-- día 1 del mes, del trimestre o del año, según la periodicidad del tipo.
create table registros_asistencia (
  socio_id uuid references socios on delete cascade,
  tipo_actividad_id uuid references tipos_actividad on delete cascade,
  periodo_inicio date not null,
  asistio boolean not null,
  registrado_por uuid references perfiles,
  actualizado_en timestamptz not null default now(),
  primary key (socio_id, tipo_actividad_id, periodo_inicio)
);
create index on registros_asistencia(tipo_actividad_id, periodo_inicio);

create function inicio_periodo(f date, p periodicidad) returns date
language sql immutable as $$
  select (case p
    when 'semanal'    then date_trunc('week', f)
    when 'mensual'    then date_trunc('month', f)
    when 'trimestral' then date_trunc('quarter', f)
    when 'anual'      then date_trunc('year', f)
  end)::date $$;

create function normalizar_periodo() returns trigger language plpgsql as $$
begin
  new.periodo_inicio := inicio_periodo(new.periodo_inicio,
    (select periodicidad from tipos_actividad where id = new.tipo_actividad_id));
  new.actualizado_en := now();
  new.registrado_por := auth.uid();
  return new;
end $$;
create trigger t_norm before insert or update on registros_asistencia
  for each row execute function normalizar_periodo();

-- ---------- ALTA CONTROLADA (solo correos de la lista blanca) ----------
create function alta_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_acc accesos_permitidos; v_admin boolean;
begin
  v_admin := exists (select 1 from global_admins where email = lower(new.email));
  select * into v_acc from accesos_permitidos where email = lower(new.email);
  if not v_admin and v_acc.email is null then
    raise exception 'Correo no autorizado: %', new.email;
  end if;
  insert into perfiles(id, email, nombre, es_admin_global)
    values (new.id, lower(new.email), new.raw_user_meta_data->>'full_name', v_admin);
  if v_acc.email is not null then
    insert into membresias(user_id, asociacion_id, rol)
      values (new.id, v_acc.asociacion_id, v_acc.rol);
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function alta_usuario();

-- Si se retira un correo de la lista blanca, se pierde el acceso
create function revocar_acceso() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from membresias where user_id = (select id from perfiles where email = old.email);
  return old;
end $$;
create trigger t_revocar after delete on accesos_permitidos
  for each row execute function revocar_acceso();

-- ---------- FUNCIONES DE PERMISOS ----------
create function email_actual() returns text language sql stable as
  $$ select lower(auth.jwt() ->> 'email') $$;

create function es_admin_global() returns boolean
language sql stable security definer set search_path = public as
  $$ select exists (select 1 from perfiles where id = auth.uid() and es_admin_global) $$;

create function rol_en(p_asoc uuid) returns rol_usuario
language sql stable security definer set search_path = public as
  $$ select rol from membresias where user_id = auth.uid() and asociacion_id = p_asoc $$;

-- ¿Puede el usuario actual ver/editar una app en su asociación (y para un nivel)?
-- El admin global gestiona la plataforma pero NO accede a datos de socios (RGPD).
create function tiene_permiso(p_asoc uuid, p_app text, p_accion text, p_nivel text default null)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_rol rol_usuario; v_perm permisos_preceptor;
begin
  if not exists (select 1 from asociacion_apps
                 where asociacion_id = p_asoc and app_clave = p_app and activa) then
    return false;
  end if;
  v_rol := rol_en(p_asoc);
  if v_rol = 'encargado' then return true; end if;
  if v_rol = 'preceptor' then
    select * into v_perm from permisos_preceptor
      where asociacion_id = p_asoc and app_clave = p_app;
    if v_perm is null then return false; end if;
    if p_accion = 'ver' and not v_perm.puede_ver then return false; end if;
    if p_accion = 'editar' and not v_perm.puede_editar then return false; end if;
    if v_perm.ambito = 'todos' then return true; end if;
    return p_nivel is not null and exists (
      select 1 from preceptor_niveles
      where asociacion_id = p_asoc and email = email_actual() and nivel = p_nivel);
  end if;
  return false;
end $$;

-- Igual, pero partiendo de un socio
create function puede_socio(p_socio uuid, p_app text, p_accion text)
returns boolean language sql stable security definer set search_path = public as $$
  select tiene_permiso(s.asociacion_id, p_app, p_accion, s.nivel)
  from socios s where s.id = p_socio $$;

create function es_familiar_de(p_socio uuid) returns boolean
language sql stable security definer set search_path = public as
  $$ select exists (select 1 from familiares_socios
                    where socio_id = p_socio and email = email_actual()) $$;

-- Activar/desactivar apps (el encargado solo puede tocar 'activa')
create function activar_app(p_asoc uuid, p_app text, p_activa boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- «is distinct from»: si el usuario no pertenece a la asociación rol_en es null y «<>» no lo bloquearía
  if rol_en(p_asoc) is distinct from 'encargado' then raise exception 'Solo el encargado'; end if;
  update asociacion_apps set activa = p_activa
    where asociacion_id = p_asoc and app_clave = p_app and permitida;
end $$;

-- Foto de la asociación: solo el encargado, y el archivo debe estar en la carpeta de su asociación
create function establecer_foto_asociacion(p_asoc uuid, p_ruta text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if rol_en(p_asoc) is distinct from 'encargado' then raise exception 'Solo el encargado'; end if;
  if p_ruta is not null and split_part(p_ruta, '/', 1) <> p_asoc::text then
    raise exception 'La foto debe estar en la carpeta de la asociación';
  end if;
  update asociaciones set foto_ruta = p_ruta where id = p_asoc;
end $$;

-- Rol del usuario en la asociación de una carpeta de storage (primer segmento de la ruta); null si no es un uuid o no es miembro
create function rol_en_carpeta(p_nombre text) returns rol_usuario
language sql stable security definer set search_path = public as $$
  select case when split_part(p_nombre, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then rol_en(split_part(p_nombre, '/', 1)::uuid) end $$;

-- ---------- ROW LEVEL SECURITY ----------
alter table global_admins       enable row level security;
alter table perfiles            enable row level security;
alter table asociaciones        enable row level security;
alter table apps                enable row level security;
alter table asociacion_apps     enable row level security;
alter table accesos_permitidos  enable row level security;
alter table membresias          enable row level security;
alter table permisos_preceptor  enable row level security;
alter table preceptor_niveles   enable row level security;
alter table socios              enable row level security;
alter table periodos_alta       enable row level security;
alter table socios_bancarios    enable row level security;
alter table familiares_socios   enable row level security;
alter table tipos_actividad     enable row level security;
alter table registros_asistencia enable row level security;

-- Plataforma (admin global)
create policy ga_admin on global_admins for all using (es_admin_global()) with check (es_admin_global());
create policy perfil_propio on perfiles for select using (id = auth.uid() or es_admin_global());
create policy apps_lectura on apps for select using (auth.uid() is not null);
create policy apps_admin on apps for all using (es_admin_global()) with check (es_admin_global());
create policy asoc_ver on asociaciones for select using (rol_en(id) is not null or es_admin_global());
create policy asoc_admin on asociaciones for all using (es_admin_global()) with check (es_admin_global());
create policy aa_ver on asociacion_apps for select using (rol_en(asociacion_id) is not null or es_admin_global());
create policy aa_admin on asociacion_apps for all using (es_admin_global()) with check (es_admin_global());
create policy mem_ver on membresias for select
  using (user_id = auth.uid() or rol_en(asociacion_id) = 'encargado' or es_admin_global());

-- Lista blanca: el admin añade encargados; el encargado, preceptores y familias
create policy acc_ver on accesos_permitidos for select
  using (rol_en(asociacion_id) = 'encargado' or es_admin_global());
create policy acc_ins on accesos_permitidos for insert with check (
  es_admin_global() or (rol_en(asociacion_id) = 'encargado' and rol <> 'encargado'));
create policy acc_del on accesos_permitidos for delete using (
  es_admin_global() or (rol_en(asociacion_id) = 'encargado' and rol <> 'encargado'));

-- Configuración de la asociación (solo encargado)
create policy pp_ver on permisos_preceptor for select using (rol_en(asociacion_id) in ('encargado','preceptor'));
create policy pp_enc on permisos_preceptor for all
  using (rol_en(asociacion_id) = 'encargado') with check (rol_en(asociacion_id) = 'encargado');
create policy pn_ver on preceptor_niveles for select
  using (rol_en(asociacion_id) = 'encargado' or email = email_actual());
create policy pn_enc on preceptor_niveles for all
  using (rol_en(asociacion_id) = 'encargado') with check (rol_en(asociacion_id) = 'encargado');

-- Tipos de actividad: las ven encargado y preceptores (las familias no usan Asistencia); define el encargado
create policy ta_ver on tipos_actividad for select using (rol_en(asociacion_id) in ('encargado', 'preceptor'));
create policy ta_enc on tipos_actividad for all
  using (rol_en(asociacion_id) = 'encargado') with check (rol_en(asociacion_id) = 'encargado');

-- Socios (sin borrado: se usan las bajas para conservar el histórico)
create policy so_ver on socios for select
  using (tiene_permiso(asociacion_id, 'socios', 'ver', nivel) or es_familiar_de(id));
create policy so_ins on socios for insert with check (tiene_permiso(asociacion_id, 'socios', 'editar', nivel));
create policy so_upd on socios for update
  using (tiene_permiso(asociacion_id, 'socios', 'editar', nivel))
  with check (tiene_permiso(asociacion_id, 'socios', 'editar', nivel));

create policy pa_ver on periodos_alta for select
  using (puede_socio(socio_id, 'socios', 'ver') or es_familiar_de(socio_id));
create policy pa_ins on periodos_alta for insert with check (puede_socio(socio_id, 'socios', 'editar'));
create policy pa_upd on periodos_alta for update
  using (puede_socio(socio_id, 'socios', 'editar')) with check (puede_socio(socio_id, 'socios', 'editar'));

-- Datos bancarios: solo encargado
create policy sb_enc on socios_bancarios for all
  using (rol_en((select asociacion_id from socios where id = socio_id)) = 'encargado')
  with check (rol_en((select asociacion_id from socios where id = socio_id)) = 'encargado');

create policy fs_ver on familiares_socios for select
  using (email = email_actual() or puede_socio(socio_id, 'socios', 'ver'));
create policy fs_enc on familiares_socios for all
  using (puede_socio(socio_id, 'socios', 'editar')) with check (puede_socio(socio_id, 'socios', 'editar'));

-- Asistencia: solo encargado y preceptores con permiso. La familia nunca accede, ni a los datos de sus hijos.
-- Sin registro significa que no asistió: solo se guardan las asistencias.
create policy ra_ver on registros_asistencia for select
  using (puede_socio(socio_id, 'asistencia', 'ver'));
create policy ra_ins on registros_asistencia for insert with check (puede_socio(socio_id, 'asistencia', 'editar'));
create policy ra_upd on registros_asistencia for update
  using (puede_socio(socio_id, 'asistencia', 'editar')) with check (puede_socio(socio_id, 'asistencia', 'editar'));
create policy ra_del on registros_asistencia for delete using (puede_socio(socio_id, 'asistencia', 'editar'));

-- ---------- STORAGE: foto de la asociación ----------
-- Bucket privado (las fotos pueden mostrar menores): se sirve con URLs firmadas de caducidad corta.
-- Ruta de cada objeto: <id de la asociación>/<archivo>. Ven la foto los miembros; solo el encargado la cambia.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('asociacion-fotos', 'asociacion-fotos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy af_ver on storage.objects for select to authenticated
  using (bucket_id = 'asociacion-fotos' and rol_en_carpeta(name) is not null);
create policy af_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'asociacion-fotos' and rol_en_carpeta(name) = 'encargado');
create policy af_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'asociacion-fotos' and rol_en_carpeta(name) = 'encargado')
  with check (bucket_id = 'asociacion-fotos' and rol_en_carpeta(name) = 'encargado');
create policy af_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'asociacion-fotos' and rol_en_carpeta(name) = 'encargado');

-- ---------- SOLICITUDES DE ALTA Y BAJA ----------
-- Flujo: el encargado crea un enlace de invitación → una familia rellena el formulario (sin cuenta) →
-- la solicitud la aprueba quien tenga permiso → la familia queda autorizada, entra con Google y solicita
-- el alta de sus hijos → se aprueba de nuevo. La baja de un hijo no se aprueba: la familia la hace
-- directamente tras una confirmación en la aplicación.

create table enlaces_alta (
  id uuid primary key default gen_random_uuid(),
  asociacion_id uuid not null references asociaciones on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  activo boolean not null default true,
  caduca_en timestamptz,
  creado_por uuid references perfiles,
  creado_en timestamptz not null default now()
);

-- Una familia tiene una o dos cuentas de Google: la del padre o tutor y la de la madre o tutora
create table familias (
  id uuid primary key default gen_random_uuid(),
  asociacion_id uuid not null references asociaciones on delete cascade,
  emails text[] not null,
  nombre_padre text, nombre_madre text,
  correo_padre text, correo_madre text,
  movil_padre text, movil_madre text,
  direccion text,
  -- Descuento concedido a la familia (excepciones). Lo ponen el encargado o, si éste lo permite, los preceptores.
  descuento_tipo text not null default 'porcentaje' check (descuento_tipo in ('porcentaje', 'euros')),
  descuento_valor numeric(8,2) not null default 0 check (descuento_valor >= 0 and (descuento_tipo <> 'porcentaje' or descuento_valor <= 100)),
  descuento_nota text,
  creada_en timestamptz not null default now()
);
create index on familias using gin (emails);

-- Pagos de cuota por mes (los registra el encargado). Sin fecha de pago = pendiente.
create table pagos_cuota (
  familia_id uuid references familias on delete cascade,
  mes date check (mes = date_trunc('month', mes)::date),
  importe numeric(8,2) not null check (importe >= 0),
  pagado_en date,
  nota text,
  primary key (familia_id, mes)
);

-- Criterio de cuotas de la asociación: importe mensual según el orden del hijo en la familia
-- (importes[1] = hijo de alta más antiguo, importes[2] = segundo…; el último vale para todos los siguientes).
-- Sin fila = criterio por defecto: 35 €, 10 € y 0 € para el resto.
create table config_cuotas (
  asociacion_id uuid primary key references asociaciones on delete cascade,
  importes numeric(8,2)[] not null default '{35,10,0}'
    check (cardinality(importes) between 1 and 10 and 0 <= all(importes)),
  preceptores_descuento boolean not null default false
);

-- Qué preceptores pueden aprobar solicitudes: ninguna, solo las de sus niveles, o todas.
-- Sin fila = ninguna. El encargado siempre puede aprobarlas todas.
create table permisos_aprobacion (
  asociacion_id uuid references asociaciones on delete cascade,
  email text check (email = lower(email)),
  alcance text not null default 'ninguno' check (alcance in ('ninguno', 'su_nivel', 'todos')),
  primary key (asociacion_id, email)
);

create table solicitudes_alta (
  id uuid primary key default gen_random_uuid(),
  asociacion_id uuid not null references asociaciones on delete cascade,
  tipo text not null check (tipo in ('familia', 'socio')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  email text not null,                          -- cuenta de Google de quien solicita
  niveles text[] not null default '{}',         -- decide qué preceptores de «su nivel» la ven
  datos jsonb not null default '{}',
  motivo_resolucion text,
  resuelta_por uuid references perfiles,
  resuelta_en timestamptz,
  creada_en timestamptz not null default now()
);
create index on solicitudes_alta(asociacion_id, estado);
create unique index un_solicitud_familia on solicitudes_alta(asociacion_id, email) where tipo = 'familia' and estado = 'pendiente';

-- ¿Puede el usuario actual aprobar una solicitud con estos niveles?
create function puede_aprobar(p_asoc uuid, p_niveles text[]) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_alc text;
begin
  case rol_en(p_asoc)
    when 'encargado' then return true;
    when 'preceptor' then null;
    else return false;
  end case;
  select alcance into v_alc from permisos_aprobacion where asociacion_id = p_asoc and email = email_actual();
  if v_alc = 'todos' then return true; end if;
  if v_alc = 'su_nivel' then
    return exists (select 1 from preceptor_niveles
                   where asociacion_id = p_asoc and email = email_actual() and nivel = any(p_niveles));
  end if;
  return false;
end $$;

-- Formulario público (sin sesión): nombre de la asociación a la que lleva el enlace
create function info_enlace(p_token text) returns text
language sql stable security definer set search_path = public as $$
  select a.nombre from enlaces_alta e join asociaciones a on a.id = e.asociacion_id
  where e.token = p_token and e.activo and (e.caduca_en is null or e.caduca_en > now()) $$;

-- Formulario público (sin sesión): solicitud de alta de una familia. Valida y limpia todo en el servidor.
-- Cada progenitor (padre o tutor, madre o tutora) aporta su nombre y su cuenta de Google; basta con uno.
create function solicitar_alta_familia(p_token text, p_datos jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_asoc uuid; v_cp text; v_cm text; v_np text; v_nm text; v_emails text[];
  v_re constant text := '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  t jsonb := coalesce(p_datos, '{}');
begin
  select e.asociacion_id into v_asoc from enlaces_alta e
    where e.token = p_token and e.activo and (e.caduca_en is null or e.caduca_en > now());
  if v_asoc is null then raise exception 'El enlace no es válido o ha caducado'; end if;
  if (t->>'consentimiento') is distinct from 'true' then raise exception 'Debes aceptar el tratamiento de los datos'; end if;
  v_np := left(trim(coalesce(t->>'nombre_padre', '')), 120);
  v_nm := left(trim(coalesce(t->>'nombre_madre', '')), 120);
  v_cp := lower(trim(coalesce(t->>'correo_padre', '')));
  v_cm := lower(trim(coalesce(t->>'correo_madre', '')));
  -- Un progenitor se considera indicado si se rellena su nombre o su correo; entonces hacen falta ambos
  if (v_np <> '' or v_cp <> '') and (v_np = '' or v_cp !~ v_re) then
    raise exception 'Revisa el nombre y el correo de Google del padre o tutor';
  end if;
  if (v_nm <> '' or v_cm <> '') and (v_nm = '' or v_cm !~ v_re) then
    raise exception 'Revisa el nombre y el correo de Google de la madre o tutora';
  end if;
  if v_cp = '' and v_cm = '' then raise exception 'Indica al menos un progenitor o tutor con su correo de Google'; end if;
  if v_cp = v_cm then raise exception 'El padre y la madre necesitan correos distintos'; end if;
  v_emails := array_remove(array[nullif(v_cp, ''), nullif(v_cm, '')], null);
  if exists (select 1 from accesos_permitidos where email = any(v_emails)) then
    raise exception 'Alguno de esos correos ya tiene acceso a la aplicación';
  end if;
  if exists (select 1 from solicitudes_alta where asociacion_id = v_asoc and tipo = 'familia' and estado = 'pendiente'
             and (email = any(v_emails) or datos->>'correo_padre' = any(v_emails) or datos->>'correo_madre' = any(v_emails))) then
    raise exception 'Ya hay una solicitud pendiente con alguno de esos correos';
  end if;
  if (select count(*) from solicitudes_alta where asociacion_id = v_asoc and estado = 'pendiente') >= 300 then
    raise exception 'Hay demasiadas solicitudes pendientes. Inténtalo más tarde';
  end if;
  -- Las familias no tienen nivel: las altas de familia las aprueban el encargado y quien pueda aprobar «todas»
  insert into solicitudes_alta(asociacion_id, tipo, email, niveles, datos)
  values (v_asoc, 'familia', v_emails[1], '{}', jsonb_build_object(
    'nombre_padre', v_np, 'nombre_madre', v_nm, 'correo_padre', v_cp, 'correo_madre', v_cm,
    'movil_padre', left(trim(coalesce(t->>'movil_padre', '')), 30),
    'movil_madre', left(trim(coalesce(t->>'movil_madre', '')), 30),
    'direccion', left(trim(coalesce(t->>'direccion', '')), 200)));
exception when unique_violation then
  raise exception 'Ya hay una solicitud pendiente con alguno de esos correos';
end $$;

grant execute on function info_enlace(text), solicitar_alta_familia(text, jsonb) to anon, authenticated;

-- Nivel que le corresponde a un niño por su fecha de nacimiento (curso que empieza el 1 de septiembre):
-- 1º de primaria = los que cumplen 6 años ese año natural. Fuera de primaria–bachillerato devuelve null.
create function nivel_por_nacimiento(p_nac date, p_hoy date default current_date) returns text
language sql stable as $$
  select case when n between 1 and 6 then n || 'º primaria'
              when n between 7 and 10 then (n - 6) || 'º ESO'
              when n between 11 and 12 then (n - 10) || 'º Bachillerato' end
  from (select ((case when extract(month from p_hoy) >= 9 then extract(year from p_hoy) else extract(year from p_hoy) - 1 end)
                - extract(year from p_nac) - 5)::int as n) q $$;

-- Una familia ya aprobada solicita el alta de un hijo. El nivel sale de la fecha de nacimiento: la familia no lo elige.
create function solicitar_socio(p_datos jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_asoc uuid; v_nivel text; v_nac date; t jsonb := coalesce(p_datos, '{}');
begin
  select m.asociacion_id into v_asoc from membresias m where m.user_id = auth.uid() and m.rol = 'familia';
  if v_asoc is null then raise exception 'Solo las familias pueden solicitar el alta de un hijo'; end if;
  if trim(coalesce(t->>'nombre', '')) = '' or trim(coalesce(t->>'apellidos', '')) = '' or coalesce(t->>'fecha_nacimiento', '') = '' then
    raise exception 'Indica nombre, apellidos y fecha de nacimiento';
  end if;
  v_nac := (t->>'fecha_nacimiento')::date;
  v_nivel := nivel_por_nacimiento(v_nac);
  insert into solicitudes_alta(asociacion_id, tipo, email, niveles, datos)
  values (v_asoc, 'socio', email_actual(), case when v_nivel is null then '{}' else array[v_nivel] end, jsonb_build_object(
    'nombre', left(trim(t->>'nombre'), 80), 'apellidos', left(trim(t->>'apellidos'), 120),
    'fecha_nacimiento', to_char(v_nac, 'YYYY-MM-DD'), 'nivel', v_nivel,
    'alergias', left(trim(coalesce(t->>'alergias', '')), 200),
    'correo_socio', left(trim(coalesce(t->>'correo_socio', '')), 120)));
end $$;

-- Baja de un hijo: la hace la propia familia, sin aprobación (la aplicación pide confirmación antes)
create function dar_de_baja_familia(p_socio uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_familiar_de(p_socio) then raise exception 'No puedes dar de baja a este socio'; end if;
  update periodos_alta
    set fecha_baja = greatest(current_date, fecha_alta), motivo_baja = nullif(left(trim(coalesce(p_motivo, '')), 300), '')
    where socio_id = p_socio and fecha_baja is null;
  if not found then raise exception 'Este socio ya está de baja'; end if;
end $$;

-- Familia: editar los datos de la familia (nombres, móviles, dirección) y, de paso, las copias que lleva cada hijo.
-- Los correos no se cambian aquí: son las cuentas de Google autorizadas y las gestiona el encargado.
create function actualizar_familia(p_datos jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare f familias; t jsonb := coalesce(p_datos, '{}');
begin
  select * into f from familias where email_actual() = any(emails) limit 1;
  if f.id is null then raise exception 'No tienes una familia registrada'; end if;
  update familias set
    nombre_padre = nullif(left(trim(coalesce(t->>'nombre_padre', '')), 120), ''),
    nombre_madre = nullif(left(trim(coalesce(t->>'nombre_madre', '')), 120), ''),
    movil_padre = nullif(left(trim(coalesce(t->>'movil_padre', '')), 30), ''),
    movil_madre = nullif(left(trim(coalesce(t->>'movil_madre', '')), 30), ''),
    direccion = nullif(left(trim(coalesce(t->>'direccion', '')), 200), '')
  where id = f.id
  returning * into f;
  update socios set nombre_padre = f.nombre_padre, nombre_madre = f.nombre_madre,
                    movil_padre = f.movil_padre, movil_madre = f.movil_madre, direccion = f.direccion
    where asociacion_id = f.asociacion_id
      and id in (select socio_id from familiares_socios where email = any(f.emails));
end $$;

-- Familia: editar los datos propios de un hijo (el nivel y las altas/bajas no se tocan desde aquí)
create function actualizar_hijo(p_socio uuid, p_datos jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare t jsonb := coalesce(p_datos, '{}');
begin
  if not coalesce(es_familiar_de(p_socio), false) then raise exception 'No puedes editar a este socio'; end if;
  if trim(coalesce(t->>'nombre', '')) = '' or trim(coalesce(t->>'apellidos', '')) = '' then
    raise exception 'Nombre y apellidos son obligatorios';
  end if;
  update socios set
    nombre = left(trim(t->>'nombre'), 80), apellidos = left(trim(t->>'apellidos'), 120),
    fecha_nacimiento = nullif(t->>'fecha_nacimiento', '')::date,
    alergias = nullif(left(trim(coalesce(t->>'alergias', '')), 200), ''),
    correo_socio = nullif(left(trim(coalesce(t->>'correo_socio', '')), 120), '')
    where id = p_socio;
end $$;

-- Familia (registro) a la que pertenece un socio, según las cuentas vinculadas a él
create function familia_de_socio(p_socio uuid) returns familias
language sql stable security definer set search_path = public as $$
  select f.* from familias f join socios s on s.id = p_socio and s.asociacion_id = f.asociacion_id
  where f.emails && (select coalesce(array_agg(email), '{}') from familiares_socios where socio_id = p_socio)
  limit 1 $$;

-- Cuota mensual de una familia según el criterio de la asociación. Sin parámetro: la familia de quien llama.
-- Con un socio: su familia (la ve su familia, el encargado y los preceptores que pueden ver a ese socio).
-- Cada hijo de alta paga según su orden de antigüedad en el alta; al total se le resta el descuento de la familia.
create function cuota_familia(p_socio uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f familias; v_imp numeric[]; v_base numeric := 0; v_det jsonb := '[]'; r record; i int := 0; v_n numeric;
  v_desc numeric := 0; v_puede boolean := false;
begin
  if p_socio is null then
    select * into f from familias where email_actual() = any(emails) limit 1;
  else
    if not (coalesce(puede_socio(p_socio, 'socios', 'ver'), false) or coalesce(es_familiar_de(p_socio), false)) then
      raise exception 'Sin permiso';
    end if;
    f := familia_de_socio(p_socio);
  end if;
  if f.id is null then return null; end if;
  select importes into v_imp from config_cuotas where asociacion_id = f.asociacion_id;
  v_imp := coalesce(v_imp, '{35,10,0}');
  for r in
    select s.id, (select min(fecha_alta) from periodos_alta where socio_id = s.id) as desde
    from socios s join familiares_socios fs on fs.socio_id = s.id
    where fs.email = any(f.emails) and s.asociacion_id = f.asociacion_id
      and exists (select 1 from periodos_alta p where p.socio_id = s.id and p.fecha_baja is null)
    group by s.id order by 2, s.creado_en, s.id
  loop
    i := i + 1;
    v_n := v_imp[least(i, cardinality(v_imp))];
    v_det := v_det || jsonb_build_object('socio_id', r.id, 'orden', i, 'importe', v_n);
    v_base := v_base + v_n;
  end loop;
  if f.descuento_tipo = 'porcentaje' then v_desc := round(v_base * f.descuento_valor / 100, 2);
  else v_desc := least(f.descuento_valor, v_base); end if;
  if p_socio is not null then
    v_puede := case rol_en(f.asociacion_id)
      when 'encargado' then true
      when 'preceptor' then coalesce((select preceptores_descuento from config_cuotas where asociacion_id = f.asociacion_id), false)
                            and coalesce(puede_socio(p_socio, 'socios', 'editar'), false)
      else false end;
  end if;
  return jsonb_build_object('familia_id', f.id, 'hijos', i, 'base', v_base, 'descuento_tipo', f.descuento_tipo,
    'descuento_valor', f.descuento_valor, 'descuento_nota', f.descuento_nota, 'descuento', v_desc,
    'total', greatest(v_base - v_desc, 0), 'detalle', v_det, 'puede_descuento', v_puede);
end $$;

-- Descuento de cuota: lo pone el encargado o, si éste lo permite, un preceptor que pueda editar a ese socio.
-- Las familias no pueden pedirlo ni cambiarlo desde la aplicación.
create function poner_descuento(p_socio uuid, p_tipo text, p_valor numeric, p_nota text default null) returns void
language plpgsql security definer set search_path = public as $$
declare f familias; v_asoc uuid; v_ok boolean;
begin
  select asociacion_id into v_asoc from socios where id = p_socio;
  v_ok := case rol_en(v_asoc)
    when 'encargado' then true
    when 'preceptor' then coalesce((select preceptores_descuento from config_cuotas where asociacion_id = v_asoc), false)
                          and coalesce(puede_socio(p_socio, 'socios', 'editar'), false)
    else false end;
  if not coalesce(v_ok, false) then raise exception 'No tienes permiso para aplicar descuentos'; end if;
  if p_tipo not in ('porcentaje', 'euros') or p_valor is null or p_valor < 0 or (p_tipo = 'porcentaje' and p_valor > 100) then
    raise exception 'Descuento no válido';
  end if;
  f := familia_de_socio(p_socio);
  if f.id is null then raise exception 'Este socio no tiene una cuenta de familia vinculada'; end if;
  update familias set descuento_tipo = p_tipo, descuento_valor = p_valor,
    descuento_nota = nullif(left(trim(coalesce(p_nota, '')), 200), '') where id = f.id;
end $$;

-- Personal: al vincular cuentas de familia a un socio creado a mano, se registra (o amplía) su familia,
-- para que tenga cuota y descuento como las familias que entraron por el formulario.
create function asegurar_familia(p_socio uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s socios; f familias; v_emails text[];
begin
  if not coalesce(puede_socio(p_socio, 'socios', 'editar'), false) then raise exception 'Sin permiso'; end if;
  select * into s from socios where id = p_socio;
  select coalesce(array_agg(email), '{}') into v_emails from familiares_socios where socio_id = p_socio;
  if cardinality(v_emails) = 0 then return; end if;
  select * into f from familias where asociacion_id = s.asociacion_id and emails && v_emails limit 1;
  if f.id is null then
    insert into familias(asociacion_id, emails, nombre_padre, nombre_madre, correo_padre, correo_madre,
                         movil_padre, movil_madre, direccion)
    values (s.asociacion_id, v_emails, s.nombre_padre, s.nombre_madre, s.correo_padre, s.correo_madre,
            s.movil_padre, s.movil_madre, s.direccion);
  else
    update familias set emails = (select array_agg(distinct e) from unnest(f.emails || v_emails) e) where id = f.id;
  end if;
end $$;

-- Aprobar o rechazar. Al aprobar se ejecuta el alta con permisos de sistema, de modo que un
-- preceptor autorizado a aprobar no necesita permiso de edición sobre Socios.
create function resolver_solicitud(p_id uuid, p_aprobar boolean, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as $$
declare s solicitudes_alta; d jsonb; v_fam familias; v_socio uuid; v_emails text[];
begin
  select * into s from solicitudes_alta where id = p_id for update;
  if s.id is null or not puede_aprobar(s.asociacion_id, s.niveles) then
    raise exception 'No tienes permiso para resolver esta solicitud';
  end if;
  if s.estado <> 'pendiente' then raise exception 'La solicitud ya estaba resuelta'; end if;
  d := s.datos;
  if p_aprobar then
    if s.tipo = 'familia' then
      v_emails := array_remove(array[nullif(d->>'correo_padre', ''), nullif(d->>'correo_madre', '')], null);
      if exists (select 1 from accesos_permitidos where email = any(v_emails) and asociacion_id <> s.asociacion_id) then
        raise exception 'Un correo de la solicitud ya pertenece a otra asociación';
      end if;
      insert into familias(asociacion_id, emails, nombre_padre, nombre_madre, correo_padre, correo_madre,
                           movil_padre, movil_madre, direccion)
      values (s.asociacion_id, v_emails, nullif(d->>'nombre_padre', ''), nullif(d->>'nombre_madre', ''),
              nullif(d->>'correo_padre', ''), nullif(d->>'correo_madre', ''),
              nullif(d->>'movil_padre', ''), nullif(d->>'movil_madre', ''), nullif(d->>'direccion', ''));
      insert into accesos_permitidos(email, asociacion_id, rol, anadido_por)
        select e, s.asociacion_id, 'familia', auth.uid() from unnest(v_emails) e
        on conflict (email) do nothing;
    else
      select * into v_fam from familias where asociacion_id = s.asociacion_id and s.email = any(emails);
      insert into socios(asociacion_id, nombre, apellidos, fecha_nacimiento, nivel, nombre_padre, nombre_madre,
                         alergias, direccion, correo_padre, correo_madre, correo_socio, movil_padre, movil_madre)
      values (s.asociacion_id, d->>'nombre', d->>'apellidos', nullif(d->>'fecha_nacimiento', '')::date, d->>'nivel',
              v_fam.nombre_padre, v_fam.nombre_madre, nullif(d->>'alergias', ''), v_fam.direccion,
              v_fam.correo_padre, v_fam.correo_madre, nullif(d->>'correo_socio', ''),
              v_fam.movil_padre, v_fam.movil_madre)
      returning id into v_socio;
      insert into periodos_alta(socio_id, fecha_alta) values (v_socio, current_date);
      insert into familiares_socios(email, socio_id)
        select e, v_socio from unnest(coalesce(v_fam.emails, array[s.email])) e;
    end if;
  end if;
  update solicitudes_alta
    set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
        motivo_resolucion = left(p_motivo, 300), resuelta_por = auth.uid(), resuelta_en = now()
    where id = p_id;
end $$;

alter table enlaces_alta        enable row level security;
alter table familias            enable row level security;
alter table permisos_aprobacion enable row level security;
alter table solicitudes_alta    enable row level security;
alter table config_cuotas       enable row level security;
alter table pagos_cuota         enable row level security;

-- Solo el encargado gestiona enlaces y permisos de aprobación (cada preceptor ve el suyo).
-- Las solicitudes solo se crean y resuelven con las funciones de arriba: no hay políticas de escritura.
create policy ea_enc on enlaces_alta for all
  using (rol_en(asociacion_id) = 'encargado') with check (rol_en(asociacion_id) = 'encargado');
create policy fa_ver on familias for select
  using (rol_en(asociacion_id) = 'encargado' or email_actual() = any(emails));
create policy pap_ver on permisos_aprobacion for select
  using (rol_en(asociacion_id) = 'encargado' or email = email_actual());
create policy pap_enc on permisos_aprobacion for all
  using (rol_en(asociacion_id) = 'encargado') with check (rol_en(asociacion_id) = 'encargado');
create policy sa_ver on solicitudes_alta for select
  using (puede_aprobar(asociacion_id, niveles) or email = email_actual());
create policy cc_enc on config_cuotas for all
  using (rol_en(asociacion_id) = 'encargado') with check (rol_en(asociacion_id) = 'encargado');

-- Pagos: los ve la propia familia y el encargado; solo el encargado los registra
create function familia_visible(p_familia uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from familias f where f.id = p_familia
                 and (rol_en(f.asociacion_id) = 'encargado' or email_actual() = any(f.emails))) $$;
create function familia_gestionable(p_familia uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from familias f where f.id = p_familia and rol_en(f.asociacion_id) = 'encargado') $$;
create policy pc_ver on pagos_cuota for select using (familia_visible(familia_id));
create policy pc_enc on pagos_cuota for all
  using (familia_gestionable(familia_id)) with check (familia_gestionable(familia_id));

