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
