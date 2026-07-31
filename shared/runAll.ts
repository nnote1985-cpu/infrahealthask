import { runHealthCheck } from './healthCheck.js'
import type { CheckResult } from './types.js'

export interface RunTarget {
  id: string
  supabaseUrl: string
  anonKey: string
}

export interface RunAllOptions {
  concurrency?: number
  timeoutMs?: number
  slowThresholdMs?: number
}

export interface RunAllOutcome {
  results: CheckResult[]
  networkSuspect: boolean
}

/** รันเช็คหลายโปรเจคเป็น batch กันแย่ง network ทำให้ latency เพี้ยน */
export async function runAllHealthChecks(
  targets: RunTarget[],
  opts: RunAllOptions = {}
): Promise<RunAllOutcome> {
  const concurrency = opts.concurrency ?? 5
  const results: CheckResult[] = []

  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      batch.map((t) =>
        runHealthCheck(t, { timeoutMs: opts.timeoutMs, slowThresholdMs: opts.slowThresholdMs })
      )
    )

    settled.forEach((s, idx) => {
      const target = batch[idx]
      if (s.status === 'fulfilled') {
        results.push(s.value)
      } else {
        results.push({
          projectId: target.id,
          status: 'failed',
          setupStatus: 'unknown',
          healthy: false,
          latencyMs: 0,
          errorCode: 'THREW',
          errorMessage: String(s.reason),
          checkedAt: new Date().toISOString(),
        })
      }
    })
  }

  // ถ้าพังเกิน 80% (อย่างน้อย 3 โปรเจค) น่าจะเป็นเน็ตฝั่ง cron เอง ไม่ใช่โปรเจคโดน pause พร้อมกัน
  const badCount = results.filter((r) => !r.healthy).length
  const networkSuspect = targets.length >= 3 && badCount / targets.length > 0.8

  return { results, networkSuspect }
}
