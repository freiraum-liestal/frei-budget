import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isCloudConfigured = Boolean(url && anonKey)

// Wenn keine Env-Variablen gesetzt sind, bleibt die App im reinen Lokal-Modus
// (siehe AppContext) – es gibt keinen Crash, nur keine Cloud-Funktion.
export const supabase = isCloudConfigured ? createClient(url as string, anonKey as string) : null
