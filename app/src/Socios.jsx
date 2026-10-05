import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'
import { NIVELES, hoy, fecha, edad, normalizarIban, ibanValido, esEmail } from './util'
import { eur, textoDescuento } from './cuotas'
import ImportarSocios from './ImportarSocios'

const VACIO = {
  nombre: '', apellidos: '', fecha_nacimiento: '', nivel: '',
  nombre_padre: '', nombre_madre: '', alergias: '', direccion: '',
  correo_padre: '', correo_madre: '', correo_socio: '', movil_padre: '', movil_madre: ''
}
const abierto = s => s.periodos_alta?.find(p => !p.fecha_baja)

export default function Socios({ asoc, rol, email }) {
  const [socios, setSocios] = useState(null)
  const [perm, setPerm] = useState(null)
  const [misNiveles, setMisNiveles] = useState([])
  const [q, setQ] = useState('')
  const [nivel, setNivel] = useState('')
  const [estado, setEstado] = useState('activos')
  const [sel, setSel] = useState(null) // null | 'nuevo' | id
  const [msg, setMsg] = useState('')

  const esEncargado = rol === 'encargado'
  const esPreceptor = rol === 'preceptor'
  const puedeEditar = esEncargado || (esPreceptor && !!perm?.puede_editar)
  // Un preceptor limitado a su nivel solo puede crear socios en sus niveles
  const restringido = esPreceptor && perm?.ambito !== 'todos'

  const cargar = async () => {
    const { data, error } = await supabase
      .from('socios')
      .select('*, periodos_alta(id, fecha_alta, fecha_baja, motivo_baja)')
      .eq('asociacion_id', asoc).order('apellidos').order('nombre')
    setMsg(error?.message || '')
    setSocios(data || [])
  }

  useEffect(() => { cargar() }, [asoc])
  useEffect(() => {
    if (!esPreceptor) return
    supabase.from('permisos_preceptor').select('*').eq('asociacion_id', asoc).eq('app_clave', 'socios')
      .maybeSingle().then(({ data }) => setPerm(data))
    supabase.from('preceptor_niveles').select('nivel').eq('asociacion_id', asoc).eq('email', email.toLowerCase())
      .then(({ data }) => setMisNiveles((data || []).map(x => x.nivel)))
  }, [asoc, esPreceptor, email])

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (socios || []).filter(s => {
      if (estado === 'activos' && !abierto(s)) return false
      if (estado === 'bajas' && abierto(s)) return false
      if (nivel && s.nivel !== nivel) return false
      return !t || `${s.nombre} ${s.apellidos}`.toLowerCase().includes(t)
    })
  }, [socios, q, nivel, estado])

  const niveles = useMemo(
    () => [...new Set((socios || []).map(s => s.nivel).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
    [socios])

  if (socios === null) return <main><p>Cargando socios…</p></main>

  if (sel === 'importar') {
    return <ImportarSocios asoc={asoc} esEncargado={esEncargado} existentes={socios}
      nivelesPermitidos={restringido ? misNiveles : null} onVolver={() => setSel(null)} onCambio={cargar} />
  }

  if (sel) {
    const socio = sel === 'nuevo' ? null : socios.find(s => s.id === sel)
    return (
      <Ficha
        key={sel} socio={socio} asoc={asoc} esEncargado={esEncargado} puedeEditar={puedeEditar}
        restringido={restringido} nivelesOpc={restringido ? misNiveles : NIVELES}
        onVolver={() => setSel(null)} onCambio={cargar} />
    )
  }

  const activos = (socios || []).filter(abierto).length

  return (
    <main>
      <div className="barra">
        <h2>Socios <small>({activos} activos de {socios.length})</small></h2>
        {puedeEditar && (
          <span className="fila">
            <button onClick={() => setSel('importar')}>Importar CSV</button>
            <button className="primario" onClick={() => setSel('nuevo')}>+ Nuevo socio</button>
          </span>
        )}
      </div>
      {msg && <p className="error">{msg}</p>}

      <div className="filtros">
        <input type="search" placeholder="Buscar por nombre o apellidos" value={q} onChange={e => setQ(e.target.value)} />
        <select value={nivel} onChange={e => setNivel(e.target.value)}>
          <option value="">Todos los niveles</option>
          {niveles.map(n => <option key={n}>{n}</option>)}
        </select>
        <select value={estado} onChange={e => setEstado(e.target.value)}>
          <option value="activos">Activos</option>
          <option value="bajas">De baja</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      {lista.length === 0 && <p className="aviso">No hay socios que coincidan.</p>}
      {lista.map(s => {
        const a = edad(s.fecha_nacimiento)
        return (
          <button key={s.id} className="item" onClick={() => setSel(s.id)}>
            <span>
              <b>{s.apellidos}, {s.nombre}</b>
              <small className="meta">
                {s.nivel && <span>{s.nivel}</span>}
                {a != null && <span>{a} años</span>}
              </small>
            </span>
            <span className={abierto(s) ? 'badge ok' : 'badge baja'}>{abierto(s) ? 'Alta' : 'Baja'}</span>
          </button>
        )
      })}
    </main>
  )
}

function Campo({ label, children, ancho }) {
  return <label className={'campo' + (ancho ? ' ancho' : '')}><span>{label}</span>{children}</label>
}

function Ficha({ socio, asoc, esEncargado, puedeEditar, restringido, nivelesOpc, onVolver, onCambio }) {
  const nuevo = !socio
  const [f, setF] = useState(() => socio
    ? Object.fromEntries(Object.keys(VACIO).map(k => [k, socio[k] ?? '']))
    : { ...VACIO, nivel: restringido ? (nivelesOpc[0] || '') : '' })
  const [altaInicial, setAltaInicial] = useState(hoy())
  const [iban, setIban] = useState('')
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [versionCuota, setVersionCuota] = useState(0)
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const ro = !puedeEditar

  useEffect(() => {
    if (esEncargado && socio)
      supabase.from('socios_bancarios').select('iban').eq('socio_id', socio.id).maybeSingle()
        .then(({ data }) => setIban(data?.iban || ''))
  }, [socio?.id, esEncargado])

  const guardar = async () => {
    setMsg(''); setOk('')
    if (!f.nombre.trim() || !f.apellidos.trim()) return setMsg('Nombre y apellidos son obligatorios.')
    for (const [k, t] of [['correo_padre', 'del padre'], ['correo_madre', 'de la madre'], ['correo_socio', 'del socio']])
      if (!esEmail(f[k].trim())) return setMsg(`El correo ${t} no es válido.`)
    if (esEncargado && iban.trim() && !ibanValido(iban)) return setMsg('El IBAN no es válido.')

    const datos = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim() || null]))
    setGuardando(true)
    let id = socio?.id
    if (nuevo) {
      const { data, error } = await supabase.from('socios')
        .insert({ ...datos, asociacion_id: asoc }).select('id').single()
      if (error) { setGuardando(false); return setMsg(error.message) }
      id = data.id
      const { error: e2 } = await supabase.from('periodos_alta').insert({ socio_id: id, fecha_alta: altaInicial })
      if (e2) { setGuardando(false); await onCambio(); return setMsg('El socio se creó, pero falló el alta: ' + e2.message) }
    } else {
      const { data, error } = await supabase.from('socios').update(datos).eq('id', id).select('id')
      if (error) { setGuardando(false); return setMsg(error.message) }
      if (!data?.length) { setGuardando(false); return setMsg('No tienes permiso para editar este socio.') }
    }
    if (esEncargado) {
      const v = normalizarIban(iban)
      const { error } = v
        ? await supabase.from('socios_bancarios').upsert({ socio_id: id, iban: v })
        : await supabase.from('socios_bancarios').delete().eq('socio_id', id)
      if (error) { setGuardando(false); await onCambio(); return setMsg('Datos guardados, pero no el IBAN: ' + error.message) }
    }
    setGuardando(false)
    await onCambio()
    if (nuevo) onVolver(); else setOk('Guardado.')
  }

  return (
    <main>
      <div className="barra">
        <button onClick={onVolver}>← Volver</button>
        <h2>{nuevo ? 'Nuevo socio' : `${socio.nombre} ${socio.apellidos}`}</h2>
      </div>

      <section>
        <h2>Datos del socio</h2>
        <div className="formgrid">
          <Campo label="Nombre *"><input value={f.nombre} onChange={set('nombre')} disabled={ro} /></Campo>
          <Campo label="Apellidos *"><input value={f.apellidos} onChange={set('apellidos')} disabled={ro} /></Campo>
          <Campo label="Fecha de nacimiento">
            <input type="date" value={f.fecha_nacimiento} onChange={set('fecha_nacimiento')} disabled={ro} />
          </Campo>
          <Campo label="Nivel">
            {restringido ? (
              <select value={f.nivel} onChange={set('nivel')} disabled={ro}>
                {nivelesOpc.map(n => <option key={n}>{n}</option>)}
                {f.nivel && !nivelesOpc.includes(f.nivel) && <option>{f.nivel}</option>}
              </select>
            ) : (
              <>
                <input list="lista-niveles" value={f.nivel} onChange={set('nivel')} disabled={ro} placeholder="p. ej. 2º ESO" />
                <datalist id="lista-niveles">{NIVELES.map(n => <option key={n} value={n} />)}</datalist>
              </>
            )}
          </Campo>
          {nuevo && (
            <Campo label="Fecha de alta">
              <input type="date" value={altaInicial} onChange={e => setAltaInicial(e.target.value)} />
            </Campo>
          )}
          <Campo label="Alergias" ancho>
            <textarea rows={2} value={f.alergias} onChange={set('alergias')} disabled={ro} />
          </Campo>
        </div>
      </section>

      <section>
        <h2>Familia y contacto</h2>
        <div className="formgrid">
          <Campo label="Nombre del padre"><input value={f.nombre_padre} onChange={set('nombre_padre')} disabled={ro} /></Campo>
          <Campo label="Móvil del padre"><input type="tel" value={f.movil_padre} onChange={set('movil_padre')} disabled={ro} /></Campo>
          <Campo label="Correo del padre"><input type="email" value={f.correo_padre} onChange={set('correo_padre')} disabled={ro} /></Campo>
          <Campo label="Nombre de la madre"><input value={f.nombre_madre} onChange={set('nombre_madre')} disabled={ro} /></Campo>
          <Campo label="Móvil de la madre"><input type="tel" value={f.movil_madre} onChange={set('movil_madre')} disabled={ro} /></Campo>
          <Campo label="Correo de la madre"><input type="email" value={f.correo_madre} onChange={set('correo_madre')} disabled={ro} /></Campo>
          <Campo label="Correo del socio"><input type="email" value={f.correo_socio} onChange={set('correo_socio')} disabled={ro} /></Campo>
          <Campo label="Dirección de casa" ancho><input value={f.direccion} onChange={set('direccion')} disabled={ro} /></Campo>
        </div>
      </section>

      {esEncargado && (
        <section>
          <h2>Datos bancarios <small>(solo visibles para el encargado)</small></h2>
          <Campo label="IBAN"><input value={iban} onChange={e => setIban(e.target.value)} placeholder="ES00 0000 0000 0000 0000 0000" /></Campo>
        </section>
      )}

      {puedeEditar && (
        <div className="fila">
          <button className="primario" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
          {msg && <span className="error">{msg}</span>}
          {ok && <span className="okmsg">{ok}</span>}
        </div>
      )}

      {!nuevo && <Periodos socio={socio} puedeEditar={puedeEditar} onCambio={onCambio} />}
      {!nuevo && (esEncargado || puedeEditar) && <Familia socio={socio} esEncargado={esEncargado} onVinculo={() => setVersionCuota(v => v + 1)} />}
      {!nuevo && <CuotaFamilia key={versionCuota} socio={socio} esEncargado={esEncargado} />}
    </main>
  )
}

// Historial de altas y bajas: nunca se borra nada
function Periodos({ socio, puedeEditar, onCambio }) {
  const [fechaMov, setFechaMov] = useState(hoy())
  const [motivo, setMotivo] = useState('')
  const [msg, setMsg] = useState('')

  const ps = [...(socio.periodos_alta || [])].sort((a, b) => b.fecha_alta.localeCompare(a.fecha_alta))
  const ab = ps.find(p => !p.fecha_baja)
  const ultimaBaja = ps.find(p => p.fecha_baja)?.fecha_baja

  const darBaja = async () => {
    setMsg('')
    if (fechaMov < ab.fecha_alta) return setMsg(`La baja no puede ser anterior al alta (${fecha(ab.fecha_alta)}).`)
    const { data, error } = await supabase.from('periodos_alta')
      .update({ fecha_baja: fechaMov, motivo_baja: motivo.trim() || null }).eq('id', ab.id).select('id')
    if (error || !data?.length) return setMsg(error?.message || 'No tienes permiso para esta operación.')
    setMotivo(''); onCambio()
  }
  const darAlta = async () => {
    setMsg('')
    if (ultimaBaja && fechaMov < ultimaBaja) return setMsg(`El alta no puede ser anterior a la última baja (${fecha(ultimaBaja)}).`)
    const { error } = await supabase.from('periodos_alta').insert({ socio_id: socio.id, fecha_alta: fechaMov })
    if (error) return setMsg(error.message)
    onCambio()
  }

  return (
    <section>
      <h2>Altas y bajas <small>({ab ? 'actualmente de alta' : 'actualmente de baja'})</small></h2>
      {ps.length === 0 && <p className="aviso">Sin historial todavía.</p>}
      <ul className="historial">
        {ps.map(p => (
          <li key={p.id}>
            <b>Alta</b> {fecha(p.fecha_alta)}
            {p.fecha_baja ? <> → <b>Baja</b> {fecha(p.fecha_baja)}{p.motivo_baja && <small> · {p.motivo_baja}</small>}</> : <span className="badge ok">en curso</span>}
          </li>
        ))}
      </ul>
      {puedeEditar && (
        <div className="fila">
          <input type="date" value={fechaMov} onChange={e => setFechaMov(e.target.value)} />
          {ab ? (
            <>
              <input placeholder="Motivo de la baja (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)} />
              <button className="peligro" onClick={darBaja}>Dar de baja</button>
            </>
          ) : (
            <button className="primario" onClick={darAlta}>Volver a dar de alta</button>
          )}
        </div>
      )}
      {msg && <p className="error">{msg}</p>}
    </section>
  )
}

// Cuentas de Google de las familias que pueden ver a este socio
function Familia({ socio, esEncargado, onVinculo }) {
  const [lista, setLista] = useState([])
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState('')

  const cargar = async () => setLista(
    (await supabase.from('familiares_socios').select('email').eq('socio_id', socio.id).order('email')).data || [])
  useEffect(() => { cargar() }, [socio.id])

  const sugeridos = [...new Set([socio.correo_padre, socio.correo_madre, socio.correo_socio]
    .filter(Boolean).map(s => s.toLowerCase()))].filter(e => !lista.some(l => l.email === e))

  const vincular = async () => {
    const e = email.trim().toLowerCase()
    setMsg('')
    if (!e || !esEmail(e)) return setMsg('Escribe un correo válido.')
    if (esEncargado) {
      // El encargado también autoriza el correo para que pueda entrar con Google
      const { data: ex } = await supabase.from('accesos_permitidos').select('rol').eq('email', e).maybeSingle()
      if (ex && ex.rol !== 'familia') return setMsg(`Ese correo ya está autorizado como ${ex.rol}.`)
      if (!ex) {
        const { error } = await supabase.from('accesos_permitidos')
          .insert({ email: e, asociacion_id: socio.asociacion_id, rol: 'familia' })
        if (error) return setMsg(error.code === '23505' ? 'Ese correo ya tiene acceso en otra asociación.' : error.message)
      }
    }
    const { error } = await supabase.from('familiares_socios').insert({ email: e, socio_id: socio.id })
    if (error) return setMsg(error.code === '23505' ? 'Ese correo ya está vinculado.' : error.message)
    await supabase.rpc('asegurar_familia', { p_socio: socio.id }) // registra la familia para su cuota y descuento
    setEmail(''); cargar(); onVinculo?.()
  }
  const quitar = async e => {
    const { error } = await supabase.from('familiares_socios').delete().eq('socio_id', socio.id).eq('email', e)
    setMsg(error?.message || ''); cargar()
  }

  return (
    <section>
      <h2>Acceso de la familia</h2>
      <p className="aviso">
        Estas cuentas de Google verán la ficha de este socio.
        {!esEncargado && ' El encargado debe autorizar además el correo para que pueda entrar.'}
      </p>
      {lista.map(l => (
        <div key={l.email} className="fila">{l.email}<button onClick={() => quitar(l.email)}>Quitar</button></div>
      ))}
      {lista.length === 0 && <p className="aviso">Ninguna cuenta vinculada.</p>}
      {sugeridos.length > 0 && (
        <div className="chips">
          {sugeridos.map(s => <button key={s} className="chip" onClick={() => setEmail(s)}>{s}</button>)}
        </div>
      )}
      <div className="fila">
        <input type="email" placeholder="correo@gmail.com" value={email} onChange={e => setEmail(e.target.value)} />
        <button onClick={vincular}>{esEncargado ? 'Autorizar y vincular' : 'Vincular'}</button>
      </div>
      {msg && <p className="error">{msg}</p>}
    </section>
  )
}

// Cuota mensual de la familia de este socio y descuento (lo pone el encargado o, si se permite, el preceptor)
function CuotaFamilia({ socio, esEncargado }) {
  const [c, setC] = useState(undefined) // undefined = cargando, null = sin familia registrada
  const [tipo, setTipo] = useState('porcentaje')
  const [valor, setValor] = useState('')
  const [nota, setNota] = useState('')
  const [msg, setMsg] = useState('')
  const [ok, setOk] = useState('')

  const cargar = async () => {
    const { data, error } = await supabase.rpc('cuota_familia', { p_socio: socio.id })
    if (error) { setMsg(error.message); return setC(null) }
    setC(data || null)
    if (data) { setTipo(data.descuento_tipo); setValor(String(data.descuento_valor || '')); setNota(data.descuento_nota || '') }
  }
  useEffect(() => { cargar() }, [socio.id])

  const guardar = async () => {
    setMsg(''); setOk('')
    const n = Number((valor || '0').replace(',', '.'))
    if (!Number.isFinite(n) || n < 0 || (tipo === 'porcentaje' && n > 100)) return setMsg('Descuento no válido.')
    const { error } = await supabase.rpc('poner_descuento', { p_socio: socio.id, p_tipo: tipo, p_valor: n, p_nota: nota })
    if (error) return setMsg(error.message)
    setOk('Descuento guardado.'); cargar()
  }

  if (c === undefined) return null
  return (
    <section>
      <h2>Cuota de la familia</h2>
      {!c && <p className="aviso">{msg || 'Este socio no tiene una cuenta de familia vinculada: vincúlala arriba para calcular su cuota.'}</p>}
      {c && (
        <>
          <p>
            <b>{eur(c.total)}/mes</b> por {c.hijos} {c.hijos === 1 ? 'hijo' : 'hijos'} de alta
            {c.descuento > 0 && <small className="aviso"> · cuota sin descuento {eur(c.base)}, descuento {textoDescuento(c.descuento_tipo, c.descuento_valor)} (−{eur(c.descuento)})</small>}
          </p>
          {c.puede_descuento ? (
            <>
              <div className="fila">
                <input className="importe" inputMode="decimal" aria-label="Valor del descuento" value={valor} placeholder="0" onChange={e => setValor(e.target.value)} />
                <select aria-label="Tipo de descuento" value={tipo} onChange={e => setTipo(e.target.value)}>
                  <option value="porcentaje">%</option><option value="euros">€/mes</option>
                </select>
                <input placeholder="Motivo (opcional)" value={nota} onChange={e => setNota(e.target.value)} />
                <button onClick={guardar}>Guardar descuento</button>
              </div>
              {msg && <p className="error">{msg}</p>}
              {ok && <p className="okmsg">{ok}</p>}
            </>
          ) : (
            c.descuento_valor > 0 && c.descuento_nota && <p className="aviso">Motivo del descuento: {c.descuento_nota}</p>
          )}
          {esEncargado && <RegistroPagos familiaId={c.familia_id} cuota={c.total} />}
        </>
      )}
    </section>
  )
}

// El encargado registra los pagos mensuales de la familia (sin fecha de pago = pendiente)
function RegistroPagos({ familiaId, cuota }) {
  const mesActual = hoy().slice(0, 7)
  const [mes, setMes] = useState(mesActual)
  const [importe, setImporte] = useState(String(cuota))
  const [pagado, setPagado] = useState(hoy())
  const [pagos, setPagos] = useState([])
  const [msg, setMsg] = useState('')

  const cargar = async () => setPagos((await supabase.from('pagos_cuota').select('mes, importe, pagado_en')
    .eq('familia_id', familiaId).order('mes', { ascending: false }).range(0, 5)).data || [])
  useEffect(() => { cargar() }, [familiaId])

  const guardar = async () => {
    setMsg('')
    const n = Number(importe.replace(',', '.'))
    if (!mes || !Number.isFinite(n) || n < 0) return setMsg('Indica un mes y un importe válidos.')
    const { error } = await supabase.from('pagos_cuota').upsert({ familia_id: familiaId, mes: `${mes}-01`, importe: n, pagado_en: pagado || null })
    setMsg(error?.message || ''); cargar()
  }

  return (
    <div className="registro-pagos">
      <h3>Registrar pago</h3>
      <div className="fila">
        <input type="month" aria-label="Mes" value={mes} onChange={e => setMes(e.target.value)} />
        <input className="importe" inputMode="decimal" aria-label="Importe" value={importe} onChange={e => setImporte(e.target.value)} />
        <input type="date" aria-label="Fecha de pago (vacía = pendiente)" value={pagado} onChange={e => setPagado(e.target.value)} />
        <button onClick={guardar}>Guardar</button>
      </div>
      <p className="aviso">Deja la fecha vacía para marcar el mes como pendiente.</p>
      {msg && <p className="error">{msg}</p>}
      {pagos.map(p => (
        <div key={p.mes} className="fila"><b>{p.mes.slice(0, 7)}</b> {p.importe} € · {p.pagado_en ? `pagado ${fecha(p.pagado_en)}` : 'pendiente'}</div>
      ))}
    </div>
  )
}
