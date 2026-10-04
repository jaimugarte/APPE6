import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export const BUCKET = 'asociacion-fotos'

// Reduce la foto antes de subirla (lado máximo 1600 px, JPEG): ahorra datos en el móvil y espacio de almacenamiento
export async function prepararFoto(file, maxLado = 1600, calidad = 0.85) {
  const img = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const k = Math.min(1, maxLado / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  img.close?.()
  return new Promise((ok, ko) => c.toBlob(b => (b ? ok(b) : ko(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', calidad))
}

// El bucket es privado: la foto se enseña con una URL firmada que caduca
export function useFotoUrl(ruta) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let vigente = true
    setUrl(null)
    if (!ruta) return
    supabase.storage.from(BUCKET).createSignedUrl(ruta, 6 * 3600)
      .then(({ data }) => { if (vigente) setUrl(data?.signedUrl || null) })
    return () => { vigente = false }
  }, [ruta])
  return url
}
