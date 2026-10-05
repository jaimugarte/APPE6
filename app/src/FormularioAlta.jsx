import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { esEmail } from './util'
import { Logo } from './iconos'

const VACIO = {
  nombre_padre: '', correo_padre: '', movil_padre: '', nombre_madre: '', correo_madre: '', movil_madre: '',
  direccion: '', consentimiento: false, web: ''
}

// Formulario público (sin iniciar sesión) al que lleva el enlace de invitación: solicitud de alta de una familia.
export default function FormularioAlta({ token }) {
  const [asoc, setAsoc] = useState(undefined) // undefined = cargando, null = enlace no válido
  const [f, setF] = useState(VACIO)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [hecho, setHecho] = useState(false)

  useEffect(() => {
    supabase.rpc('info_enlace', { p_token: token }).then(({ data }) => setAsoc(data || null))
  }, [token])

  const set = k => e => setF({ ...f, [k]: e.target.value })

  const enviar = async e => {
    e.preventDefault()
    setError('')
    if (f.web) return setHecho(true) // campo trampa para robots: se simula el envío
    const cp = f.correo_padre.trim(), cm = f.correo_madre.trim()
    const hayPadre = f.nombre_padre.trim() || cp, hayMadre = f.nombre_madre.trim() || cm
    if (!hayPadre && !hayMadre) return setError('Indica al menos un progenitor o tutor, con su nombre y su correo de Google.')
    if (hayPadre && (!f.nombre_padre.trim() || !cp || !esEmail(cp))) return setError('Revisa el nombre y el correo de Google del padre o tutor.')
    if (hayMadre && (!f.nombre_madre.trim() || !cm || !esEmail(cm))) return setError('Revisa el nombre y el correo de Google de la madre o tutora.')
    if (cp && cp.toLowerCase() === cm.toLowerCase()) return setError('El padre y la madre necesitan correos distintos.')
    if (!f.consentimiento) return setError('Debes aceptar el tratamiento de los datos para enviar la solicitud.')
    setEnviando(true)
    const { web: _web, ...datos } = f
    const { error: err } = await supabase.rpc('solicitar_alta_familia', { p_token: token, p_datos: datos })
    setEnviando(false)
    if (err) return setError(err.message)
    setHecho(true)
  }

  const cabecera = (
    <>
      <span className="logo"><Logo size={26} /></span>
      <h1>{asoc ? asoc : 'Solicitud de alta'}</h1>
    </>
  )

  if (asoc === undefined) return <p className="centro">Cargando…</p>

  if (asoc === null)
    return (
      <main className="centro">
        {cabecera}
        <p className="error">Este enlace no es válido o ha caducado. Pídele uno nuevo al encargado de la asociación.</p>
      </main>
    )

  if (hecho)
    return (
      <main className="centro">
        {cabecera}
        <h2>Solicitud enviada</h2>
        <p>Gracias. La asociación revisará tu solicitud. Cuando la aprueben podréis entrar con las cuentas de Google que habéis indicado y dar de alta a vuestros hijos.</p>
        <p className="aviso">No recibirás ningún aviso automático: vuelve a entrar en unos días o pregunta al encargado.</p>
        <button className="primario" onClick={() => { location.href = location.pathname }}>Ir a la aplicación</button>
      </main>
    )

  return (
    <main className="formulario-alta">
      <div className="fa-cab">{cabecera}</div>
      <p className="sub">Solicitud de alta de familia. Primero das de alta a tu familia y, cuando la aprueben, podrás dar de alta a cada hijo desde la aplicación.</p>
      <form onSubmit={enviar} noValidate>
        <section>
          <h2>Padre o tutor</h2>
          <p className="sub">Cada progenitor o tutor entrará con su propia cuenta de Google. Rellena los que vayan a usar la aplicación (basta con uno).</p>
          <label className="campo">Nombre y apellidos<input value={f.nombre_padre} onChange={set('nombre_padre')} autoComplete="off" /></label>
          <label className="campo">Correo de Google
            <input type="email" inputMode="email" value={f.correo_padre} onChange={set('correo_padre')} placeholder="tucorreo@gmail.com" />
          </label>
          <label className="campo">Móvil<input type="tel" inputMode="tel" value={f.movil_padre} onChange={set('movil_padre')} /></label>
        </section>

        <section>
          <h2>Madre o tutora</h2>
          <label className="campo">Nombre y apellidos<input value={f.nombre_madre} onChange={set('nombre_madre')} autoComplete="off" /></label>
          <label className="campo">Correo de Google
            <input type="email" inputMode="email" value={f.correo_madre} onChange={set('correo_madre')} placeholder="sucorreo@gmail.com" />
          </label>
          <label className="campo">Móvil<input type="tel" inputMode="tel" value={f.movil_madre} onChange={set('movil_madre')} /></label>
        </section>

        <section>
          <h2>Domicilio</h2>
          <label className="campo">Dirección<input value={f.direccion} onChange={set('direccion')} autoComplete="street-address" /></label>
        </section>

        {/* Campo trampa: las personas no lo ven; los robots suelen rellenarlo */}
        <input className="trampa" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.web} onChange={set('web')} name="web" />

        <label className="consentimiento">
          <input type="checkbox" checked={f.consentimiento} onChange={e => setF({ ...f, consentimiento: e.target.checked })} />
          <span>Acepto este medio para facilitar los datos necesarios a la asociación y que los trate para gestionar la participación de mis hijos. *</span>
        </label>

        {error && <p className="error">{error}</p>}
        <button className="primario" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar solicitud'}</button>
      </form>
    </main>
  )
}
