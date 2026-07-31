import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyOwner } from './_lib/verifyCron'
import { getAllProjects, getFailingProjects, saveResults, saveRun } from './_lib/projectsRepo'
import { runAllHealthChecks } from '../shared/runAll'

export const config = { maxDuration: 60 }

/** scope: 'all' | 'failed' | 'project:{id}' */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  const auth = await verifyOwner(req)
  if (!auth.ok) return res.status(401).json({ error: auth.error })

  const scope = (req.body?.scope as string) || 'all'
  const startedAt = new Date().toISOString()

  let projects = await getAllProjects()
  projects = projects.filter((p) => p.enabled)

  if (scope === 'failed') {
    projects = await getFailingProjects()
  } else if (scope.startsWith('project:')) {
    const id = scope.split(':')[1]
    projects = projects.filter((p) => p.id === id)
  }

  const targets = projects.map((p) => ({ id: p.id, supabaseUrl: p.supabaseUrl, anonKey: p.anonKey }))
  const { results, networkSuspect } = await runAllHealthChecks(targets, { concurrency: 5 })

  await saveResults(results)
  await saveRun({
    startedAt,
    finishedAt: new Date().toISOString(),
    mode: 'manual',
    scope,
    results,
    networkSuspect,
    telegramSent: false,
  })

  return res.status(200).json({ ok: true, results })
}
