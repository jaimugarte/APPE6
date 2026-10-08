import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { esCodigoPostal } from './util'

function Campo({ label, children, ancho }) {
  return <label className={'campo' + (ancho ? ' ancho' : '')}><span>{label}</span>{children}</label>
}

// Ajustes de la familia: datos de contacto y domicilio (los correos de Google los gestiona la asociación)
export default function FamiliaAjustes() {
  const [familia, setFamilia] = useState(undefined)
  useEffect(() => { supabase.from('familias').select('*').maybeSingle().then(({ data }) => setFamilia(data || null)) }, [])
  if (familia === undefined) return <main><p>Cargando…</p></main>
  return <DatosFamilia familia={familia} onCambio={() => {}} />
}

function DatosFamilia({ familia, onCambio }) {
  const [f, setF] = useState(() => ({
    nombre_padre: familia?.nombre_padre ?? '', movil_padre: familia?.movil_padre ?? '',
    nombre_madre: familia?.nombre_madre ?? '', movil_madre: familia?.movil_madre ?? '', direccion: familia?.direccion ?? '',
    codigo_postal: familia?.codigo_postal ?? '', localidad: familia?.localidad ?? '', provincia: familia?.provincia ?? ''
  }))
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState('')
  const set = k => e => setF({ ...f, [k]: e.target.value })

  const guardar = async () => {
    setMsg(''); setOk('')
    if (!esCodigoPostal(f.codigo_postal)) return setMsg('El código postal debe tener 5 cifras.')
    const { error } = await supabase.rpc('actualizar_familia', { p_datos: f })
    if (error) return setMsg(error.message)
    setOk('Guardado.'); onCambio()
  }

  if (!familia)
    return (
      <main>
        <div className="barra"><h2>Ajustes</h2></div>
        <p className="aviso">Todavía no hay datos de familia registrados. Habla con la asociación.</p>
      </main>
    )

  return (
    <main>
      <div className="barra"><h2>Ajustes</h2></div>
      <section>
        <h2>Datos de la familia · Padre o tutor</h2>
        <div className="formgrid">
          <Campo label="Nombre y apellidos"><input value={f.nombre_padre} onChange={set('nombre_padre')} /></Campo>
          <Campo label="Móvil"><input type="tel" value={f.movil_padre} onChange={set('movil_padre')} /></Campo>
          {familia.correo_padre && <Campo label="Correo de Google"><input value={familia.correo_padre} disabled /></Campo>}
        </div>
      </section>
      <section>
        <h2>Madre o tutora</h2>
        <div className="formgrid">
          <Campo label="Nombre y apellidos"><input value={f.nombre_madre} onChange={set('nombre_madre')} /></Campo>
          <Campo label="Móvil"><input type="tel" value={f.movil_madre} onChange={set('movil_madre')} /></Campo>
          {familia.correo_madre && <Campo label="Correo de Google"><input value={familia.correo_madre} disabled /></Campo>}
        </div>
      </section>
      <section>
        <h2>Domicilio</h2>
        <Campo label="Dirección (calle, número, piso)"><input value={f.direccion} onChange={set('direccion')} autoComplete="address-line1" /></Campo>
        <Campo label="Código postal"><input inputMode="numeric" maxLength={5} value={f.codigo_postal} onChange={set('codigo_postal')} autoComplete="postal-code" /></Campo>
        <Campo label="Localidad"><input value={f.localidad} onChange={set('localidad')} autoComplete="address-level2" /></Campo>
        <Campo label="Provincia"><input value={f.provincia} onChange={set('provincia')} autoComplete="address-level1" /></Campo>
      </section>
      <p className="aviso">Los correos son las cuentas de Google con las que entráis. Para cambiarlos, habla con la asociación.</p>
      <div className="fila">
        <button className="primario" onClick={guardar}>Guardar</button>
        {msg && <span className="error">{msg}</span>}
        {ok && <span className="okmsg">{ok}</span>}
      </div>
    </main>
  )
}

