import type { CheckResult, ProjectDoc } from './types'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const ICON: Record<string, string> = {
  paused: '⏸',
  failed: '🔴',
  slow: '🟡',
  healthy: '🟢',
  unknown: '⚪',
}

function detail(r: CheckResult): string {
  if (r.setupStatus !== 'complete' && r.setupStatus !== 'unknown') {
    const map: Record<string, string> = {
      missing_rpc: 'Setup incomplete: missing RPC',
      missing_seed: 'Setup incomplete: missing seed table',
      missing_all: 'Setup incomplete: SQL not installed',
      permission_error: 'Permission error — check anon key / grants',
    }
    return map[r.setupStatus] ?? 'Setup incomplete'
  }
  if (r.status === 'slow') return `Latency: ${r.latencyMs.toLocaleString()} ms`
  if (r.status === 'paused') return `${r.errorCode ?? 'ERROR'} — Project paused`
  return `${r.stage ?? 'connect'} failed: ${r.errorMessage ?? 'unknown error'}`
}

export function buildReportText(
  results: CheckResult[],
  projects: ProjectDoc[],
  opts: { title?: string; timeLabel: string; networkSuspect?: boolean } = { timeLabel: '' }
): string {
  if (opts.networkSuspect) {
    return [
      `⚠️ <b>Network issue suspected</b>`,
      opts.timeLabel,
      ``,
      `${results.filter((r) => !r.healthy).length}/${results.length} โปรเจคตอบไม่ผ่านพร้อมกัน — น่าจะเป็นเน็ตฝั่ง monitor เอง ไม่ใช่โปรเจคโดน pause ยกแผง`,
      `จะลองใหม่รอบถัดไปอัตโนมัติ`,
    ].join('\n')
  }

  const by = (s: string) => results.filter((r) => r.status === s)
  const healthy = by('healthy')
  const slow = by('slow')
  const failed = by('failed')
  const paused = by('paused')

  const lines: string[] = [
    `🩺 <b>${opts.title ?? 'Supabase Health Report'}</b>`,
    opts.timeLabel,
    ``,
    `🟢 Healthy: ${healthy.length}`,
  ]
  if (slow.length) lines.push(`🟡 Slow: ${slow.length}`)
  if (failed.length) lines.push(`🔴 Failed: ${failed.length}`)
  if (paused.length) lines.push(`⏸ Paused: ${paused.length}`)

  const byId = new Map(projects.map((p) => [p.id, p]))
  for (const r of [...paused, ...failed, ...slow]) {
    const p = byId.get(r.projectId)
    const name = p?.displayName || p?.supabaseRef || r.projectId
    const link = p?.dashboardUrl
      ? `<a href="${p.dashboardUrl}">${esc(name)}</a>`
      : esc(name)
    lines.push(``, `${ICON[r.status]} <b>${link}</b>`, esc(detail(r)))
  }

  let text = lines.join('\n')
  if (text.length > 4000) {
    text = text.slice(0, 3900) + `\n\n…และรายการอื่นถูกตัดไว้ ดูทั้งหมดใน Dashboard`
  }
  return text
}

export function reportKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🔄 ตรวจทั้งหมด', callback_data: 'chk:all' },
        { text: '⚠️ ตรวจเฉพาะ Failed', callback_data: 'chk:failed' },
      ],
      [{ text: '📊 เปิด Dashboard', url: process.env.PUBLIC_APP_URL || 'https://example.com' }],
    ],
  }
}

export async function sendTelegramMessage(params: {
  botToken: string
  chatId: string
  text: string
  urgent?: boolean
  keyboard?: ReturnType<typeof reportKeyboard>
}) {
  const res = await fetch(`https://api.telegram.org/bot${params.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: params.chatId,
      text: params.text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      disable_notification: !params.urgent,
      reply_markup: params.keyboard,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error('telegram sendMessage failed', res.status, body)
  }
  return res.ok
}

export async function editTelegramMessage(params: {
  botToken: string
  chatId: string
  messageId: number
  text: string
  keyboard?: ReturnType<typeof reportKeyboard>
}) {
  const res = await fetch(`https://api.telegram.org/bot${params.botToken}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: params.chatId,
      message_id: params.messageId,
      text: params.text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
      reply_markup: params.keyboard,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  return res.ok
}

export async function answerCallbackQuery(params: {
  botToken: string
  callbackQueryId: string
  text?: string
}) {
  await fetch(`https://api.telegram.org/bot${params.botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: params.callbackQueryId,
      text: params.text,
    }),
    signal: AbortSignal.timeout(10_000),
  })
}
