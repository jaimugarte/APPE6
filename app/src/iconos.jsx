// Iconos de línea sencillos, en SVG en línea (sin dependencias)
const trazo = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' }

export function IconoApp({ clave, size = 22 }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true, ...trazo }
  switch (clave) {
    case 'socios':
      return <svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><circle cx="17.5" cy="9" r="2.5" /><path d="M17 14c2.5.2 4.5 1.9 4.5 4.5" /></svg>
    case 'asistencia':
      return <svg {...p}><rect x="4" y="4" width="16" height="16" rx="4" /><path d="m8.5 12.5 2.5 2.5 4.5-5.5" /></svg>
    case 'estadisticas':
      return <svg {...p}><path d="M5 20v-9M12 20V5M19 20v-7" /></svg>
    case 'anuncios':
      return <svg {...p}><path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1Z" /><path d="M17 9.5a3.5 3.5 0 0 1 0 5" /></svg>
    case 'fotos':
      return <svg {...p}><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.2-2h5.6L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z" /><circle cx="12" cy="13" r="3.2" /></svg>
    case 'actividades':
      return <svg {...p}><rect x="4" y="5.5" width="16" height="14.5" rx="3" /><path d="M8 3.5v4M16 3.5v4M4 10h16" /><path d="m9 15 2 2 4-4" /></svg>
    case 'campos_trabajo':
      return <svg {...p}><path d="M12 20v-8" /><path d="M12 12c0-3 2-5 5-5 0 3-2 5-5 5Z" /><path d="M12 15c0-2.5-1.8-4.2-4.5-4.2 0 2.6 1.8 4.2 4.5 4.2Z" /><path d="M6 20h12" /></svg>
    case 'dineros':
      return <svg {...p}><ellipse cx="12" cy="7" rx="7" ry="3" /><path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" /><path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></svg>
    case 'ajustes':
      return <svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" /></svg>
    case 'furgonetas':
      return <svg {...p}><path d="M3 16V8.5A1.5 1.5 0 0 1 4.5 7H14v9" /><path d="M14 10h3.6l2.9 3.2V16H14" /><circle cx="7.5" cy="17" r="1.8" /><circle cx="16.5" cy="17" r="1.8" /></svg>
    case 'herramientas':
      return <svg {...p}><path d="M14.5 6.2a4 4 0 0 0-5 5L4.5 16.2a1.8 1.8 0 0 0 2.6 2.6l5-5a4 4 0 0 0 5-5l-2.4 2.4-2.2-.6-.6-2.2Z" /></svg>
    case 'hijos':
      return <svg {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><path d="M18 8v6M15 11h6" /></svg>
    case 'cuotas':
      return <svg {...p}><rect x="3.5" y="6" width="17" height="12" rx="3" /><circle cx="12" cy="12" r="2.6" /><path d="M7 12h.01M17 12h.01" /></svg>
    case 'solicitudes':
      return <svg {...p}><path d="M4 13.5 6.2 6.6A1.5 1.5 0 0 1 7.6 5.5h8.8a1.5 1.5 0 0 1 1.4 1.1L20 13.5" /><path d="M4 13.5V18a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 18v-4.5h-4.2a3.8 3.8 0 0 1-7.6 0Z" /></svg>
    default:
      return <svg {...p}><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></svg>
  }
}

// Marca de la app: cuatro módulos, uno más tenue (el que aún está por llegar)
// Logo de la asociación (la mascota); ocupa todo el contenedor `.logo`
export function Logo() {
  return <img src="/icon-192.png" alt="" aria-hidden="true" width="64" height="64" style={{ width: '100%', height: '100%', display: 'block', borderRadius: 'inherit' }} />
}

export function IconoCalendario({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...trazo}>
      <rect x="4" y="5.5" width="16" height="14.5" rx="3" /><path d="M8 3.5v4M16 3.5v4M4 10h16" />
    </svg>
  )
}
