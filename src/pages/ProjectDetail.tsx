import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { doc, onSnapshot, collection, query, orderBy, limit, updateDoc, serverTimestamp } from 'firebase/firestore'
import { createClient } from '@supabase/supabase-js'
import { db } from '../lib/firebase'
import { StatusBadge, SetupBadge } from '../components/StatusBadge'
import { timeAgo } from '../lib/format'
import { deriveGithubUrl } from '../../shared/derive'
import type { CheckResult, ProjectDoc, ProjectAccounts } from '../types'

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const [project, setProject] = useState<ProjectDoc | null>(null)
  const [checks, setChecks] = useState<CheckResult[]>([])
  const [editing, setEditing] = useState(false)
  const [pinging, setPinging] = useState(false)
  const [pingResult, setPingResult] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    if (!id) return
    const unsub = onSnapshot(doc(db, 'projects', id), (snap) => {
      if (snap.exists()) setProject({ id: snap.id, ...snap.data() } as ProjectDoc)
    })
    return unsub
  }, [id])

  useEffect(() => {
    if (!id) return
    const q = query(collection(db, 'projects', id, 'checks'), orderBy('checkedAt', 'desc'), limit(20))
    const unsub = onSnapshot(q, (snap) => {
      setChecks(snap.docs.map((d) => d.data() as CheckResult))
    })
    return unsub
  }, [id])

  async function ping() {
    if (!project) return
    setPinging(true)
    setPingResult(null)
    try {
      const t0 = Date.now()
      const sb = createClient(project.supabaseUrl, project.anonKey)
      const { data, error } = await sb.rpc('health_ping')
      const ms = Date.now() - t0
      const ref = doc(db, 'projects', project.id)
      if (error) {
        const isNotFound = error.code === 'PGRST202' || error.message?.includes('health_ping')
        await updateDoc(ref, {
          lastStatus: 'failed',
          setupStatus: isNotFound ? 'missing_rpc' : 'unknown',
          lastCheckedAt: new Date().toISOString(),
          lastLatencyMs: ms,
          consecutiveFails: (project.consecutiveFails ?? 0) + 1,
          lastError: { code: error.code, message: error.message },
          updatedAt: serverTimestamp(),
        })
        setPingResult({ ok: false, msg: `${error.code}: ${error.message}` })
      } else {
        const d = data as any
        await updateDoc(ref, {
          lastStatus: 'healthy',
          setupStatus: 'complete',
          lastCheckedAt: new Date().toISOString(),
          lastLatencyMs: ms,
          pingCount: d?.count ?? 0,
          consecutiveFails: 0,
          lastError: null,
          updatedAt: serverTimestamp(),
        })
        setPingResult({ ok: true, msg: `Healthy — ${ms} ms · ping count: ${d?.count ?? '?'}` })
      }
    } catch (e: any) {
      setPingResult({ ok: false, msg: String(e) })
    } finally {
      setPinging(false)
    }
  }

  if (!project) {
    return <div className="p-6 text-base-500">กำลังโหลด…</div>
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-base-800 px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <Link to="/" className="text-sm text-base-500 hover:text-base-300">
            ← กลับ Dashboard
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-lg font-semibold text-base-300">{project.displayName || project.supabaseRef}</h1>
            <StatusBadge status={project.lastStatus ?? 'unknown'} />
            <SetupBadge status={project.setupStatus} />
            <button
              onClick={() => setEditing((v) => !v)}
              className="ml-auto rounded-lg border border-base-700 px-3 py-1 text-xs text-base-400 hover:border-accent hover:text-accent"
            >
              {editing ? 'ยกเลิก' : 'แก้ไข'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-6">
        {editing && <EditForm project={project} onDone={() => setEditing(false)} />}

        <section className="rounded-xl border border-base-800 bg-base-900/50 p-5">
          <h2 className="text-sm font-medium text-base-400">Registry</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <Field label="Environment" value={project.environment} />
            <Field label="Ping count" value={project.pingCount?.toString() ?? '—'} />
            <Field label="Avg latency (ms)" value={project.lastLatencyMs?.toString() ?? '—'} />
            <Field label="Consecutive fails" value={project.consecutiveFails?.toString() ?? '0'} />
            <Field label="เช็คล่าสุด" value={timeAgo(project.lastCheckedAt)} />
            <Field label="Supabase ref" value={project.supabaseRef} mono />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <LinkChip href={project.dashboardUrl} label="Supabase Dashboard" />
            {project.githubUrl && <LinkChip href={project.githubUrl} label="GitHub" />}
            {project.productionUrl && <LinkChip href={project.productionUrl} label="Production" />}
            {project.meta?.docsUrl && <LinkChip href={project.meta.docsUrl} label="Docs" />}
            {project.meta?.figmaUrl && <LinkChip href={project.meta.figmaUrl} label="Figma" />}
          </div>
          {project.lastError?.message && (
            <div className="mt-4 rounded-lg border border-signal-failed/40 bg-signal-failed/10 p-3 text-xs text-signal-failed">
              {project.lastError.stage ? `[${project.lastError.stage}] ` : ''}
              {project.lastError.message}
            </div>
          )}
          <div className="mt-4 space-y-2">
            <button
              onClick={ping}
              disabled={pinging}
              className="focus-ring rounded-lg border border-base-700 px-4 py-2 text-sm text-base-300 transition hover:border-accent disabled:opacity-40"
            >
              {pinging ? 'กำลังทดสอบ…' : 'ทดสอบการเชื่อมต่อ'}
            </button>
            {pingResult && (
              <div className={`rounded-lg border p-3 text-xs ${pingResult.ok ? 'border-signal-healthy/40 bg-signal-healthy/10 text-signal-healthy' : 'border-signal-failed/40 bg-signal-failed/10 text-signal-failed'}`}>
                {pingResult.ok ? '✅ ' : '⚠ '}{pingResult.msg}
              </div>
            )}
          </div>
        </section>

        {project.accounts && Object.values(project.accounts).some(Boolean) && (
          <section className="rounded-xl border border-base-800 bg-base-900/50 p-5">
            <h2 className="text-sm font-medium text-base-400">บัญชีที่ผูกกับ project</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              {project.accounts.github && <Field label="GitHub (login ด้วย)" value={project.accounts.github} />}
              {project.accounts.supabase && <Field label="Supabase (login ด้วย)" value={project.accounts.supabase} />}
              {project.accounts.vercel && <Field label="Vercel (login ด้วย)" value={project.accounts.vercel} />}
              {project.accounts.cloudflare && <Field label="Cloudflare (login ด้วย)" value={project.accounts.cloudflare} />}
            </dl>
          </section>
        )}

        <section className="rounded-xl border border-base-800 bg-base-900/50 p-5">
          <h2 className="text-sm font-medium text-base-400">Check history (20 ครั้งล่าสุด)</h2>
          <div className="mt-3 space-y-1.5">
            {checks.length === 0 && <div className="text-sm text-base-500">ยังไม่มีประวัติ</div>}
            {checks.map((c, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-base-800 px-3 py-2 text-xs">
                <StatusBadge status={c.status} />
                <span className="mono text-base-500">{c.latencyMs} ms</span>
                <span className="text-base-500">{timeAgo(c.checkedAt)}</span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-base-500">{label}</dt>
      <dd className={`mt-0.5 text-base-300 ${mono ? 'mono' : ''}`}>{value}</dd>
    </div>
  )
}

function LinkChip({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="focus-ring rounded-full border border-base-700 px-3 py-1 text-xs text-base-400 transition hover:border-accent hover:text-accent"
    >
      {label} ↗
    </a>
  )
}

function EditForm({ project, onDone }: { project: ProjectDoc; onDone: () => void }) {
  const [displayName, setDisplayName] = useState(project.displayName ?? '')
  const [environment, setEnvironment] = useState(project.environment ?? 'production')
  const [productionUrl, setProductionUrl] = useState(project.productionUrl ?? '')
  const [githubRepo, setGithubRepo] = useState(project.githubRepo ?? '')
  const [githubDefaultBranch, setGithubDefaultBranch] = useState(project.githubDefaultBranch ?? '')
  const [anonKey, setAnonKey] = useState(project.anonKey ?? '')
  const [notes, setNotes] = useState(project.notes ?? '')
  const [accGithub, setAccGithub] = useState(project.accounts?.github ?? '')
  const [accSupabase, setAccSupabase] = useState(project.accounts?.supabase ?? '')
  const [accVercel, setAccVercel] = useState(project.accounts?.vercel ?? '')
  const [accCloudflare, setAccCloudflare] = useState(project.accounts?.cloudflare ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    setSaving(true)
    setError('')
    try {
      const ref = doc(db, 'projects', project.id)
      const accounts: ProjectAccounts = {}
      if (accGithub) accounts.github = accGithub
      if (accSupabase) accounts.supabase = accSupabase
      if (accVercel) accounts.vercel = accVercel
      if (accCloudflare) accounts.cloudflare = accCloudflare

      const data: Record<string, unknown> = {
        environment,
        anonKey,
        updatedAt: serverTimestamp(),
      }
      if (displayName) data.displayName = displayName
      if (productionUrl) data.productionUrl = productionUrl
      if (githubRepo) {
        data.githubRepo = githubRepo
        data.githubUrl = deriveGithubUrl(githubRepo)
      }
      if (githubDefaultBranch) data.githubDefaultBranch = githubDefaultBranch
      if (notes) data.notes = notes
      if (Object.keys(accounts).length > 0) data.accounts = accounts
      await updateDoc(ref, data)
      onDone()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const inp = 'focus-ring mt-1 w-full rounded-lg border border-base-700 bg-base-950 px-3 py-2 text-sm text-base-300'
  const lbl = 'text-xs font-medium text-base-500'

  return (
    <section className="rounded-xl border border-accent/30 bg-base-900/50 p-5">
      <h2 className="mb-4 text-sm font-medium text-base-400">แก้ไขข้อมูล</h2>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>ชื่อโปรเจค</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inp} />
          </div>
          <div>
            <label className={lbl}>Environment</label>
            <select value={environment} onChange={(e) => setEnvironment(e.target.value as any)} className={inp}>
              <option value="production">Production</option>
              <option value="staging">Staging</option>
              <option value="development">Development</option>
            </select>
          </div>
        </div>
        <div>
          <label className={lbl}>Anon Key</label>
          <input value={anonKey} onChange={(e) => setAnonKey(e.target.value)} className={`${inp} mono text-xs`} />
        </div>
        <div>
          <label className={lbl}>Production URL</label>
          <input value={productionUrl} onChange={(e) => setProductionUrl(e.target.value)} placeholder="https://myapp.com" className={`${inp} mono`} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>GitHub Repo</label>
            <input value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)} placeholder="org/repo-name" className={`${inp} mono`} />
          </div>
          <div>
            <label className={lbl}>Default Branch</label>
            <input value={githubDefaultBranch} onChange={(e) => setGithubDefaultBranch(e.target.value)} placeholder="main" className={`${inp} mono`} />
          </div>
        </div>
        <div className="border-t border-base-800 pt-3">
          <p className="mb-2 text-xs font-medium text-base-500">บัญชีที่ผูกกับ project (Gmail/email ที่ใช้ login)</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>GitHub</label>
              <input value={accGithub} onChange={(e) => setAccGithub(e.target.value)} placeholder="name@gmail.com" className={inp} />
            </div>
            <div>
              <label className={lbl}>Supabase</label>
              <input value={accSupabase} onChange={(e) => setAccSupabase(e.target.value)} placeholder="name@gmail.com" className={inp} />
            </div>
            <div>
              <label className={lbl}>Vercel</label>
              <input value={accVercel} onChange={(e) => setAccVercel(e.target.value)} placeholder="name@gmail.com" className={inp} />
            </div>
            <div>
              <label className={lbl}>Cloudflare</label>
              <input value={accCloudflare} onChange={(e) => setAccCloudflare(e.target.value)} placeholder="name@example.com" className={inp} />
            </div>
          </div>
        </div>

        <div>
          <label className={lbl}>หมายเหตุ</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inp} />
        </div>
        {error && <p className="text-xs text-signal-failed">{error}</p>}
        <button
          onClick={save}
          disabled={saving}
          className="focus-ring w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {saving ? 'กำลังบันทึก…' : 'บันทึก'}
        </button>
      </div>
    </section>
  )
}
