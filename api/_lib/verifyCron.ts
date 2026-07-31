import type { VercelRequest } from '@vercel/node'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp } from './firebaseAdmin.js'

export function verifyCronSecret(req: VercelRequest): boolean {
  const secret = req.headers['x-cron-secret']
  return !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET
}

/**
 * ตรวจ Firebase idToken + email อยู่ใน whitelist
 * fail-closed: หาก ALLOWED_EMAILS ว่าง → ปฏิเสธทุก request
 */
export async function verifyOwner(
  req: VercelRequest
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const allowed = (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)

  if (allowed.length === 0) {
    return { ok: false, error: 'ALLOWED_EMAILS is not configured' }
  }

  const idToken = (req.headers.authorization || '').replace('Bearer ', '')
  if (!idToken) return { ok: false, error: 'missing auth token' }

  let decoded
  try {
    decoded = await getAuth(getAdminApp()).verifyIdToken(idToken)
  } catch {
    return { ok: false, error: 'invalid auth token' }
  }

  if (!decoded.email_verified) {
    return { ok: false, error: 'email not verified' }
  }

  const email = (decoded.email || '').toLowerCase()
  if (!allowed.includes(email)) {
    return { ok: false, error: 'email not allowed' }
  }

  return { ok: true, email }
}
