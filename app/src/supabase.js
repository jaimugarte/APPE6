import { createClient } from '@supabase/supabase-js'
// La sesión se guarda en el navegador y se renueva sola: no hay que volver a entrar.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
