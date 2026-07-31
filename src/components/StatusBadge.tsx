import type { HealthStatus, SetupStatus } from '../types'

const STATUS_LABEL: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  slow: 'Slow',
  failed: 'Failed',
  paused: 'Paused',
  unknown: 'Unknown',
}

const STATUS_DOT: Record<HealthStatus, string> = {
  healthy: 'bg-signal-healthy',
  slow: 'bg-signal-slow',
  failed: 'bg-signal-failed',
  paused: 'bg-signal-paused',
  unknown: 'bg-signal-unknown',
}

export function StatusBadge({ status }: { status: HealthStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-base-700 bg-base-900 px-2.5 py-1 text-xs font-medium">
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  )
}

const SETUP_LABEL: Record<SetupStatus, string> = {
  complete: 'Setup OK',
  missing_rpc: 'Missing RPC',
  missing_seed: 'Missing seed',
  missing_all: 'SQL not installed',
  permission_error: 'Permission error',
  unknown: 'Setup unknown',
}

export function SetupBadge({ status }: { status: SetupStatus }) {
  if (status === 'complete') return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-signal-slow/40 bg-signal-slow/10 px-2 py-0.5 text-[11px] font-medium text-signal-slow">
      ⚠ {SETUP_LABEL[status]}
    </span>
  )
}
