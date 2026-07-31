import type { VercelRequest, VercelResponse } from '@vercel/node'
import { verifyCronSecret } from '../_lib/verifyCron'
import { acquireCronLease, getEnabledProjects, saveResults, saveRun } from '../_lib/projectsRepo'
import { runAllHealthChecks } from '../../shared/runAll'
import { buildReportText, reportKeyboard, sendTelegramMessage } from '../../shared/telegram'

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  if (!verifyCronSecret(req)) return res.status(401).json({ error: 'unauthorized' })

  // ป้องกัน cron-job.org กับ GitHub Actions รันซ้อนกัน
  const leaseOk = await acquireCronLease()
  if (!leaseOk) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'duplicate run within 5 min window' })
  }

  const mode = (req.query.mode as string) === 'daily' ? 'daily' : 'silent'
  const startedAt = new Date().toISOString()

  const projects = await getEnabledProjects()
  const targets = projects.map((p) => ({ id: p.id, supabaseUrl: p.supabaseUrl, anonKey: p.anonKey }))

  const { results, networkSuspect } = await runAllHealthChecks(targets, {
    concurrency: 5,
    timeoutMs: 15_000,
    slowThresholdMs: 3_000,
  })

  await saveResults(results)

  const hasIssue = results.some((r) => r.status !== 'healthy')
  let telegramSent = false

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (botToken && chatId && (mode === 'daily' || hasIssue)) {
    const text = buildReportText(results, projects, {
      timeLabel: new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }),
      networkSuspect,
    })
    telegramSent = await sendTelegramMessage({
      botToken,
      chatId,
      text,
      urgent: hasIssue,
      keyboard: reportKeyboard(),
    })
  }

  const finishedAt = new Date().toISOString()
  await saveRun({
    startedAt,
    finishedAt,
    mode: 'scheduled',
    scope: 'all',
    results,
    networkSuspect,
    telegramSent,
  })

  return res.status(200).json({
    ok: true,
    total: results.length,
    healthy: results.filter((r) => r.status === 'healthy').length,
    slow: results.filter((r) => r.status === 'slow').length,
    failed: results.filter((r) => r.status === 'failed').length,
    paused: results.filter((r) => r.status === 'paused').length,
    networkSuspect,
    telegramSent,
  })
}
