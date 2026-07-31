import { initializeApp, getApps, cert, type App } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

let app: App

export function getAdminApp(): App {
  if (getApps().length) {
    app = getApps()[0]
    return app
  }
  const raw = process.env.FIREBASE_ADMIN_KEY
  if (!raw) throw new Error('FIREBASE_ADMIN_KEY env var is missing')
  const serviceAccount = JSON.parse(raw)
  app = initializeApp({ credential: cert(serviceAccount) })
  return app
}

export function adminDb() {
  return getFirestore(getAdminApp())
}
