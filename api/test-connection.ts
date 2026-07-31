import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyOwner } from './_lib/verifyCron.js'
import { runHealthCheck } from '../shared/healthCheck.js'
import { deriveFromSupabaseUrl } from '../shared/derive.js'

// รับเฉพาะ Supabase managed URL เท่านั้น — ป้องกันใช้ endpoint นี้เป็น SSRF proxy
const SUPABASE_URL_RE = /^https:\/\/[a-z0-9]{16,25}\.supabase\.co$/

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const auth = await verifyOwner(req)
  if (!auth.ok) return res.status(401).json({ error: auth.error })

  const { supabaseUrl, anonKey } = req.body || {}
  if (!supabaseUrl || !anonKey) {
    return res.status(400).json({ error: 'supabaseUrl and anonKey are required' })
  }

  if (!SUPABASE_URL_RE.test(supabaseUrl)) {
    return res.status(400).json({ error: 'supabaseUrl ต้องอยู่ในรูป https://<ref>.supabase.co เท่านั้น' })
  }

  let derived
  try {
    derived = deriveFromSupabaseUrl(supabaseUrl)
  } catch {
    return res.status(400).json({ error: 'invalid supabaseUrl' })
  }

  const result = await runHealthCheck({ id: 'test', supabaseUrl, anonKey })
  return res.status(200).json({ ok: true, result, derived })
}
