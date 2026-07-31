# Infra Registry + Supabase Health Monitor

ทะเบียนกลางของทุกโปรเจค + ระบบยิง ping กัน Supabase auto-pause ทุก 6 ชม. พร้อมแจ้งเตือน/สั่งงานผ่าน Telegram

Phase 1 (core registry + monitor) เสร็จแล้ว — typecheck ผ่าน, build ผ่าน

---

## 1. โครงสร้างโปรเจค

```
shared/              logic ที่ใช้ร่วมกันทั้ง frontend และ API
  types.ts           types หลักทั้งระบบ
  derive.ts           แตก ref/dashboardUrl จาก supabaseUrl
  healthCheck.ts      รัน read+write 4 ขั้นตอน + classify status/setup
  runAll.ts           รันหลายโปรเจคพร้อม concurrency + network-suspect guard
  telegram.ts          build ข้อความรายงาน + ส่ง/แก้ไข message

api/                 Vercel Serverless Functions (Node runtime)
  cron/health-check.ts    endpoint หลักที่ cron ยิงเข้ามาทุก 6 ชม.
  telegram/webhook.ts      รับ command + callback query จาก Telegram
  run-check.ts             manual trigger จาก Dashboard (ต้อง login)
  test-connection.ts       ทดสอบก่อนบันทึกโปรเจคใหม่
  _lib/                    firebase admin, projects repo, cron auth

src/                 React SPA (Vite)
  pages/             Login, Dashboard, AddProject, ProjectDetail
  lib/               firebase client, auth hook, projects hook, format
  components/        StatusBadge, SetupBadge

sql/seed.sql         SQL ชุดเดียว รันในทุก Supabase project ที่จะ monitor
firestore.rules      เฉพาะ email ที่ whitelist เข้าถึงได้
.github/workflows/   backup cron (เยื้องเวลา 1 ชม. จาก cron-job.org)
```

---

## 2. Setup ทีละขั้น

### 2.1 Firebase
1. สร้างโปรเจค Firebase ใหม่ (หรือใช้ของเดิม) → เปิด **Firestore** + **Authentication (Google provider)**
2. Project settings → General → เพิ่ม Web App → คัดลอกค่า config มาใส่ `.env` (ตัวแปร `VITE_FIREBASE_*`)
3. Project settings → Service accounts → Generate new private key → เอา JSON ทั้งก้อนมาใส่ env `FIREBASE_ADMIN_KEY` (เป็น string เดียว)
4. แก้ `firestore.rules` — เปลี่ยน `owner@example.com` เป็นอีเมล Google ที่จะ login แล้ว deploy:
   ```
   firebase deploy --only firestore:rules,firestore:indexes
   ```

### 2.2 Telegram Bot
1. คุย [@BotFather](https://t.me/BotFather) → `/newbot` → เก็บ token → ใส่ `TELEGRAM_BOT_TOKEN`
2. หา chat id ของตัวเอง (คุยกับ [@userinfobot](https://t.me/userinfobot)) → ใส่ `TELEGRAM_CHAT_ID`
3. ตั้ง `TELEGRAM_WEBHOOK_SECRET` เป็น string สุ่มยาวๆ เอง
4. **หลัง deploy Vercel แล้ว** ตั้ง webhook (รันครั้งเดียว):
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://<your-app>.vercel.app/api/telegram/webhook" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```

### 2.3 Vercel
1. `vercel link` หรือ import repo ผ่าน dashboard
2. ใส่ env vars ทั้งหมดจาก `.env.example` ใน Project Settings → Environment Variables
3. Deploy: `vercel --prod`
4. ตั้ง `PUBLIC_APP_URL` = URL จริงหลัง deploy (ใช้ในปุ่ม "เปิด Dashboard" บน Telegram)

### 2.4 Cron
**หลัก — cron-job.org**
- สร้าง job ใหม่ยิง `POST https://<your-app>.vercel.app/api/cron/health-check?mode=daily` ตอน 08:00 ICT
- อีก 3 job ยิง `?mode=silent` ตอน 02:00 / 14:00 / 20:00 ICT
- ใส่ header `x-cron-secret: <CRON_SECRET>` ทุก job

**สำรอง — GitHub Actions** (มีให้แล้วใน `.github/workflows/health-check-backup.yml`)
- ตั้ง repo secrets: `APP_URL`, `CRON_SECRET`
- รันเยื้องเวลา 1 ชม. จาก cron-job.org กันชนกันเป๊ะ พร้อม heartbeat commit กัน GitHub ปิด workflow ที่ 60 วัน

### 2.5 ติดตั้ง SQL ในแต่ละ Supabase project
1. เปิด `/add` ในเว็บ → ใส่ Supabase URL + anon key
2. กด "ทดสอบการเชื่อมต่อ" → ถ้า setup ไม่ครบจะโชว์ SQL ให้ copy
3. วางใน Supabase SQL Editor → รัน → กลับมาทดสอบใหม่ → บันทึก

---

## 3. Dev local

```bash
npm install
cp .env.example .env   # กรอกค่าให้ครบ
npm run dev             # frontend เท่านั้น (ต้องรัน vercel dev แยกถ้าจะเทส /api)
vercel dev              # รันทั้ง frontend + api routes พร้อมกัน
```

---

## 4. สถานะ Phase

- ✅ **Phase 1** — Registry + Monitor core, Dashboard, Add Project, manual run, SQL installer, Telegram แจ้งเตือนพื้นฐาน + control (`/check` `/failed` `/status` `/setup` + ปุ่ม inline)
- ⏳ **Phase 2** — กราฟ latency ในหน้า detail (โครงมีแล้ว โชว์แค่ list), inline keyboard เลือกโปรเจคเดี่ยว (`/list`), immediate alert เมื่อ healthy→paused, Firestore TTL 90 วันสำหรับ `checks`
- ⏳ **Phase 3** — `meta` fields เต็ม (tags, techStack, figma, docs), filter ตาม tag, bulk export, dark/light toggle

---

## 5. Known follow-ups

- ตั้ง Firestore TTL policy บน field `checkedAt` ของ collection `checks` ผ่าน Firebase Console (ยังตั้งผ่าน code ไม่ได้ ต้องตั้งใน console)
- `saveResults` เขียนแบบ merge บน root project doc — ถ้าจะรองรับหลาย environment ต่อโปรเจคเดียว ให้แยก `projectGroup` ตอน query ฝั่ง dashboard
- API routes ตรวจ `ALLOWED_EMAILS` ซ้ำนอกเหนือจาก Firestore rules แล้ว (ดู `api/_lib/verifyCron.ts` → `verifyOwner`) — อย่าลืมตั้ง env นี้ให้ตรงกับ `firestore.rules`
