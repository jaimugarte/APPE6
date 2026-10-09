import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Si algo falla al pintar, se muestra el error en vez de dejar la página en blanco
class Seguro extends React.Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  async limpiar() {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.()
      await Promise.all((regs || []).map(r => r.unregister()))
      const claves = await caches?.keys?.()
      await Promise.all((claves || []).map(k => caches.delete(k)))
    } catch { /* sin permisos */ }
    location.reload()
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 480, margin: '0 auto' }}>
        <h2>Algo ha fallado</h2>
        <p>La app no ha podido mostrarse. Prueba a recargarla; si sigue igual, limpia la caché.</p>
        <p><button onClick={() => location.reload()}>Recargar</button> <button onClick={() => this.limpiar()}>Limpiar caché y recargar</button></p>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, color: '#a00' }}>{String(this.state.error?.message || this.state.error)}</pre>
      </div>
    )
  }
}

createRoot(document.getElementById('root')).render(<Seguro><App /></Seguro>)
