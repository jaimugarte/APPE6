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
  if rol_en(p_asoc) <> 'encargado' then raise exception 'Solo el encargado'; end if;
  update asociacion_apps set activa = p_activa
    where asociacion_id = p_asoc and app_clave = p_app and permitida;
end $$;

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
