import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { NIVELES, esEmail } from './util'
import { Logo } from './iconos'

const VACIO = {
  nombre_padre: '', nombre_madre: '', correo_padre: '', correo_madre: '', movil_padre: '', movil_madre: '',
  direccion: '', email: '', email2: '', niveles: [], consentimiento: false, web: ''
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
  const alternar = n => setF({ ...f, niveles: f.niveles.includes(n) ? f.niveles.filter(x => x !== n) : [...f.niveles, n] })

  const enviar = async e => {
    e.preventDefault()
    setError('')
    if (f.web) return setHecho(true) // campo trampa para robots: se simula el envío
    if (!f.nombre_padre.trim() && !f.nombre_madre.trim()) return setError('Indica al menos el nombre del padre o de la madre.')
    if (!f.email.trim() || !esEmail(f.email.trim())) return setError('Escribe un correo de Google válido para entrar a la aplicación.')
    if (!esEmail(f.email2.trim())) return setError('El segundo correo no es válido.')
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
        <p>Gracias. La asociación revisará tu solicitud. Cuando la aprueben podrás entrar con tu cuenta de Google ({f.email.trim() || 'la que has indicado'}) y dar de alta a tus hijos.</p>
        <p className="aviso">No recibirás ningún aviso automático: vuelve a entrar en unos días o pregunta al encargado.</p>
        <button className="primario" onClick={() => { location.href = location.pathname }}>Ir a la aplicación</button>
      </main>
    )

  return (
    <main className="formulario-alta">
      <div className="fa-cab">{cabecera}</div>
      <p className="sub">Solicitud de alta de familia. Primero das de alta a tu familia y, cuando la aprueben, podrás añadir a cada hijo desde la aplicación.</p>
      <form onSubmit={enviar} noValidate>
        <section>
          <h2>Cuenta para entrar</h2>
          <label className="campo">Correo de Google *
            <input type="email" inputMode="email" autoComplete="email" value={f.email} onChange={set('email')} placeholder="tucorreo@gmail.com" />
            <small>Es la cuenta con la que entrarás a la aplicación.</small>
          </label>
          <label className="campo">Segunda cuenta de Google (opcional)
            <input type="email" inputMode="email" value={f.email2} onChange={set('email2')} placeholder="la del otro progenitor" />
          </label>
        </section>

        <section>
          <h2>Padre y madre</h2>
          <div className="dos-col">
            <label className="campo">Nombre del padre<input value={f.nombre_padre} onChange={set('nombre_padre')} autoComplete="off" /></label>
            <label className="campo">Nombre de la madre<input value={f.nombre_madre} onChange={set('nombre_madre')} autoComplete="off" /></label>
            <label className="campo">Móvil del padre<input type="tel" inputMode="tel" value={f.movil_padre} onChange={set('movil_padre')} /></label>
            <label className="campo">Móvil de la madre<input type="tel" inputMode="tel" value={f.movil_madre} onChange={set('movil_madre')} /></label>
            <label className="campo">Correo del padre<input type="email" value={f.correo_padre} onChange={set('correo_padre')} /></label>
            <label className="campo">Correo de la madre<input type="email" value={f.correo_madre} onChange={set('correo_madre')} /></label>
          </div>
          <label className="campo">Dirección<input value={f.direccion} onChange={set('direccion')} autoComplete="street-address" /></label>
        </section>

        <section>
          <h2>Nivel de tus hijos</h2>
          <p className="sub">Orientativo: ayuda a que la solicitud llegue al preceptor que corresponde. Los datos de cada hijo los añadirás después.</p>
          <div className="chips">
            {NIVELES.map(n => (
              <button type="button" key={n} className={'chip tipo' + (f.niveles.includes(n) ? ' on' : '')}
                aria-pressed={f.niveles.includes(n)} onClick={() => alternar(n)}>{n}</button>
            ))}
          </div>
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
