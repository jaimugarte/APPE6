-- Cambios posteriores al primer esquema, para proyectos de Supabase que ya tenían schema.sql.
-- Es seguro ejecutarlo más de una vez. (Un proyecto nuevo solo necesita schema.sql.)

-- 1) La app «Actividades» pasa a llamarse «Planes»
update apps set nombre = 'Planes', descripcion = 'Calendario de planes de la asociación' where clave = 'actividades';

-- 2) Nueva actividad de asistencia «Conversación con los padres» (PADR) en las asociaciones que ya existen
insert into tipos_actividad(asociacion_id, nombre, abreviatura, periodicidad, orden)
select a.id, 'Conversación con los padres', 'PADR', 'trimestral',
       coalesce((select max(orden) from tipos_actividad t where t.asociacion_id = a.id), 0) + 1
from asociaciones a
where not exists (select 1 from tipos_actividad t where t.asociacion_id = a.id and t.abreviatura = 'PADR');

-- 3) Datos solo para el equipo: «Asiste a círculos» y «Es catequista»
create table if not exists socios_equipo (
  socio_id uuid primary key references socios on delete cascade,
  asiste_circulos boolean not null default false,
  es_catequista boolean not null default false
);
alter table socios_equipo enable row level security;
drop policy if exists se_ver on socios_equipo; drop policy if exists se_ins on socios_equipo;
drop policy if exists se_upd on socios_equipo; drop policy if exists se_del on socios_equipo;
create policy se_ver on socios_equipo for select using (puede_socio(socio_id, 'socios', 'ver'));
create policy se_ins on socios_equipo for insert with check (puede_socio(socio_id, 'socios', 'editar'));
create policy se_upd on socios_equipo for update
  using (puede_socio(socio_id, 'socios', 'editar')) with check (puede_socio(socio_id, 'socios', 'editar'));
create policy se_del on socios_equipo for delete using (puede_socio(socio_id, 'socios', 'editar'));

-- 4) Que las nuevas asociaciones también reciban PADR (sustituye la función de siembra)
create or replace function sembrar_actividades() returns trigger language plpgsql as $$
begin
  insert into tipos_actividad(asociacion_id, nombre, abreviatura, periodicidad, orden) values
    (new.id, 'Charla', 'CHAR', 'semanal', 1),
    (new.id, 'Círculo', 'CIRC', 'semanal', 2),
    (new.id, 'Visita de pobres', 'VIPO', 'mensual', 3),
    (new.id, 'Retiro mensual', 'RTME', 'mensual', 4),
    (new.id, 'Curso de retiro', 'CRT', 'anual', 5),
    (new.id, 'Preceptuación', 'PREC', 'semanal', 6),
    (new.id, 'Sacerdote', 'SACD', 'semanal', 7),
    (new.id, 'Conversación con los padres', 'PADR', 'trimestral', 8);
  return new;
end $$;

-- 5) Renombrado: lo que eran «actividades» de asistencia son «Eventos» y los «Planes» son «Actividades» (con tipo)
update apps set nombre = 'Actividades', descripcion = 'Calendario de actividades de la asociación' where clave = 'actividades';
update apps set descripcion = 'Registro de asistencia a eventos' where clave = 'asistencia';
alter table planes add column if not exists tipo text not null default 'plan' check (tipo in ('plan', 'convivencia', 'curso_retiro'));

-- ---------- CAMPOS DE TRABAJO ----------
-- Dinero que ganan los socios en campos de trabajo y que luego «retiran» para pagar convivencias o cursos de retiro.
-- Acceso: encargado y todos los preceptores (no pasa por permisos_preceptor); las familias no.
alter table accesos_permitidos add column if not exists nombre text check (char_length(nombre) <= 80);  -- nombre del preceptor, lo pone el encargado
insert into apps(clave, nombre, descripcion) values
  ('campos_trabajo', 'Campos de trabajo', 'Dinero ganado por los socios y su uso en convivencias y cursos de retiro')
  on conflict (clave) do nothing;

create or replace function es_equipo(p_asoc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(rol_en(p_asoc) in ('encargado', 'preceptor'), false)
     and exists (select 1 from asociacion_apps where asociacion_id = p_asoc and app_clave = 'campos_trabajo' and activa) $$;

create or replace function asoc_de_socio(p_socio uuid) returns uuid
language sql stable security definer set search_path = public as $$ select asociacion_id from socios where id = p_socio $$;

create table if not exists campos_trabajo (
  id uuid primary key default gen_random_uuid(),
  asociacion_id uuid not null references asociaciones on delete cascade,
  nombre text not null check (length(trim(nombre)) between 1 and 120),
  descripcion text check (length(descripcion) <= 2000),
  fecha date not null,
  responsable_email text,                       -- el preceptor responsable
  creado_por uuid references perfiles default auth.uid(),
  creado_en timestamptz not null default now()
);
create index if not exists campos_trabajo_asoc on campos_trabajo(asociacion_id, fecha);

create table if not exists campo_participantes (
  campo_id uuid references campos_trabajo on delete cascade,
  socio_id uuid references socios on delete cascade,
  importe numeric(8,2) not null default 0 check (importe >= 0),   -- lo que ha ganado este socio en este campo
  primary key (campo_id, socio_id)
);
create index if not exists campo_participantes_socio on campo_participantes(socio_id);

create table if not exists retiradas_campo (
  id uuid primary key default gen_random_uuid(),
  asociacion_id uuid not null references asociaciones on delete cascade,
  socio_id uuid not null references socios on delete cascade,
  actividad_id uuid references planes on delete set null,
  actividad_titulo text not null,               -- copia, por si luego se borra la actividad
  importe numeric(8,2) not null check (importe > 0),
  fecha date not null default current_date,
  nota text check (length(nota) <= 300),
  creado_por uuid references perfiles default auth.uid(),
  creado_en timestamptz not null default now()
);
create index if not exists retiradas_campo_socio on retiradas_campo(socio_id);

-- Disponible = ganado en campos de trabajo − retirado
create or replace function saldo_campo(p_socio uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(importe) from campo_participantes where socio_id = p_socio), 0)
       - coalesce((select sum(importe) from retiradas_campo where socio_id = p_socio), 0) $$;

-- Nadie puede quedar con saldo negativo: no se baja ni se quita lo ganado si ya se retiró
create or replace function comprobar_saldo_campo() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from socios where id = old.socio_id) and saldo_campo(old.socio_id) < 0 then
    raise exception 'No se puede: el socio ya ha retirado más dinero del que le quedaría';
  end if;
  return null;
end $$;
drop trigger if exists t_saldo_campo on campo_participantes;
create trigger t_saldo_campo after update or delete on campo_participantes
  for each row execute function comprobar_saldo_campo();

alter table campos_trabajo enable row level security;
alter table campo_participantes enable row level security;
alter table retiradas_campo enable row level security;
drop policy if exists ct_ver on campos_trabajo; drop policy if exists ct_ins on campos_trabajo;
drop policy if exists ct_upd on campos_trabajo; drop policy if exists ct_del on campos_trabajo;
create policy ct_ver on campos_trabajo for select using (es_equipo(asociacion_id));
create policy ct_ins on campos_trabajo for insert with check (es_equipo(asociacion_id));
create policy ct_upd on campos_trabajo for update using (es_equipo(asociacion_id)) with check (es_equipo(asociacion_id));
create policy ct_del on campos_trabajo for delete
  using (es_equipo(asociacion_id) and (rol_en(asociacion_id) = 'encargado' or creado_por = auth.uid()));

drop policy if exists cp_ver on campo_participantes; drop policy if exists cp_ins on campo_participantes;
drop policy if exists cp_upd on campo_participantes; drop policy if exists cp_del on campo_participantes;
create policy cp_ver on campo_participantes for select
  using (es_equipo((select asociacion_id from campos_trabajo c where c.id = campo_id)));
create policy cp_ins on campo_participantes for insert
  with check (es_equipo((select asociacion_id from campos_trabajo c where c.id = campo_id))
    and asoc_de_socio(socio_id) = (select asociacion_id from campos_trabajo c where c.id = campo_id));
create policy cp_upd on campo_participantes for update
  using (es_equipo((select asociacion_id from campos_trabajo c where c.id = campo_id)))
  with check (es_equipo((select asociacion_id from campos_trabajo c where c.id = campo_id)));
create policy cp_del on campo_participantes for delete
  using (es_equipo((select asociacion_id from campos_trabajo c where c.id = campo_id)));

-- Las retiradas solo se crean con retirar_campo(); anularlas (borrarlas) solo lo hace el encargado
drop policy if exists rc_ver on retiradas_campo; drop policy if exists rc_del on retiradas_campo;
create policy rc_ver on retiradas_campo for select using (es_equipo(asociacion_id));
create policy rc_del on retiradas_campo for delete using (es_equipo(asociacion_id) and rol_en(asociacion_id) = 'encargado');

-- Lista básica de socios para el equipo (nombre, nivel y si está de alta), sin abrir el resto de la ficha
create or replace function socios_campos()
returns table(id uuid, nombre text, apellidos text, nivel text, activo boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.nombre, s.apellidos, s.nivel,
         exists (select 1 from periodos_alta p where p.socio_id = s.id and p.fecha_baja is null)
  from socios s
  where s.asociacion_id = (select asociacion_id from membresias where user_id = auth.uid())
    and es_equipo(s.asociacion_id)
  order by s.apellidos, s.nombre $$;

-- Preceptores de la asociación con el nombre que les puso el encargado
create or replace function lista_preceptores() returns table(email text, nombre text)
language sql stable security definer set search_path = public as $$
  select a.email, a.nombre from accesos_permitidos a
  where a.rol = 'preceptor'
    and a.asociacion_id = (select asociacion_id from membresias where user_id = auth.uid())
    and es_equipo(a.asociacion_id)
  order by coalesce(a.nombre, a.email) $$;

-- Convivencias y cursos de retiro a los que ese socio puede ir (de su nivel o para todos) y que no acabaron hace más de 90 días
create or replace function actividades_para_retirar(p_socio uuid)
returns table(id uuid, titulo text, tipo text, fecha date, fecha_fin date, precio numeric)
language sql stable security definer set search_path = public as $$
  select p.id, p.titulo, p.tipo, p.fecha, p.fecha_fin, p.precio
  from planes p join socios s on s.id = p_socio and s.asociacion_id = p.asociacion_id
  where es_equipo(s.asociacion_id)
    and p.tipo in ('convivencia', 'curso_retiro')
    and p.fecha_fin >= current_date - 90
    and (cardinality(p.niveles) = 0 or s.nivel = any(p.niveles))
  order by p.fecha $$;

-- Retirar dinero de un socio para una convivencia o curso de retiro disponible para él
create or replace function retirar_campo(p_socio uuid, p_actividad uuid, p_importe numeric, p_nota text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s socios; a record; v_id uuid;
begin
  select * into s from socios where id = p_socio for update;
  if s.id is null or not es_equipo(s.asociacion_id) then raise exception 'Sin permiso'; end if;
  if p_importe is null or p_importe <= 0 then raise exception 'El importe debe ser mayor que 0'; end if;
  select * into a from actividades_para_retirar(p_socio) where id = p_actividad;
  if a.id is null then raise exception 'Esa actividad no está disponible para este socio'; end if;
  if p_importe > saldo_campo(p_socio) then raise exception 'El socio solo tiene % € disponibles', saldo_campo(p_socio); end if;
  insert into retiradas_campo(asociacion_id, socio_id, actividad_id, actividad_titulo, importe, nota)
    values (s.asociacion_id, p_socio, a.id, a.titulo, round(p_importe, 2), nullif(left(trim(coalesce(p_nota, '')), 300), ''))
    returning retiradas_campo.id into v_id;
  return v_id;
end $$;


-- ---------- HERRAMIENTAS ----------
-- Utilidades para el equipo (de momento: generar postales). Acceso: encargado y todos los preceptores; las familias no.
insert into apps(clave, nombre, descripcion) values
  ('herramientas', 'Herramientas', 'Utilidades para el equipo: postales y más')
  on conflict (clave) do nothing;

create or replace function es_equipo_app(p_asoc uuid, p_app text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(rol_en(p_asoc) in ('encargado', 'preceptor'), false)
     and exists (select 1 from asociacion_apps where asociacion_id = p_asoc and app_clave = p_app and activa) $$;

-- Datos mínimos para las etiquetas de postales: socios de alta con su dirección y correos de los padres (para agrupar hermanos)
create or replace function direcciones_postales()
returns table(id uuid, nombre text, apellidos text, nivel text, direccion text, correo_padre text, correo_madre text)
language sql stable security definer set search_path = public as $$
  select s.id, s.nombre, s.apellidos, s.nivel, s.direccion, s.correo_padre, s.correo_madre
  from socios s
  where s.asociacion_id = (select asociacion_id from membresias where user_id = auth.uid())
    and es_equipo_app(s.asociacion_id, 'herramientas')
    and exists (select 1 from periodos_alta p where p.socio_id = s.id and p.fecha_baja is null)
  order by s.apellidos, s.nombre $$;
