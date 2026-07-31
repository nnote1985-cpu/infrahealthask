import { adminDb } from './firebaseAdmin'
import { deriveFromSupabaseUrl } from '../../shared/derive'
import type { CheckResult, ProjectDoc, HealthStatus, SetupStatus } from '../../shared/types'
import { FieldValue } from 'firebase-admin/firestore'

export async function getEnabledProjects(): Promise<ProjectDoc[]> {
  const snap = await adminDb().collection('projects').where('enabled', '==', true).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjectDoc))
}

export async function getAllProjects(): Promise<ProjectDoc[]> {
  const snap = await adminDb().collection('projects').get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjectDoc))
}

export async function getFailingProjects(): Promise<ProjectDoc[]> {
  const snap = await adminDb()
    .collection('projects')
    .where('enabled', '==', true)
    .where('lastStatus', 'in', ['failed', 'paused'] as HealthStatus[])
    .get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjectDoc))
}

/** เขียนผลเช็คทุกโปรเจคเป็น batch: อัปเดต summary บน project doc + เพิ่ม check history record */
export async function saveResults(results: CheckResult[]): Promise<void> {
  const db = adminDb()
  const batch = db.batch()

  for (const r of results) {
    const projectRef = db.collection('projects').doc(r.projectId)
    const checkRef = projectRef.collection('checks').doc()

    batch.set(
      projectRef,
      {
        lastStatus: r.status,
        setupStatus: r.setupStatus,
        lastCheckedAt: r.checkedAt,
        lastLatencyMs: r.latencyMs,
        pingCount: r.pingCount ?? FieldValue.increment(0),
        lastError: r.healthy
          ? FieldValue.delete()
          : { stage: r.stage ?? null, code: r.errorCode ?? null, message: r.errorMessage ?? null, at: r.checkedAt },
        consecutiveFails: r.healthy ? 0 : FieldValue.increment(1),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    )

    batch.set(checkRef, r)
  }

  await batch.commit()
}

export async function saveRun(run: {
  startedAt: string
  finishedAt: string
  mode: 'scheduled' | 'manual' | 'telegram'
  triggeredBy?: string
  scope: string
  results: CheckResult[]
  networkSuspect: boolean
  telegramSent: boolean
}) {
  const db = adminDb()
  const countBy = (s: HealthStatus) => run.results.filter((r) => r.status === s).length
  await db.collection('runs').add({
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    mode: run.mode,
    triggeredBy: run.triggeredBy ?? null,
    scope: run.scope,
    total: run.results.length,
    healthy: countBy('healthy'),
    slow: countBy('slow'),
    failed: countBy('failed'),
    paused: countBy('paused'),
    networkSuspect: run.networkSuspect,
    telegramSent: run.telegramSent,
  })
}

/**
 * Distributed lease สำหรับ cron — ป้องกัน cron-job.org + GitHub Actions ชนกัน
 * คืน true หากได้ lease (ควรดำเนินการต่อ), false หากมีการรันล่าสุดภายใน windowMs
 * fail-open: หาก Firestore transaction ล้มเหลว ให้ดำเนินการต่อเพื่อป้องกัน health check หายไป
 */
export async function acquireCronLease(windowMs = 5 * 60 * 1000): Promise<boolean> {
  const db = adminDb()
  const leaseRef = db.collection('_system').doc('cron_lease')

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(leaseRef)
      if (snap.exists) {
        const acquiredAt = snap.data()?.acquiredAt
        if (acquiredAt) {
          const ms: number = typeof acquiredAt.toMillis === 'function'
            ? acquiredAt.toMillis()
            : Number(acquiredAt)
          if (Date.now() - ms < windowMs) return false
        }
      }
      tx.set(leaseRef, { acquiredAt: FieldValue.serverTimestamp() })
      return true
    })
  } catch {
    return true
  }
}

export function withDerived(input: { supabaseUrl: string; anonKey: string; [k: string]: any }) {
  const derived = deriveFromSupabaseUrl(input.supabaseUrl)
  return { ...input, ...derived }
}
