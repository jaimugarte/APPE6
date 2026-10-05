import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { NIVELES } from './util'

const POR_DEFECTO = { puede_ver: false, puede_editar: false, ambito: 'su_nivel' }

// Pantalla del encargado: qué ve y edita cada preceptor, y de qué niveles se ocupa
export default function Permisos({ asoc, apps }) {
  // Campos de trabajo no se configura aquí: todos los preceptores tienen acceso
  const activas = apps.filter(a => a.activa && a.app_clave !== 'campos_trabajo')
  const [perms, setPerms] = useState([])
  const [preceptores, setPreceptores] = useState([])
  const [niveles, setNiveles] = useState([])
  const [nuevo, setNuevo] = useState({})
  const [msg, setMsg] = useState('')

  const cargar = async () => {
    setPerms((await supabase.from('permisos_preceptor').select('*').eq('asociacion_id', asoc)).data || [])
    setPreceptores((await supabase.from('accesos_permitidos').select('email')
      .eq('asociacion_id', asoc).eq('rol', 'preceptor').order('email')).data || [])
    setNiveles((await supabase.from('preceptor_niveles').select('*').eq('asociacion_id', asoc)).data || [])
  }
  useEffect(() => { cargar() }, [asoc])

  const guardar = async (clave, cambios) => {
    const actual = perms.find(p => p.app_clave === clave) || POR_DEFECTO
    const fila = { ...POR_DEFECTO, ...actual, ...cambios }
    if (!fila.puede_ver) fila.puede_editar = false
    if (fila.puede_editar) fila.puede_ver = true
    const { error } = await supabase.from('permisos_preceptor').upsert({
      asociacion_id: asoc, app_clave: clave,
      puede_ver: fila.puede_ver, puede_editar: fila.puede_editar, ambito: fila.ambito
    })
    setMsg(error?.message || ''); cargar()
  }

  const addNivel = async email => {
    const n = (nuevo[email] || '').trim()
    if (!n) return
    const { error } = await supabase.from('preceptor_niveles').insert({ asociacion_id: asoc, email, nivel: n })
    setMsg(error?.code === '23505' ? 'Ese nivel ya está asignado.' : error?.message || '')
    setNuevo({ ...nuevo, [email]: '' }); cargar()
  }
  const quitarNivel = async (email, nivel) => {
    const { error } = await supabase.from('preceptor_niveles').delete()
      .eq('asociacion_id', asoc).eq('email', email).eq('nivel', nivel)
    setMsg(error?.message || ''); cargar()
  }

  const algunoSuNivel = activas.some(a => (perms.find(p => p.app_clave === a.app_clave)?.ambito ?? 'su_nivel') === 'su_nivel')

  return (
    <>
      {msg && <p className="error">{msg}</p>}
      <section>
        <h2>Permisos de los preceptores</h2>
        <p className="aviso">Se aplican a todos los preceptores de la asociación. Con «Solo su nivel», cada preceptor solo accede a los socios de los niveles que tenga asignados.</p>
        {activas.length === 0 && <p className="aviso">Activa alguna app para configurar sus permisos.</p>}
        {activas.map(a => {
          const p = perms.find(x => x.app_clave === a.app_clave) || POR_DEFECTO
          return (
            <div key={a.app_clave} className="permiso">
              <b>{a.apps.nombre}</b>
              <label><input type="checkbox" checked={p.puede_ver} onChange={e => guardar(a.app_clave, { puede_ver: e.target.checked })} /> Ver</label>
              <label><input type="checkbox" checked={p.puede_editar} onChange={e => guardar(a.app_clave, { puede_editar: e.target.checked })} /> Editar</label>
              <select value={p.ambito} disabled={!p.puede_ver} onChange={e => guardar(a.app_clave, { ambito: e.target.value })}>
                <option value="su_nivel">Solo su nivel</option>
                <option value="todos">Todos los niveles</option>
              </select>
            </div>
          )
        })}
      </section>

      {algunoSuNivel && (
        <section>
          <h2>Niveles de cada preceptor</h2>
          {preceptores.length === 0 && <p className="aviso">Todavía no has autorizado a ningún preceptor (añádelo en «Cuentas con acceso»).</p>}
          {preceptores.map(pr => {
            const mios = niveles.filter(n => n.email === pr.email)
            return (
              <div key={pr.email} className="preceptor">
                <b>{pr.email}</b>
                <div className="chips">
                  {mios.map(n => (
                    <span key={n.nivel} className="chip">{n.nivel}<button aria-label={`Quitar ${n.nivel}`} onClick={() => quitarNivel(pr.email, n.nivel)}>×</button></span>
                  ))}
                  {mios.length === 0 && <small className="error">Sin niveles: no verá ningún socio</small>}
                </div>
                <div className="fila">
                  <input list="niveles-permisos" placeholder="Añadir nivel" value={nuevo[pr.email] || ''}
                    onChange={e => setNuevo({ ...nuevo, [pr.email]: e.target.value })} />
                  <button onClick={() => addNivel(pr.email)}>Añadir</button>
                </div>
              </div>
            )
          })}
          <datalist id="niveles-permisos">{NIVELES.map(n => <option key={n} value={n} />)}</datalist>
        </section>
      )}
    </>
  )
}
