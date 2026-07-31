import { createClient } from '@supabase/supabase-js'
import type { CheckResult, HealthStatus, SetupStatus } from './types.js'

const DEFAULT_TIMEOUT_MS = 15_000
const SLOW_THRESHOLD_MS = 3_000

interface StepOutcome {
  ok: boolean
  data?: any
  error?: { code?: string; message?: string; status?: number }
}

const AUTH_CODES = new Set(['42501', 'PGRST301'])
const NOT_FOUND_CODES = new Set(['42P01', 'PGRST205', 'PGRST202'])

function normErr(e: any): StepOutcome['error'] {
  if (!e) return undefined
  return {
    code: (e.code ?? e.name ?? '').toString().toUpperCase(),
    message: e.message ?? String(e),
    status: e.status,
  }
}

/**
 * เรียก health_ping() เพียงครั้งเดียว — function นั้นทำ read + write + คืน seed_ok ในคำสั่งเดียว
 * หากเกิด network/timeout ให้หยุดทันที ไม่ส่ง request เพิ่ม
 * หาก RPC ยังไม่ติดตั้ง จะทำ read 1 ครั้งเพื่อแยก missing_rpc กับ missing_all
 */
export async function runHealthCheck(
  project: { id: string; supabaseUrl: string; anonKey: string },
  opts: { timeoutMs?: number; slowThresholdMs?: number } = {}
): Promise<CheckResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const slowThresholdMs = opts.slowThresholdMs ?? SLOW_THRESHOLD_MS
  const checkedAt = new Date().toISOString()
  const startedAt = performance.now()

  function done(
    step: StepOutcome,
    rpcData: any,
    stage?: CheckResult['stage']
  ): CheckResult {
    const latencyMs = Math.round(performance.now() - startedAt)

    if (!step.ok) {
      return {
        projectId: project.id,
        status: classifyStatus(step.error),
        setupStatus: classifySetup(step.error),
        healthy: false,
        latencyMs,
        stage,
        errorCode: step.error?.code,
        errorMessage: step.error?.message,
        checkedAt,
      }
    }

    const seedOk = rpcData?.seed_ok !== false
    const setupStatus: SetupStatus = seedOk ? 'complete' : 'missing_seed'
    const status: HealthStatus =
      setupStatus !== 'complete' ? 'failed' : latencyMs > slowThresholdMs ? 'slow' : 'healthy'

    return {
      projectId: project.id,
      status,
      setupStatus,
      healthy: status === 'healthy' || status === 'slow',
      latencyMs,
      pingCount: rpcData?.count,
      checkedAt,
    }
  }

  let supabase
  try {
    supabase = createClient(project.supabaseUrl, project.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  } catch (e: any) {
    return done({ ok: false, error: normErr(e) }, undefined, 'connect')
  }

  const signal = () => AbortSignal.timeout(timeoutMs)

  const rpc = await supabase
    .rpc('health_ping')
    .abortSignal(signal())
    .then(
      (r) => ({ ok: !r.error, data: r.data, error: normErr(r.error) } as StepOutcome),
      (e) => ({ ok: false, error: normErr(e) } as StepOutcome)
    )

  if (rpc.ok) return done(rpc, rpc.data)

  const code = rpc.error?.code ?? ''

  // network/timeout: หยุดทันที ไม่รอ request ถัดไป
  if (code === 'ENOTFOUND' || code === 'ABORTERROR' || code === 'TIMEOUTERROR') {
    return done(rpc, undefined, 'write')
  }

  // RPC ยังไม่ติดตั้ง: อ่าน seed 1 ครั้งเพื่อแยก missing_rpc กับ missing_all
  if (NOT_FOUND_CODES.has(code)) {
    const seed = await supabase
      .from('system_health_seed')
      .select('id')
      .limit(1)
      .abortSignal(signal())
      .then(
        (r) => ({ ok: !r.error, data: r.data, error: normErr(r.error) } as StepOutcome),
        (e) => ({ ok: false, error: normErr(e) } as StepOutcome)
      )
    const seedMissing = !seed.ok && NOT_FOUND_CODES.has(seed.error?.code ?? '')
    return {
      projectId: project.id,
      status: 'failed',
      setupStatus: seedMissing ? 'missing_all' : 'missing_rpc',
      healthy: false,
      latencyMs: Math.round(performance.now() - startedAt),
      stage: 'write',
      errorCode: rpc.error?.code,
      errorMessage: rpc.error?.message,
      checkedAt,
    }
  }

  return done(rpc, undefined, 'write')
}

function classifyStatus(error?: StepOutcome['error']): HealthStatus {
  if (!error) return 'failed'
  const code = error.code ?? ''
  const msg = (error.message ?? '').toLowerCase()
  if (
    code === '540' ||
    error.status === 540 ||
    msg.includes('paused') ||
    code === 'ENOTFOUND'
  ) {
    return 'paused'
  }
  return 'failed'
}

function classifySetup(error?: StepOutcome['error']): SetupStatus {
  if (!error) return 'unknown'
  const code = error.code ?? ''
  if (AUTH_CODES.has(code) || error.status === 401 || error.status === 403) {
    return 'permission_error'
  }
  if (NOT_FOUND_CODES.has(code)) return 'missing_rpc'
  return 'unknown'
}
