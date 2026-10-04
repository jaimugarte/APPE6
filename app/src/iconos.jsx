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
    default:
      return <svg {...p}><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></svg>
  }
}

// Marca de la app: cuatro módulos, uno más tenue (el que aún está por llegar)
export function Logo({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="#fff">
      <rect x="3" y="3" width="8" height="8" rx="2.5" /><rect x="13" y="3" width="8" height="8" rx="2.5" />
      <rect x="3" y="13" width="8" height="8" rx="2.5" /><rect x="13" y="13" width="8" height="8" rx="2.5" opacity=".55" />
    </svg>
  )
}
