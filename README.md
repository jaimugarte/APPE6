# APPE6 · Hub de apps para asociaciones juveniles

PWA (React + Vite + Supabase + ECharts) para gestionar asociaciones juveniles. Cuatro niveles de usuario
(admin global, encargado, preceptor y familia) y un hub de apps que cada asociación activa a su medida.

Apps incluidas: **Socios**, **Asistencia** y **Estadísticas**. Anuncios y Fotos llegarán más adelante.

## Estructura

- `app/`: la PWA.
- `supabase/schema.sql`: esquema de base de datos con permisos (RLS).

## Ver la app sin configurar nada (modo demo)

El modo demo funciona con datos de ejemplo guardados en memoria: sin Supabase, sin Google y sin cuenta de nada.
Al entrar eliges uno de los cuatro roles para ver cómo cambia lo que se ve y se puede hacer. Los cambios se
reinician al recargar la página.

En tu ordenador (necesitas Node 18 o superior):

```bash
cd app
npm install
npm run dev
```

Si no existe el archivo `app/.env`, la app arranca sola en modo demo. También puedes forzarlo con `VITE_DEMO=true`.

### Publicar una demo gratuita (para verla en el móvil o compartirla)

1. Crea una cuenta gratuita en [Cloudflare Pages](https://pages.cloudflare.com) o en [Vercel](https://vercel.com)
   e importa este repositorio de GitHub.
2. Configuración del proyecto:
   - Directorio raíz: `app`
   - Comando de compilación: `npm run build`
   - Directorio de salida: `dist`
   - Variable de entorno: `VITE_DEMO` = `true`
3. Cada `push` a `main` vuelve a publicar la demo automáticamente.

## Usar la app de verdad (con Supabase)

1. Crea un proyecto en [Supabase](https://supabase.com) y ejecuta `supabase/schema.sql` en el SQL Editor.
2. Añade tu correo como admin global: `insert into global_admins(email) values ('tu-correo@gmail.com');`
3. En Authentication → Providers activa Google (necesitas un cliente OAuth gratuito de Google Cloud Console)
   y en Authentication → URL Configuration añade la URL de tu app.
4. Copia `app/.env.example` a `app/.env` y rellena `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
5. En el alojamiento (Cloudflare Pages o Vercel) define esas dos variables y **no** definas `VITE_DEMO`.

Aviso: si faltan las claves de Supabase, la app arranca en modo demo y lo indica con una franja amarilla arriba.

## Notas

- El modo demo imita las reglas de acceso por rol, pero no es una réplica exacta de la base de datos real:
  sirve para ver y probar la app, no para validar la seguridad.
- Los datos personales de menores están sujetos al RGPD y la LOPDGDD. La demo solo contiene datos inventados.

## Solicitudes de alta

El encargado crea un **enlace de invitación** en Ajustes y lo reparte a las familias. El enlace lleva a un formulario público (no hace falta cuenta) donde la familia solicita el alta; la solicitud la aprueba el encargado o un preceptor autorizado (Ajustes → «Quién aprueba las solicitudes»: no / solo su nivel / todas). Al aprobarla, la cuenta de Google de la familia queda autorizada; entonces entra, solicita el alta de cada hijo (que se aprueba igual) y puede darlo de baja él mismo, tras una confirmación con cuenta atrás de 10 segundos. Cada progenitor o tutor entra con su propia cuenta de Google. En la demo, el formulario está en `/?alta=demo-invitacion`.

## Experiencia de la familia y cuotas

Las familias no ven Socios ni Solicitudes: su inicio muestra el resumen (hijos de alta y cuota mensual, con el descuento si lo tienen), la lista de hijos con su estado (Activo / Baja / Alta solicitada), «Dar de alta otro hijo/a» y «Datos de la familia». Dentro de cada hijo editan sus datos y pueden darlo de baja. El nivel no se elige: sale de la fecha de nacimiento (curso que empieza el 1 de septiembre) y lo gestiona la asociación.

Cuota: en Ajustes el encargado define el importe mensual por orden de hermano (por defecto 35 € el hijo de alta más antiguo, 10 € el segundo y 0 € el resto; el último tramo vale para los siguientes). Los descuentos son por familia (en % o en €/mes) y los pone el encargado, o los preceptores si el encargado lo permite, desde la ficha del socio. Las familias no pueden pedirlos desde la app.

## Planes

App `actividades` (se muestra como «Planes»): el encargado y los preceptores con permiso de **editar** publican planes (título, fecha o varios días, horas, lugar, **precio** y **descripción**) dirigidos a todos los niveles o a algunos. Se ven por **semana** (por defecto) o por **mes**.

- Las familias ven los planes de los niveles de sus hijos de alta, y los dirigidos a todos.
- Un preceptor con ámbito «Solo su nivel» solo crea o edita planes de sus propios niveles (no para todos los niveles); con «Todos los niveles», cualquiera.
- El precio es informativo: no se suma a las cuotas.
- El administrador global debe conceder la app «Planes» a la asociación y el encargado activarla; luego, en Ajustes → Permisos, decide qué puede hacer cada preceptor.
- Un proyecto nuevo solo necesita `supabase/schema.sql`. Si ya lo tenías creado, ejecuta además `supabase/actualizaciones.sql` (no repitas `schema.sql`).

## Portal de la familia

El inicio de la familia son cajas con un resumen en vivo: **Hijos socios** (altas, bajas, datos de la familia), **Cuotas** (cuota mensual, desglose e historial de pagos) y **Planes**.

## Importar socios desde CSV

En **Socios → Importar CSV** (encargado y preceptores con permiso de editar). Hay también el formulario individual («+ Nuevo socio»).

1. Se descarga la plantilla (`plantilla-socios.csv`, solo cabecera, separador `;`). Columnas: `nombre, apellidos, fecha_nacimiento, nivel, fecha_alta, nombre_padre, correo_padre, movil_padre, nombre_madre, correo_madre, movil_madre, correo_socio, direccion, alergias`. El IBAN no se importa.
2. Al subir el archivo se comprueba que están **todas** las columnas de la plantilla y ninguna más (el orden da igual; se acepta `;`, `,` o tabulador, y UTF-8).
3. Reglas por fila (las filas con error no se importan y se listan con su número de fila):
   - nombre y apellidos obligatorios; correos y móviles válidos; fechas reales (`AAAA-MM-DD` o `DD/MM/AAAA`), sin futuro; alta no anterior al nacimiento; textos con longitud máxima.
   - nivel vacío → se calcula por la fecha de nacimiento; si no se puede, error. Un nivel fuera de la lista habitual solo da aviso. Un preceptor limitado a su nivel solo importa sus niveles.
   - fecha de alta vacía → hoy. Máximo 500 filas y 1 MB.
   - repetido dentro del archivo (mismo hijo y mismo correo de progenitor) → error en la segunda fila.
4. **Duplicados**: mismo nombre del hijo (sin distinguir acentos ni mayúsculas; apellidos iguales o uno contenido en el otro) y algún correo de progenitor en común con un socio existente. Se muestran todos y, para cada uno (o en bloque), se elige **Sobrescribir** u **Omitir** (por defecto, omitir). Al sobrescribir solo se cambian las columnas con valor (una celda vacía nunca borra datos) y no se tocan las altas/bajas. Mismo nombre con otros correos se crea como nuevo, con aviso.
5. El encargado puede marcar «Autorizar y vincular» para dar acceso a los correos de los progenitores (se omiten los ya autorizados con otro rol).

Un preceptor solo detecta duplicados entre los socios que puede ver.

## Estadísticas (resumen actual)

- **Socios activos**: columnas de altas (azul) y bajas (rojo) por mes y línea con área de socios activos a final de mes (eje propio a la izquierda; columnas en el eje derecho). Debajo, **Socios por nivel**.
- **Asistencia semanal**: asistentes en números absolutos por periodo de la actividad elegida; debajo, «Total / Por cursos» con selección de los cursos a mostrar (un color por curso).
- **Asistencia mensual**: «Distintos» (socios distintos en el mes) o «Media/sem.» (solo actividades semanales).
- **Asistencia por nivel y actividad**: asistentes de media por periodo, en dos grupos: **Club** (5º primaria – 2º ESO) y **San Rafael** (3º ESO – 2º Bachillerato). Los demás niveles no aparecen en este mapa.

## Datos de equipo del socio

Desde 2º ESO la ficha muestra «Asiste a círculos» y «Es catequista» (por defecto «No»). Se guardan en una tabla aparte (`socios_equipo`) que solo ven el encargado y los preceptores con permiso sobre ese socio; las familias nunca. Hay una nueva actividad de asistencia «Conversación con los padres» (PADR, trimestral por defecto; el encargado puede cambiarla en Ajustes).
