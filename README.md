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

El encargado crea un **enlace de invitación** en Ajustes y lo reparte a las familias. El enlace lleva a un formulario público (no hace falta cuenta) donde la familia solicita el alta; la solicitud la aprueba el encargado o un preceptor autorizado (Ajustes → «Quién aprueba las solicitudes»: no / solo su nivel / todas). Al aprobarla, la cuenta de Google de la familia queda autorizada; entonces entra, solicita el alta de cada hijo (que se aprueba igual) y puede pedir su baja. En la demo, el formulario está en `/?alta=demo-invitacion`.
