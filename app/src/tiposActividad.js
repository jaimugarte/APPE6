// Tipos de actividad del calendario (antes «planes»)
export const TIPOS_ACT = [['plan', 'Plan'], ['convivencia', 'Convivencia'], ['curso_retiro', 'Curso de Retiro']]
export const etiquetaTipo = t => TIPOS_ACT.find(x => x[0] === t)?.[1] || 'Plan'
// Las actividades de estos tipos son a las que se puede cargar el dinero de los campos de trabajo
export const TIPOS_RETIRO = ['convivencia', 'curso_retiro']
