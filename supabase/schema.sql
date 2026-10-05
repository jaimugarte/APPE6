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
-- el alta de sus hijos → se aprueba de nuevo. La baja de un hijo también se solicita y se aprueba.

create table enlaces_alta (
  id uuid primary key default gen_random_uuid(),
  asociacion_id uuid not null references asociaciones on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  activo boolean not null default true,
  caduca_en timestamptz,
  creado_por uuid references perfiles,
  creado_en timestamptz not null default now()
);

-- Una familia puede tener una o dos cuentas de Google (padre y madre)
create table familias (
  id uuid primary key default gen_random_uuid(),
  asociacion_id uuid not null references asociaciones on delete cascade,
  emails text[] not null,
  nombre_padre text, nombre_madre text,
  correo_padre text, correo_madre text,
  movil_padre text, movil_madre text,
  direccion text,
  creada_en timestamptz not null default now()
);
create index on familias using gin (emails);

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
  tipo text not null check (tipo in ('familia', 'socio', 'baja')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  email text not null,                          -- cuenta de Google de la familia que solicita
  niveles text[] not null default '{}',         -- decide qué preceptores de «su nivel» la ven
  socio_id uuid references socios on delete cascade,   -- solo en las bajas
  datos jsonb not null default '{}',
  motivo_resolucion text,
  resuelta_por uuid references perfiles,
  resuelta_en timestamptz,
  creada_en timestamptz not null default now()
);
create index on solicitudes_alta(asociacion_id, estado);
create unique index un_solicitud_familia on solicitudes_alta(asociacion_id, email) where tipo = 'familia' and estado = 'pendiente';
create unique index un_solicitud_baja on solicitudes_alta(socio_id) where tipo = 'baja' and estado = 'pendiente';

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
create function solicitar_alta_familia(p_token text, p_datos jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_asoc uuid; v_email text; v_email2 text; v_niv text[];
  v_re constant text := '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  t jsonb := coalesce(p_datos, '{}');
begin
  select e.asociacion_id into v_asoc from enlaces_alta e
    where e.token = p_token and e.activo and (e.caduca_en is null or e.caduca_en > now());
  if v_asoc is null then raise exception 'El enlace no es válido o ha caducado'; end if;
  if (t->>'consentimiento') is distinct from 'true' then raise exception 'Debes aceptar el tratamiento de los datos'; end if;
  v_email := lower(trim(coalesce(t->>'email', '')));
  v_email2 := nullif(lower(trim(coalesce(t->>'email2', ''))), '');
  if v_email2 = v_email then v_email2 := null; end if;
  if v_email !~ v_re or (v_email2 is not null and v_email2 !~ v_re) then raise exception 'Correo no válido'; end if;
  if trim(coalesce(t->>'nombre_padre', '')) = '' and trim(coalesce(t->>'nombre_madre', '')) = '' then
    raise exception 'Indica al menos el nombre del padre o de la madre';
  end if;
  if exists (select 1 from accesos_permitidos where email in (v_email, coalesce(v_email2, v_email))) then
    raise exception 'Ese correo ya tiene acceso a la aplicación';
  end if;
  if (select count(*) from solicitudes_alta where asociacion_id = v_asoc and estado = 'pendiente') >= 300 then
    raise exception 'Hay demasiadas solicitudes pendientes. Inténtalo más tarde';
  end if;
  select coalesce(array_agg(left(x, 40)), '{}') into v_niv
    from (select jsonb_array_elements_text(coalesce(t->'niveles', '[]'::jsonb)) x limit 8) q;
  insert into solicitudes_alta(asociacion_id, tipo, email, niveles, datos)
  values (v_asoc, 'familia', v_email, v_niv, jsonb_build_object(
    'email2', v_email2,
    'nombre_padre', left(trim(coalesce(t->>'nombre_padre', '')), 120),
    'nombre_madre', left(trim(coalesce(t->>'nombre_madre', '')), 120),
    'correo_padre', left(trim(coalesce(t->>'correo_padre', '')), 120),
    'correo_madre', left(trim(coalesce(t->>'correo_madre', '')), 120),
    'movil_padre', left(trim(coalesce(t->>'movil_padre', '')), 30),
    'movil_madre', left(trim(coalesce(t->>'movil_madre', '')), 30),
    'direccion', left(trim(coalesce(t->>'direccion', '')), 200)));
exception when unique_violation then
  raise exception 'Ya hay una solicitud pendiente con ese correo';
end $$;

grant execute on function info_enlace(text), solicitar_alta_familia(text, jsonb) to anon, authenticated;

-- Una familia ya aprobada solicita el alta de un hijo
create function solicitar_socio(p_datos jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare v_asoc uuid; v_nivel text; v_nac date; t jsonb := coalesce(p_datos, '{}');
begin
  select m.asociacion_id into v_asoc from membresias m where m.user_id = auth.uid() and m.rol = 'familia';
  if v_asoc is null then raise exception 'Solo las familias pueden solicitar el alta de un hijo'; end if;
  v_nivel := left(trim(coalesce(t->>'nivel', '')), 40);
  if trim(coalesce(t->>'nombre', '')) = '' or trim(coalesce(t->>'apellidos', '')) = '' or v_nivel = '' then
    raise exception 'Faltan datos obligatorios';
  end if;
  v_nac := nullif(t->>'fecha_nacimiento', '')::date;
  insert into solicitudes_alta(asociacion_id, tipo, email, niveles, datos)
  values (v_asoc, 'socio', email_actual(), array[v_nivel], jsonb_build_object(
    'nombre', left(trim(t->>'nombre'), 80), 'apellidos', left(trim(t->>'apellidos'), 120),
    'fecha_nacimiento', to_char(v_nac, 'YYYY-MM-DD'), 'nivel', v_nivel,
    'alergias', left(trim(coalesce(t->>'alergias', '')), 200),
    'correo_socio', left(trim(coalesce(t->>'correo_socio', '')), 120)));
end $$;

-- Una familia solicita la baja de uno de sus hijos
create function solicitar_baja(p_socio uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_s socios;
begin
  select * into v_s from socios where id = p_socio;
  if v_s.id is null or not es_familiar_de(p_socio) then raise exception 'No puedes solicitar la baja de este socio'; end if;
  if not exists (select 1 from periodos_alta where socio_id = p_socio and fecha_baja is null) then
    raise exception 'Este socio ya está de baja';
  end if;
  insert into solicitudes_alta(asociacion_id, tipo, email, niveles, socio_id, datos)
  values (v_s.asociacion_id, 'baja', email_actual(), array[coalesce(v_s.nivel, '')], p_socio,
          jsonb_build_object('motivo', left(trim(coalesce(p_motivo, '')), 300),
                             'socio_nombre', left(v_s.nombre || ' ' || v_s.apellidos, 200)));
exception when unique_violation then
  raise exception 'Ya hay una solicitud de baja pendiente para este socio';
end $$;

-- Aprobar o rechazar. Al aprobar se ejecuta el alta (o la baja) con permisos de sistema, de modo que un
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
      v_emails := array_remove(array[s.email, nullif(d->>'email2', '')], null);
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
    elsif s.tipo = 'socio' then
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
    else
      update periodos_alta set fecha_baja = current_date, motivo_baja = nullif(d->>'motivo', '')
        where socio_id = s.socio_id and fecha_baja is null;
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

