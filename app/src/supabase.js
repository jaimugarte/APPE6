import { createClient } from '@supabase/supabase-js'
import { crearClienteDemo } from './demo/cliente'

// Modo demo: datos de ejemplo en memoria, sin Supabase ni Google.
// Se activa con VITE_DEMO=true, o automáticamente si no se han configurado las claves de Supabase.
export const DEMO = import.meta.env.VITE_DEMO === 'true' || !import.meta.env.VITE_SUPABASE_URL

// En modo real la sesión se guarda en el navegador y se renueva sola: no hay que volver a entrar.
export const supabase = DEMO
  ? crearClienteDemo()
  : createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
