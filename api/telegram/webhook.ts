import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  answerCallbackQuery,
  buildReportText,
  editTelegramMessage,
  reportKeyboard,
  sendTelegramMessage,
} from '../../shared/telegram.js'
import { getAllProjects, getFailingProjects, saveResults, saveRun } from '../_lib/projectsRepo.js'
import { runAllHealthChecks } from '../../shared/runAll.js'

const botToken = process.env.TELEGRAM_BOT_TOKEN!
const chatId = process.env.TELEGRAM_CHAT_ID!

async function runScope(scope: 'all' | 'failed') {
  const startedAt = new Date().toISOString()
  let projects = scope === 'failed' ? await getFailingProjects() : (await getAllProjects()).filter((p) => p.enabled)
  const targets = projects.map((p) => ({ id: p.id, supabaseUrl: p.supabaseUrl, anonKey: p.anonKey }))
  const { results, networkSuspect } = await runAllHealthChecks(targets, { concurrency: 5 })
  await saveResults(results)
  await saveRun({
    startedAt,
    finishedAt: new Date().toISOString(),
    mode: 'telegram',
    scope,
    results,
    networkSuspect,
    telegramSent: true,
  })
  const allProjects = await getAllProjects()
  return buildReportText(results, allProjects, {
    title: scope === 'failed' ? 'ผลตรวจ (เฉพาะ Failed เดิม)' : 'ผลตรวจทั้งหมด',
    timeLabel: new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }),
    networkSuspect,
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Telegram ต้องได้ 200 เสมอไม่งั้นจะ retry รัว — ตอบก่อนแล้วค่อยจัดการ error ภายใน
  const secretHeader = req.headers['x-telegram-bot-api-secret-token']
  if (secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false })
  }

  const update = req.body

  try {
    if (update.callback_query) {
      const cq = update.callback_query
      if (String(cq.message?.chat?.id) !== String(chatId)) {
        await answerCallbackQuery({ botToken, callbackQueryId: cq.id })
        return res.status(200).json({ ok: true })
      }

      await answerCallbackQuery({ botToken, callbackQueryId: cq.id, text: 'กำลังตรวจ…' })

      const data: string = cq.data || ''
      if (data === 'chk:all' || data === 'chk:failed') {
        const scope = data === 'chk:all' ? 'all' : 'failed'
        await editTelegramMessage({
          botToken,
          chatId,
          messageId: cq.message.message_id,
          text: `🔄 กำลังตรวจ${scope === 'all' ? 'ทั้งหมด' : 'เฉพาะ Failed'}…`,
        })
        const text = await runScope(scope)
        await editTelegramMessage({
          botToken,
          chatId,
          messageId: cq.message.message_id,
          text,
          keyboard: reportKeyboard(),
        })
      }
      return res.status(200).json({ ok: true })
    }

    if (update.message) {
      const msg = update.message
      if (String(msg.chat?.id) !== String(chatId)) return res.status(200).json({ ok: true })
      const text: string = (msg.text || '').trim()

      if (text === '/check') {
        await sendTelegramMessage({ botToken, chatId, text: '🔄 กำลังตรวจทั้งหมด…' })
        const report = await runScope('all')
        await sendTelegramMessage({ botToken, chatId, text: report, keyboard: reportKeyboard() })
      } else if (text === '/failed') {
        await sendTelegramMessage({ botToken, chatId, text: '🔄 กำลังตรวจเฉพาะ Failed…' })
        const report = await runScope('failed')
        await sendTelegramMessage({ botToken, chatId, text: report, keyboard: reportKeyboard() })
      } else if (text === '/status') {
        const projects = await getAllProjects()
        const healthy = projects.filter((p) => p.lastStatus === 'healthy').length
        const bad = projects.filter((p) => p.lastStatus === 'failed' || p.lastStatus === 'paused').length
        await sendTelegramMessage({
          botToken,
          chatId,
          text: `📊 สถานะล่าสุด (จาก cache)\n\n🟢 Healthy: ${healthy}\n🔴 มีปัญหา: ${bad}\nรวม: ${projects.length} โปรเจค`,
          keyboard: reportKeyboard(),
        })
      } else if (text === '/setup') {
        const projects = await getAllProjects()
        const incomplete = projects.filter((p) => p.setupStatus !== 'complete')
        const lines = incomplete.length
          ? incomplete.map((p) => `⚠️ ${p.displayName || p.supabaseRef} — ${p.setupStatus}`).join('\n')
          : 'ทุกโปรเจคติดตั้ง SQL ครบแล้ว ✅'
        await sendTelegramMessage({ botToken, chatId, text: `🛠 <b>Setup status</b>\n\n${lines}` })
      } else if (text === '/help' || text === '/start') {
        await sendTelegramMessage({
          botToken,
          chatId,
          text: [
            '<b>คำสั่งที่ใช้ได้</b>',
            '/status — สถานะล่าสุด (ไม่ยิงใหม่)',
            '/check — ตรวจทั้งหมดเดี๋ยวนี้',
            '/failed — ตรวจเฉพาะที่ไม่ healthy',
            '/setup — โปรเจคที่ติดตั้ง SQL ไม่ครบ',
          ].join('\n'),
        })
      }
      return res.status(200).json({ ok: true })
    }

    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('telegram webhook error', e)
    return res.status(200).json({ ok: true }) // ตอบ 200 เสมอกัน Telegram retry
  }
}
