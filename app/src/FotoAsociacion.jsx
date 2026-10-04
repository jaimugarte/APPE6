import { useRef, useState } from 'react'
import { supabase } from './supabase'
import { BUCKET, prepararFoto, useFotoUrl } from './foto'

// Sección de Ajustes (solo encargado): foto de la asociación
export default function FotoAsociacion({ asoc, fotoRuta, recargar }) {
  const url = useFotoUrl(fotoRuta)
  const entrada = useRef(null)
  const [ocupado, setOcupado] = useState(false)
  const [msg, setMsg] = useState('')

  const subir = async e => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setOcupado(true); setMsg('')
    try {
      const blob = await prepararFoto(f)
      const ruta = `${asoc}/foto-${Date.now()}.jpg`
      const { error: e1 } = await supabase.storage.from(BUCKET).upload(ruta, blob, { contentType: 'image/jpeg' })
      if (e1) throw e1
      const { error: e2 } = await supabase.rpc('establecer_foto_asociacion', { p_asoc: asoc, p_ruta: ruta })
      if (e2) throw e2
      if (fotoRuta) await supabase.storage.from(BUCKET).remove([fotoRuta]) // la anterior ya no hace falta
      await recargar()
    } catch (err) { setMsg(err.message || 'No se pudo subir la foto.') }
    setOcupado(false)
  }

  const quitar = async () => {
    if (!window.confirm('¿Quitar la foto de la asociación?')) return
    setOcupado(true); setMsg('')
    const { error } = await supabase.rpc('establecer_foto_asociacion', { p_asoc: asoc, p_ruta: null })
    if (error) setMsg(error.message)
    else { await supabase.storage.from(BUCKET).remove([fotoRuta]); await recargar() }
    setOcupado(false)
  }

  return (
    <section>
      <h2>Foto de la asociación</h2>
      <p className="sub">Se muestra en la pantalla de inicio. La ven todos los miembros, incluidas las familias: evita fotos donde se pueda identificar a menores sin autorización.</p>
      {url && <img className="foto-prev" src={url} alt="Foto de la asociación" />}
      {msg && <p className="error">{msg}</p>}
      <div className="fila">
        <button disabled={ocupado} onClick={() => entrada.current?.click()}>
          {ocupado ? 'Subiendo…' : fotoRuta ? 'Cambiar foto' : 'Subir foto'}
        </button>
        {fotoRuta && <button disabled={ocupado} onClick={quitar}>Quitar</button>}
        <input ref={entrada} type="file" accept="image/*" hidden onChange={subir} />
      </div>
    </section>
  )
}
