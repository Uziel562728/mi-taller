const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || ''
let publicKey = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key)
if (key.startsWith('eyJ')) {
  try { publicKey = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon' } catch { /* Reject malformed keys. */ }
}
if (!url || !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url) || !publicKey) {
  console.error('Configurá las variables públicas VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY (publishable o anon). No uses claves privadas.')
  process.exitCode = 1
}
