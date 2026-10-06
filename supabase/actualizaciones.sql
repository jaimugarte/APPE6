-- Cambios posteriores al primer esquema, para proyectos de Supabase que ya tenían schema.sql.
-- Es seguro ejecutarlo más de una vez. (Un proyecto nuevo solo necesita schema.sql.)

-- 0) Dirección con código postal, localidad y provincia (las funciones que las usan están al final)
alter table socios add column if not exists codigo_postal text;
alter table socios add column if not exists localidad text;
alter table socios add column if not exists provincia text;
alter table familias add column if not exists codigo_postal text;
alter table familias add column if not exists localidad text;
alter table familias add column if not exists provincia text;

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

create or replace function es_equipo(p_asoc uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(rol_en(p_asoc) in ('encargado', 'preceptor'), false)
     and exists (select 1 from asociacion_apps where asociacion_id = p_asoc and app_clave = 'dineros' and activa) $$;

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
drop function if exists direcciones_postales();
create or replace function direcciones_postales()
returns table(id uuid, nombre text, apellidos text, nivel text, direccion text, codigo_postal text, localidad text, provincia text, correo_padre text, correo_madre text)
language sql stable security definer set search_path = public as $$
  select s.id, s.nombre, s.apellidos, s.nivel, s.direccion, s.codigo_postal, s.localidad, s.provincia, s.correo_padre, s.correo_madre
  from socios s
  where s.asociacion_id = (select asociacion_id from membresias where user_id = auth.uid())
    and es_equipo_app(s.asociacion_id, 'herramientas')
    and exists (select 1 from periodos_alta p where p.socio_id = s.id and p.fecha_baja is null)
  order by s.apellidos, s.nombre $$;

-- ---------- Dirección con código postal, localidad y provincia ----------

create or replace function solicitar_alta_familia(p_token text, p_datos jsonb) returns void
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
    'direccion', left(trim(coalesce(t->>'direccion', '')), 200),
    'codigo_postal', left(trim(coalesce(t->>'codigo_postal', '')), 10),
    'localidad', left(trim(coalesce(t->>'localidad', '')), 100),
    'provincia', left(trim(coalesce(t->>'provincia', '')), 100)));
exception when unique_violation then
  raise exception 'Ya hay una solicitud pendiente con alguno de esos correos';
end $$;

create or replace function actualizar_familia(p_datos jsonb) returns void
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
    direccion = nullif(left(trim(coalesce(t->>'direccion', '')), 200), ''),
    codigo_postal = nullif(left(trim(coalesce(t->>'codigo_postal', '')), 10), ''),
    localidad = nullif(left(trim(coalesce(t->>'localidad', '')), 100), ''),
    provincia = nullif(left(trim(coalesce(t->>'provincia', '')), 100), '')
  where id = f.id
  returning * into f;
  update socios set nombre_padre = f.nombre_padre, nombre_madre = f.nombre_madre,
                    movil_padre = f.movil_padre, movil_madre = f.movil_madre, direccion = f.direccion,
                    codigo_postal = f.codigo_postal, localidad = f.localidad, provincia = f.provincia
    where asociacion_id = f.asociacion_id
      and id in (select socio_id from familiares_socios where email = any(f.emails));
end $$;

create or replace function asegurar_familia(p_socio uuid) returns void
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
                         movil_padre, movil_madre, direccion, codigo_postal, localidad, provincia)
    values (s.asociacion_id, v_emails, s.nombre_padre, s.nombre_madre, s.correo_padre, s.correo_madre,
            s.movil_padre, s.movil_madre, s.direccion, s.codigo_postal, s.localidad, s.provincia);
  else
    update familias set emails = (select array_agg(distinct e) from unnest(f.emails || v_emails) e) where id = f.id;
  end if;
end $$;

create or replace function resolver_solicitud(p_id uuid, p_aprobar boolean, p_motivo text default null) returns void
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
                           movil_padre, movil_madre, direccion, codigo_postal, localidad, provincia)
      values (s.asociacion_id, v_emails, nullif(d->>'nombre_padre', ''), nullif(d->>'nombre_madre', ''),
              nullif(d->>'correo_padre', ''), nullif(d->>'correo_madre', ''),
              nullif(d->>'movil_padre', ''), nullif(d->>'movil_madre', ''), nullif(d->>'direccion', ''),
              nullif(d->>'codigo_postal', ''), nullif(d->>'localidad', ''), nullif(d->>'provincia', ''));
      insert into accesos_permitidos(email, asociacion_id, rol, anadido_por)
        select e, s.asociacion_id, 'familia', auth.uid() from unnest(v_emails) e
        on conflict (email) do nothing;
    else
      select * into v_fam from familias where asociacion_id = s.asociacion_id and s.email = any(emails);
      insert into socios(asociacion_id, nombre, apellidos, fecha_nacimiento, nivel, nombre_padre, nombre_madre,
                         alergias, direccion, codigo_postal, localidad, provincia, correo_padre, correo_madre, correo_socio, movil_padre, movil_madre)
      values (s.asociacion_id, d->>'nombre', d->>'apellidos', nullif(d->>'fecha_nacimiento', '')::date, d->>'nivel',
              v_fam.nombre_padre, v_fam.nombre_madre, nullif(d->>'alergias', ''), v_fam.direccion, v_fam.codigo_postal, v_fam.localidad, v_fam.provincia,
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


-- ---------- DINEROS / HUCHA ----------
-- Saldo de cada socio (meriendas, cenas, planes, convivencias…; sin contar las cuotas). Lo gestiona el equipo desde «Dineros»
-- (encargado y todos los preceptores) y las familias lo ven, solo lectura, en la «Hucha» de cada hijo.
-- Saldo total = movimientos manuales + ganado en campos de trabajo − retirado de campos de trabajo.
insert into apps(clave, nombre, descripcion) values
  ('dineros', 'Dineros', 'Saldo de cada socio: deudas y ahorros (meriendas, cenas, planes, convivencias)')
  on conflict (clave) do nothing;

create table if not exists hucha_movimientos (
  id uuid primary key default gen_random_uuid(),
  asociacion_id uuid not null references asociaciones on delete cascade,
  socio_id uuid not null references socios on delete cascade,
  fecha date not null default current_date,
  categoria text not null check (categoria in ('merienda', 'cena', 'plan', 'convivencia', 'curso_retiro', 'otro')),
  concepto text check (char_length(concepto) <= 120),
  importe numeric(10,2) not null check (importe <> 0 and abs(importe) < 100000),   -- + ingreso / − cargo
  retirada_id uuid references retiradas_campo on delete cascade,                    -- lo crea solo «Retirar» de un campo de trabajo
  creado_por uuid references perfiles default auth.uid(),
  creado_en timestamptz not null default now()
);
create index if not exists hucha_mov_socio on hucha_movimientos(socio_id, fecha);

alter table hucha_movimientos enable row level security;
drop policy if exists hm_ver on hucha_movimientos; drop policy if exists hm_ins on hucha_movimientos;
drop policy if exists hm_del on hucha_movimientos;
create policy hm_ver on hucha_movimientos for select using (es_equipo_app(asociacion_id, 'dineros'));
create policy hm_ins on hucha_movimientos for insert
  with check (es_equipo_app(asociacion_id, 'dineros') and retirada_id is null and asoc_de_socio(socio_id) = asociacion_id);
create policy hm_del on hucha_movimientos for delete using (es_equipo_app(asociacion_id, 'dineros') and retirada_id is null);
-- (no hay UPDATE: para corregir, se borra y se vuelve a apuntar)

create or replace function saldo_hucha(p_socio uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(importe) from hucha_movimientos where socio_id = p_socio), 0) + saldo_campo(p_socio) $$;

-- Puede ver la hucha de un socio: el equipo (con «Dineros» activa) o su familia (si «Dineros» está activa)
create or replace function puede_ver_hucha(p_socio uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from socios s
    where s.id = p_socio
      and exists (select 1 from asociacion_apps where asociacion_id = s.asociacion_id and app_clave = 'dineros' and activa)
      and (es_equipo_app(s.asociacion_id, 'dineros')
           or exists (select 1 from familiares_socios f where f.socio_id = s.id and f.email = email_actual()))) $$;

-- Saldos: todos los socios para el equipo; solo sus hijos para una familia
create or replace function hucha_saldos() returns table(socio_id uuid, saldo numeric)
language sql stable security definer set search_path = public as $$
  select s.id, saldo_hucha(s.id) from socios s where puede_ver_hucha(s.id) $$;

-- Histórico de un socio (más reciente primero)
create or replace function hucha_historial(p_socio uuid)
returns table(id uuid, fecha date, concepto text, categoria text, importe numeric, origen text)
language sql stable security definer set search_path = public as $$
  select x.id, x.fecha, x.concepto, x.categoria, x.importe, x.origen from (
    select m.id, m.fecha, m.concepto, m.categoria, m.importe,
           case when m.retirada_id is null then 'manual' else 'retirada' end as origen, m.creado_en
      from hucha_movimientos m where m.socio_id = p_socio
    union all
    select null::uuid, c.fecha, 'Trabajo: ' || c.nombre, 'campo_trabajo', cp.importe, 'campo', c.creado_en
      from campo_participantes cp join campos_trabajo c on c.id = cp.campo_id
      where cp.socio_id = p_socio and cp.importe > 0
    union all
    select null::uuid, r.fecha, 'Retirada de trabajos: ' || r.actividad_titulo, 'campo_retirada', -r.importe, 'campo', r.creado_en
      from retiradas_campo r where r.socio_id = p_socio
  ) x
  where puede_ver_hucha(p_socio)
  order by x.fecha desc, x.creado_en desc $$;

-- Retirar de campos de trabajo para pagar una actividad: baja lo disponible en campos y paga ese importe de la deuda
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
  insert into hucha_movimientos(asociacion_id, socio_id, categoria, concepto, importe, retirada_id)
    values (s.asociacion_id, p_socio, case when a.tipo = 'curso_retiro' then 'curso_retiro' else 'convivencia' end,
            left('Pagado con trabajos: ' || a.titulo, 120), round(p_importe, 2), v_id);
  return v_id;
end $$;

-- Lista de socios con su saldo para «Dineros» (equipo)
create or replace function socios_dineros()
returns table(id uuid, nombre text, apellidos text, nivel text, activo boolean, saldo numeric)
language sql stable security definer set search_path = public as $$
  select s.id, s.nombre, s.apellidos, s.nivel,
         exists (select 1 from periodos_alta p where p.socio_id = s.id and p.fecha_baja is null),
         saldo_hucha(s.id)
  from socios s
  where s.asociacion_id = (select asociacion_id from membresias where user_id = auth.uid())
    and es_equipo_app(s.asociacion_id, 'dineros')
  order by s.apellidos, s.nombre $$;

-- «Campos de trabajo» pasa a ser una pestaña («Trabajos») de la app «Dineros»: se trasladan los permisos y se retira la app antigua
insert into asociacion_apps(asociacion_id, app_clave, permitida, activa)
select asociacion_id, 'dineros', permitida, activa from asociacion_apps where app_clave = 'campos_trabajo'
on conflict (asociacion_id, app_clave) do update
  set permitida = asociacion_apps.permitida or excluded.permitida, activa = asociacion_apps.activa or excluded.activa;
delete from asociacion_apps where app_clave = 'campos_trabajo';
delete from apps where clave = 'campos_trabajo';
