import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../lib/useAuth'
import { deriveFromSupabaseUrl, deriveGithubUrl, deriveCloneCommand } from '../../shared/derive'
import { getSetupSQL, SETUP_SQL } from '../lib/sqlSeed'
import type { Environment, HostingInfo } from '../../shared/types'

type TestOutcome = {
  ok: boolean
  setupStatus?: string
  latencyMs?: number
  error?: string
}

const HOSTING_PROVIDERS = [
  { value: '', label: 'ไม่ระบุ' },
  { value: 'cloudflare', label: 'Cloudflare Pages' },
  { value: 'vercel', label: 'Vercel' },
]

export default function AddProject() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'single' | 'bulk'>('single')

  // required
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')

  // optional registry info
  const [showExtra, setShowExtra] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [environment, setEnvironment] = useState<Environment>('production')
  const [productionUrl, setProductionUrl] = useState('')
  const [githubRepo, setGithubRepo] = useState('')
  const [githubRepoId, setGithubRepoId] = useState('')
  const [githubDefaultBranch, setGithubDefaultBranch] = useState('')
  const [hostingProvider, setHostingProvider] = useState('')
  const [cfAccountId, setCfAccountId] = useState('')
  const [cfProjectId, setCfProjectId] = useState('')
  const [cfPagesUrl, setCfPagesUrl] = useState('')
  const [vercelTeamId, setVercelTeamId] = useState('')
  const [vercelProjectId, setVercelProjectId] = useState('')
  const [notes, setNotes] = useState('')

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestOutcome | null>(null)
  const [saving, setSaving] = useState(false)
  const [showSql, setShowSql] = useState(false)

  const [bulkText, setBulkText] = useState('')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [bulkLog, setBulkLog] = useState<string[]>([])

  function buildHostingInfo(): HostingInfo | undefined {
    if (hostingProvider === 'cloudflare') {
      if (!cfAccountId || !cfProjectId) return undefined
      return {
        provider: 'cloudflare',
        accountId: cfAccountId,
        projectId: cfProjectId,
        pagesUrl: cfPagesUrl || undefined,
      }
    }
    if (hostingProvider === 'vercel') {
      if (!vercelProjectId) return undefined
      return {
        provider: 'vercel',
        projectId: vercelProjectId,
        teamId: vercelTeamId || undefined,
      }
    }
    return undefined
  }

  async function testConnection() {
    if (!user) return
    setTesting(true)
    setTestResult(null)
    try {
      const token = await user.getIdToken()
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ supabaseUrl, anonKey }),
      })
      const data = await res.json()
      if (!res.ok) {
        setTestResult({ ok: false, error: data.error || 'ทดสอบไม่สำเร็จ' })
        return
      }
      const r = data.result
      setTestResult({
        ok: r.setupStatus === 'complete',
        setupStatus: r.setupStatus,
        latencyMs: r.latencyMs,
        error: r.healthy ? undefined : `${r.stage ?? ''} ${r.errorMessage ?? ''}`.trim(),
      })
      if (r.setupStatus !== 'complete') setShowSql(true)
    } catch (e: any) {
      setTestResult({ ok: false, error: String(e) })
    } finally {
      setTesting(false)
    }
  }

  async function saveProject() {
    setSaving(true)
    try {
      const derived = deriveFromSupabaseUrl(supabaseUrl)
      const ref = doc(db, 'projects', derived.supabaseRef)
      const hosting = buildHostingInfo()

      // Firestore rejects undefined — build object with only defined fields
      const data: Record<string, unknown> = {
        supabaseUrl,
        anonKey,
        environment,
        supabaseProjectId: derived.supabaseRef,
        enabled: true,
        ...derived,
        lastStatus: 'unknown',
        setupStatus: testResult?.setupStatus ?? 'unknown',
        consecutiveFails: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
      if (displayName) data.displayName = displayName
      if (productionUrl) data.productionUrl = productionUrl
      if (githubRepo) {
        data.githubRepo = githubRepo
        data.githubUrl = deriveGithubUrl(githubRepo)
      }
      if (githubRepoId) data.githubRepoId = Number(githubRepoId)
      if (githubDefaultBranch) data.githubDefaultBranch = githubDefaultBranch
      if (hosting) data.hosting = hosting
      if (notes) data.notes = notes

      await setDoc(ref, data)
      navigate(`/p/${derived.supabaseRef}`)
    } finally {
      setSaving(false)
    }
  }

  async function saveBulk() {
    setBulkBusy(true)
    setBulkLog([])
    const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean)
    for (const line of lines) {
      const [url, key] = line.split(',').map((s) => s.trim())
      if (!url || !key) {
        setBulkLog((log) => [...log, `✗ ข้ามบรรทัด (รูปแบบไม่ถูก): ${line.slice(0, 40)}`])
        continue
      }
      try {
        const derived = deriveFromSupabaseUrl(url)
        await setDoc(doc(db, 'projects', derived.supabaseRef), {
          supabaseUrl: url,
          anonKey: key,
          environment: 'production',
          enabled: true,
          ...derived,
          lastStatus: 'unknown',
          setupStatus: 'unknown',
          consecutiveFails: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        })
        setBulkLog((log) => [...log, `✓ เพิ่ม ${derived.supabaseRef} แล้ว`])
      } catch (e: any) {
        setBulkLog((log) => [...log, `✗ ${line.slice(0, 40)} — ${e.message}`])
      }
    }
    setBulkBusy(false)
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-base-800 px-6 py-4">
        <div className="mx-auto max-w-2xl">
          <Link to="/" className="text-sm text-base-500 hover:text-base-300">
            ← กลับ Dashboard
          </Link>
          <h1 className="mt-2 text-lg font-semibold text-base-300">เพิ่มโปรเจค</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-6">
        <div className="flex gap-2">
          <button
            onClick={() => setMode('single')}
            className={`focus-ring rounded-lg px-3 py-1.5 text-sm ${mode === 'single' ? 'bg-accent text-white' : 'border border-base-700 text-base-400'}`}
          >
            เพิ่มทีละโปรเจค
          </button>
          <button
            onClick={() => setMode('bulk')}
            className={`focus-ring rounded-lg px-3 py-1.5 text-sm ${mode === 'bulk' ? 'bg-accent text-white' : 'border border-base-700 text-base-400'}`}
          >
            เพิ่มหลายโปรเจคพร้อมกัน
          </button>
        </div>

        {mode === 'single' && (
          <div className="mt-6 space-y-4 rounded-xl border border-base-800 bg-base-900/50 p-5">
            {/* Required fields */}
            <div>
              <label className="text-xs font-medium text-base-500">Supabase URL</label>
              <input
                value={supabaseUrl}
                onChange={(e) => { setSupabaseUrl(e.target.value); setTestResult(null) }}
                placeholder="https://xxxx.supabase.co"
                className="focus-ring mono mt-1 w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-base-300"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-base-500">Anon Key</label>
              <input
                value={anonKey}
                onChange={(e) => { setAnonKey(e.target.value); setTestResult(null) }}
                placeholder="eyJhbGciOi..."
                className="focus-ring mono mt-1 w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-base-300"
              />
            </div>

            {/* Optional registry metadata */}
            <button
              type="button"
              onClick={() => setShowExtra((v) => !v)}
              className="flex w-full items-center justify-between text-xs text-base-500 hover:text-base-300"
            >
              <span>ข้อมูลเพิ่มเติม (optional)</span>
              <span>{showExtra ? '▲' : '▼'}</span>
            </button>

            {showExtra && (
              <div className="space-y-3 rounded-lg border border-base-800 bg-base-950/50 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-base-500">ชื่อโปรเจค</label>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="My App"
                      className="focus-ring mt-1 w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-base-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-base-500">Environment</label>
                    <select
                      value={environment}
                      onChange={(e) => setEnvironment(e.target.value as Environment)}
                      className="focus-ring mt-1 w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-base-300"
                    >
                      <option value="production">Production</option>
                      <option value="staging">Staging</option>
                      <option value="development">Development</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-base-500">Production URL</label>
                  <input
                    value={productionUrl}
                    onChange={(e) => setProductionUrl(e.target.value)}
                    placeholder="https://myapp.com"
                    className="focus-ring mono mt-1 w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-base-300"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-base-500">GitHub Repo</label>
                    <input
                      value={githubRepo}
                      onChange={(e) => setGithubRepo(e.target.value)}
                      placeholder="org/repo-name"
                      className="focus-ring mono mt-1 w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-base-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-base-500">GitHub Repo ID</label>
                    <input
                      value={githubRepoId}
                      onChange={(e) => setGithubRepoId(e.target.value)}
                      placeholder="123456789"
                      type="number"
                      className="focus-ring mono mt-1 w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-base-300"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-base-500">Default Branch</label>
                    <input
                      value={githubDefaultBranch}
                      onChange={(e) => setGithubDefaultBranch(e.target.value)}
                      placeholder="main"
                      className="focus-ring mono mt-1 w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-base-300"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-base-500">Hosting</label>
                  <select
                    value={hostingProvider}
                    onChange={(e) => setHostingProvider(e.target.value)}
                    className="focus-ring mt-1 w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-base-300"
                  >
                    {HOSTING_PROVIDERS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                {hostingProvider === 'cloudflare' && (
                  <div className="space-y-3 rounded-lg border border-base-700/50 p-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-base-500">CF Account ID</label>
                        <input
                          value={cfAccountId}
                          onChange={(e) => setCfAccountId(e.target.value)}
                          placeholder="a1b2c3d4e5f6..."
                          className="focus-ring mono mt-1 w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-base-300"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-base-500">CF Project Name</label>
                        <input
                          value={cfProjectId}
                          onChange={(e) => setCfProjectId(e.target.value)}
                          placeholder="my-app"
                          className="focus-ring mono mt-1 w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-base-300"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-base-500">Pages URL</label>
                      <input
                        value={cfPagesUrl}
                        onChange={(e) => setCfPagesUrl(e.target.value)}
                        placeholder="my-app.pages.dev"
                        className="focus-ring mono mt-1 w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-base-300"
                      />
                    </div>
                  </div>
                )}

                {hostingProvider === 'vercel' && (
                  <div className="grid grid-cols-2 gap-3 rounded-lg border border-base-700/50 p-3">
                    <div>
                      <label className="text-xs font-medium text-base-500">Vercel Team ID</label>
                      <input
                        value={vercelTeamId}
                        onChange={(e) => setVercelTeamId(e.target.value)}
                        placeholder="team_abc123"
                        className="focus-ring mono mt-1 w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-base-300"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-base-500">Vercel Project ID</label>
                      <input
                        value={vercelProjectId}
                        onChange={(e) => setVercelProjectId(e.target.value)}
                        placeholder="prj_abc123"
                        className="focus-ring mono mt-1 w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-base-300"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-base-500">หมายเหตุ</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="focus-ring mt-1 w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-base-300"
                  />
                </div>
              </div>
            )}

            <button
              onClick={testConnection}
              disabled={!supabaseUrl || !anonKey || testing}
              className="focus-ring w-full rounded-lg border border-base-700 px-4 py-2.5 text-sm font-medium text-base-300 transition hover:border-accent disabled:opacity-40"
            >
              {testing ? 'กำลังทดสอบ…' : 'ทดสอบการเชื่อมต่อ'}
            </button>

            {testResult && (
              <div
                className={`rounded-lg border p-3 text-sm ${
                  testResult.ok
                    ? 'border-signal-healthy/40 bg-signal-healthy/10 text-signal-healthy'
                    : 'border-signal-failed/40 bg-signal-failed/10 text-signal-failed'
                }`}
              >
                {testResult.ok ? (
                  <>✅ เชื่อมต่อสำเร็จ — latency {testResult.latencyMs} ms</>
                ) : (
                  <>
                    ⚠ {testResult.error || `Setup ไม่ครบ (${testResult.setupStatus})`}
                    <button onClick={() => setShowSql(true)} className="ml-2 underline">
                      ดู SQL ที่ต้องติดตั้ง
                    </button>
                  </>
                )}
              </div>
            )}

            {showSql && (() => {
              let filledSql = SETUP_SQL
              try {
                const ref = deriveFromSupabaseUrl(supabaseUrl).supabaseRef
                filledSql = getSetupSQL(ref, displayName || undefined)
              } catch {}
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-base-500">รัน SQL นี้ใน Supabase SQL Editor</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(filledSql)}
                      className="focus-ring text-xs text-accent hover:underline"
                    >
                      คัดลอก
                    </button>
                  </div>
                  <pre className="mono max-h-64 overflow-auto rounded-lg border border-base-700 bg-base-950 p-3 text-[11px] leading-relaxed text-base-400">
                    {filledSql}
                  </pre>
                </div>
              )
            })()}

            <button
              onClick={saveProject}
              disabled={!supabaseUrl || !anonKey || saving}
              className="focus-ring w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {saving ? 'กำลังบันทึก…' : 'บันทึกโปรเจค'}
            </button>
          </div>
        )}

        {mode === 'bulk' && (
          <div className="mt-6 space-y-4 rounded-xl border border-base-800 bg-base-900/50 p-5">
            <div>
              <label className="text-xs font-medium text-base-500">
                วางทีละบรรทัด: <span className="mono">supabaseUrl, anonKey</span>
              </label>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={8}
                placeholder="https://aaa.supabase.co, eyJhbGci...&#10;https://bbb.supabase.co, eyJhbGci..."
                className="focus-ring mono mt-1 w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-xs text-base-300"
              />
            </div>
            <button
              onClick={saveBulk}
              disabled={!bulkText.trim() || bulkBusy}
              className="focus-ring w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {bulkBusy ? 'กำลังเพิ่ม…' : 'เพิ่มทั้งหมด'}
            </button>
            {bulkLog.length > 0 && (
              <div className="mono max-h-48 overflow-auto rounded-lg border border-base-700 bg-base-950 p-3 text-xs text-base-400">
                {bulkLog.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            )}
            {bulkLog.length > 0 && !bulkBusy && (
              <Link to="/" className="block text-center text-sm text-accent hover:underline">
                กลับ Dashboard
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
