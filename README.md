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

## Actividades

App `actividades` (antes «Planes»): el encargado y los preceptores con permiso de **editar** publican actividades, cada una de **tipo** Plan, Convivencia o Curso de Retiro (título, fecha o varios días, horas, lugar, **precio** y **descripción**) dirigidos a todos los niveles o a algunos. Se ven por **semana** (por defecto) o por **mes**.

- Las familias ven las actividades de los niveles de sus hijos de alta, y los dirigidos a todos.
- Un preceptor con ámbito «Solo su nivel» solo crea o edita planes de sus propios niveles (no para todos los niveles); con «Todos los niveles», cualquiera.
- El precio es informativo: no se suma a las cuotas.
- El administrador global debe conceder la app «Actividades» a la asociación y el encargado activarla; luego, en Ajustes → Permisos, decide qué puede hacer cada preceptor.
- Un proyecto nuevo solo necesita `supabase/schema.sql`. Si ya lo tenías creado, ejecuta además `supabase/actualizaciones.sql` (no repitas `schema.sql`).

## Portal de la familia

El inicio de la familia son cajas con un resumen en vivo: **Hijos socios** (altas, bajas, datos de la familia), **Cuotas** (cuota mensual, desglose e historial de pagos) y **Actividades**.

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

## Nomenclatura

- **Eventos**: lo que antes eran «actividades» de asistencia (Charla, Círculo, Visita de pobres, Retiro mensual, Curso de retiro, Preceptuación, Sacerdote, Conversación con los padres…). Se eligen en Ajustes y se marcan en Asistencia.
- **Actividades**: lo que antes eran «planes» (calendario). Tipo: Plan, Convivencia o Curso de Retiro.

## Trabajos (antes «Campos de trabajo»)

Ya no es una app aparte: es la pestaña **Trabajos** de la app **Dineros**. Un «trabajo» es un evento que consigue la asociación para que los socios ganen dinero (vendimia, mercadillo…). Se crea con su fecha, responsable (un preceptor) y los socios con lo que ha ganado cada uno (o un total a repartir). Desde el detalle de un socio se puede **retirar** dinero para una convivencia o curso de retiro. En la base de datos las tablas siguen llamándose `campos_trabajo`, `campo_participantes` y `retiradas_campo`. Se activa con «Dineros» y tiene el mismo acceso (encargado y todos los preceptores).

## Herramientas (postales)

App `herramientas` para el equipo: **encargado y todos los preceptores** tienen acceso (no aparece en los permisos de Ajustes); las familias no la ven. El administrador global la concede y el encargado la activa como las demás.

**Generar postales**: se eligen los cursos, se ven las familias con algún hijo de alta en esos cursos (con casillas para quitar alguna) y se genera un **PDF** con una etiqueta por familia: «Familia González Pérez» en negrita y debajo la dirección. Los hermanos se agrupan por correo de los padres o por mismos apellidos y dirección. Las familias sin dirección no salen y se avisa de ellas.

- Formatos de pegatinas A4: 24 (63,5×33,9), 21 (63,5×38,1), 14 (99,1×38,1) y 8 (99,1×67,7) por hoja.
- «Empezar en la etiqueta nº» sirve para aprovechar una hoja ya empezada. «Dibujar el contorno» permite probar en papel normal. Imprime al 100 %.
- Formato de carta: «Familia …» / calle y número / «28001 MADRID» (con «(PROVINCIA)» si no coincide con la localidad). La dirección se pide ahora con código postal, localidad y provincia (en el alta, en «Datos de la familia», en la ficha del socio y en el CSV, donde las tres columnas son opcionales). Las familias antiguas solo tienen la calle: se avisa de las que no tienen código postal.
- Solo Latin-1: caracteres fuera de él (p. ej. «ł») salen como «?».
- Privacidad: todos los preceptores ven las direcciones de las familias de **todos** los cursos (la función `direcciones_postales()` no filtra por nivel).
- Proyectos ya creados: ejecuta de nuevo `supabase/actualizaciones.sql`.

## Dineros y Hucha

Saldo de cada socio por meriendas, cenas, planes, convivencias y cursos de retiro (las cuotas van aparte, en su sección).

- **Dineros** (app `dineros`, para el equipo) tiene tres pestañas: **Saldos**, **Merienda** y **Trabajos**. En Saldos el encargado y **todos los preceptores** pueden apuntar cargos (el socio debe) o ingresos (a favor), con categoría, concepto, importe y fecha, a un socio o a varios a la vez (por curso, con casillas). Se puede borrar un apunte manual equivocado.
- **Merienda**: un contador (− / +) por cada socio, con precio rápido (0,50 / 1 / 1,50 / 2 €, recuerda el último) y un solo botón «Apuntar»; crea un cargo de categoría merienda por socio. No aparece en los permisos de Ajustes.
- **Hucha** (en la ficha de cada hijo, para las familias): saldo total y el histórico completo, **solo lectura**. Solo se ve si «Dineros» está activa en la asociación. Las familias no pueden sumar ni restar.
- **Saldo** = apuntes manuales + ganado en campos de trabajo − retirado de campos de trabajo. «Retirar» de un campo de trabajo para una convivencia o curso baja lo disponible en campos y apunta automáticamente el pago correspondiente, de modo que el saldo total no cambia (primero se apunta el coste de la actividad como cargo). Al anular una retirada desaparece también ese pago.
- Proyectos ya creados: ejecuta de nuevo `supabase/actualizaciones.sql` (añade la dirección completa, la tabla `hucha_movimientos` y las funciones `hucha_saldos`, `hucha_historial`, `socios_dineros`; la app antigua «Campos de trabajo» se traslada sola a «Dineros» con sus permisos).

## Navegación del equipo

Encargado y preceptores no ven ya una pantalla de bloques, sino una **barra inferior fija** (como WhatsApp) con: **Calendario** (las actividades; es la pestaña por defecto), **E6** (Asistencia y Estadísticas, con una barra fina arriba: Asistencia a la izquierda, Estadísticas a la derecha), **Chavales** (barra fija con título, lupa para buscar y menú de tres puntos con Nuevo chaval, Importar CSV y Solicitudes; el menú lleva un punto rojo si hay solicitudes pendientes) y **Varios** (Dineros, Herramientas y futuras apps como bloques). Cada pestaña aparece solo si el usuario tiene acceso a alguna de sus apps; si en una solo hay una opción, no se muestra la barra fina. Ajustes (encargado), Admin y Salir siguen en la cabecera. Las familias mantienen su inicio con tarjetas.

## Chavales: socios y no socios

La app «Socios» se llama ahora **Chavales**. Un chaval es **Socio** (tiene un periodo de alta abierto), **No socio** (participa en las actividades sin ser socio: columna `socios.no_socio`, sin periodo de alta) o **Baja**. Al crear un chaval hay un interruptor **Es socio** (activado por defecto; si se desactiva no pide fecha de alta). En la ficha de un no socio se puede **Hacer socio** o **Dejar de participar**, y a un socio de baja se le puede marcar **Participa sin ser socio**. La importación CSV admite una columna opcional `es_socio` (sí/no; vacío = sí).

- Los no socios aparecen en Asistencia, en Dineros (merienda y saldos), en Trabajos y en las postales, y cuentan en las estadísticas de asistencia, pero **no** en «Socios activos» ni en las cuotas.
- El preceptor puede crear chavales si el encargado le ha dado permiso de edición sobre Chavales (con «Solo su nivel», solo de sus niveles).
- Proyectos ya creados: ejecuta de nuevo `supabase/actualizaciones.sql` (añade `no_socio` y renombra la app).

## Logo e iconos

El logo es la mascota de la asociación (`app/public/`): `icon-192.png` y `icon-512.png` (esquinas redondeadas transparentes), `icon-maskable-512.png` (para Android, con margen de seguridad), `apple-touch-icon.png` y `favicon.png`. Se muestra en la cabecera, el login y el formulario de invitación, y es el icono al instalar la app. Para cambiarlo, sustituye esos cinco archivos.

## Calendario, furgonetas y plazas

- **Calendario**: solo vista de mes, ocupando la pantalla desde arriba. No hay botón «Nueva actividad»: abajo a la derecha hay un botón redondo «+» que abre el formulario de un plan nuevo (con el día seleccionado).
- **Límite de plazas** (opcional) en cada plan. En cada día del calendario el equipo ve `apuntados/límite` (p. ej. `10/20`); si se supera el límite se muestra en **rojo**. Sin límite se muestra solo el número de apuntados.
- **Furgonetas**: nuevo bloque (en «Varios») que solo gestiona el **encargado** (nombre, matrícula, plazas, activar/desactivar y reservas próximas). Para activarlo, el admin global concede la app «Furgonetas» a la asociación y el encargado la activa en Ajustes. Al crear o editar un plan, el equipo (encargado y preceptores con permiso de edición) puede reservar furgonetas; las que ya están reservadas por otro plan en esas fechas aparecen deshabilitadas, y la base de datos lo vuelve a comprobar (también si se cambian las fechas de un plan). La ocupación se calcula por **días completos**.
- **Familias**: en su inicio ven «Planes para apuntar» (una especie de notificación dentro de la app, sin push) con los planes próximos de los niveles de sus hijos, y también en el calendario de «Actividades». Pueden **apuntar o quitar a cada hijo** de su nivel; cuando se llena el plan ya no pueden apuntar. El equipo sí puede apuntar chavales aunque se supere el límite (queda en rojo) y ve la lista de apuntados.
- Si ya tenías la base de datos montada, vuelve a ejecutar `supabase/actualizaciones.sql` (es idempotente).

**Vista por defecto del calendario**: la semana (una fila por día, con los planes legibles). Encima, flechas para cambiar de semana, «Hoy» cuando no estás en la actual, y a la derecha un enlace pequeño «Ver por mes» / «Ver por semana».

**Semana tipo Google Calendar**: columna fina de horas a la izquierda, siete días y una franja superior «día» para los planes sin hora o de varios días; los planes con hora se colocan en su hueco (los que se solapan van en carriles) y llevan el color de fondo de su nivel (franjas si son para varios). Las tres barritas de arriba a la izquierda abren el menú: cambiar entre Semana y Mes y elegir qué calendarios ver (niveles sueltos, «Club» 5º EP–2º ESO, «Sr» 3º ESO–2º Bach., «Mis niveles», «Todos» y «Para todos los niveles»). Por defecto, el preceptor ve solo los planes de sus niveles; el encargado y las familias, todos.

**Altura de la semana**: más compacta por defecto; con dos dedos (pellizco) o Ctrl + rueda se comprime o extiende la altura de las horas, y se recuerda en ese dispositivo.

## Vista de las familias
Barra inferior fija: **Calendario** (por defecto) · **Hijos socios** (solo datos de los hijos: nivel, alergias, hucha, alta/baja) · **Cuotas** · **Ajustes** (datos de la familia: contactos y domicilio). El calendario es el mismo que el del equipo, sin edición y sin nombres que no sean los de sus hijos; sí ven cuánta gente hay apuntada (`Apuntados: n/límite`) y pueden apuntar o quitar a sus hijos. Cuando se crea un plan nuevo para el nivel de un hijo (o para todos) sale un **aviso flotante**; al tocarlo se abre la semana de ese plan en el calendario. Sin servidor de notificaciones: se comprueba al abrir la app, al volver a ella y cada minuto con la app abierta; lo ya avisado se recuerda en el dispositivo.
