import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProjects } from '../lib/useProjects'
import { useAuth } from '../lib/useAuth'
import { StatusBadge, SetupBadge } from '../components/StatusBadge'
import { timeAgo } from '../lib/format'
import type { HealthStatus, Environment } from '../types'

const SUMMARY_ORDER: HealthStatus[] = ['healthy', 'slow', 'failed', 'paused']

export default function Dashboard() {
  const { projects, loading } = useProjects()
  const { user, signOutUser } = useAuth()
  const [envFilter, setEnvFilter] = useState<Environment | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<HealthStatus | 'all'>('all')
  const [running, setRunning] = useState<'all' | 'failed' | null>(null)

  const summary = useMemo(() => {
    const counts: Record<HealthStatus, number> = { healthy: 0, slow: 0, failed: 0, paused: 0, unknown: 0 }
    for (const p of projects) counts[p.lastStatus ?? 'unknown']++
    return counts
  }, [projects])

  const filtered = useMemo(() => {
    return projects
      .filter((p) => envFilter === 'all' || p.environment === envFilter)
      .filter((p) => statusFilter === 'all' || p.lastStatus === statusFilter)
      .sort((a, b) => severity(a.lastStatus) - severity(b.lastStatus))
  }, [projects, envFilter, statusFilter])

  async function runCheck(scope: 'all' | 'failed') {
    if (!user) return
    setRunning(scope)
    try {
      const token = await user.getIdToken()
      await fetch('/api/run-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ scope }),
      })
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-base-800 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <div className="mono text-[11px] uppercase tracking-widest text-accent">Infra Registry</div>
            <h1 className="text-lg font-semibold text-base-300">Health Monitor</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/add"
              className="focus-ring rounded-lg border border-base-700 bg-base-900 px-3 py-1.5 text-sm text-base-300 transition hover:border-accent"
            >
              + เพิ่มโปรเจค
            </Link>
            <button
              onClick={() => signOutUser()}
              className="focus-ring text-sm text-base-500 hover:text-base-300"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SUMMARY_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
              className={`focus-ring rounded-xl border p-4 text-left transition ${
                statusFilter === s ? 'border-accent bg-base-900' : 'border-base-800 bg-base-900/50 hover:border-base-700'
              }`}
            >
              <div className="text-2xl font-semibold text-base-300">{summary[s]}</div>
              <div className="mt-1 text-xs text-base-500 capitalize">{s}</div>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            onClick={() => runCheck('all')}
            disabled={running !== null}
            className="focus-ring rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {running === 'all' ? 'กำลังตรวจ…' : '🔄 ตรวจทั้งหมดตอนนี้'}
          </button>
          <button
            onClick={() => runCheck('failed')}
            disabled={running !== null}
            className="focus-ring rounded-lg border border-base-700 px-4 py-2 text-sm text-base-300 transition hover:border-accent disabled:opacity-50"
          >
            {running === 'failed' ? 'กำลังตรวจ…' : '⚠ ตรวจเฉพาะที่มีปัญหา'}
          </button>

          <div className="ml-auto flex items-center gap-2">
            <select
              value={envFilter}
              onChange={(e) => setEnvFilter(e.target.value as Environment | 'all')}
              className="focus-ring rounded-lg border border-base-700 bg-base-900 px-3 py-2 text-sm text-base-300"
            >
              <option value="all">ทุก environment</option>
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="mt-4 overflow-hidden rounded-xl border border-base-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-base-800 bg-base-900/70 text-left text-xs uppercase tracking-wide text-base-500">
                <th className="px-4 py-3 font-medium">โปรเจค</th>
                <th className="px-4 py-3 font-medium">Env</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3 font-medium">Latency</th>
                <th className="px-4 py-3 font-medium">เช็คล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-base-500">
                    กำลังโหลด…
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-base-500">
                    ยังไม่มีโปรเจคในระบบ —{' '}
                    <Link to="/add" className="text-accent hover:underline">
                      เพิ่มโปรเจคแรก
                    </Link>
                  </td>
                </tr>
              )}
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-base-800 last:border-0 hover:bg-base-900/40">
                  <td className="px-4 py-3">
                    <Link to={`/p/${p.id}`} className="font-medium text-base-300 hover:text-accent">
                      {p.displayName || p.supabaseRef}
                    </Link>
                    {p.setupStatus !== 'complete' && (
                      <div className="mt-1">
                        <SetupBadge status={p.setupStatus} />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-base-500">{p.environment}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.lastStatus ?? 'unknown'} />
                  </td>
                  <td className="mono px-4 py-3 text-base-400">
                    {p.lastLatencyMs != null ? `${p.lastLatencyMs} ms` : '—'}
                  </td>
                  <td className="px-4 py-3 text-base-500">{timeAgo(p.lastCheckedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}

function severity(s: HealthStatus): number {
  const order: Record<HealthStatus, number> = { paused: 0, failed: 1, slow: 2, unknown: 3, healthy: 4 }
  return order[s] ?? 5
}
