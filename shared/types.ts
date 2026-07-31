export type HealthStatus = 'healthy' | 'slow' | 'failed' | 'paused' | 'unknown'

export type SetupStatus =
  | 'complete'
  | 'missing_rpc'
  | 'missing_seed'
  | 'missing_all'
  | 'permission_error'
  | 'unknown'

export type Environment = 'production' | 'staging' | 'development'

export interface CloudflareHosting {
  provider: 'cloudflare'
  accountId: string    // Cloudflare Account ID (32-char hex)
  projectId: string    // Pages project name
  pagesUrl?: string    // xxx.pages.dev
  zoneId?: string      // สำหรับ custom domain
}

export interface VercelHosting {
  provider: 'vercel'
  projectId: string    // prj_xxx
  teamId?: string      // team_xxx (สำหรับ team plan)
  deploymentUrl?: string  // xxx.vercel.app
}

export type HostingInfo = CloudflareHosting | VercelHosting

export interface ProjectMeta {
  description?: string
  businessPurpose?: string
  lifecycleStatus?: 'active' | 'maintenance' | 'deprecated' | 'archived'
  tags?: string[]
  techStack?: string[]
  createdDate?: string
  docsUrl?: string
  figmaUrl?: string
  mainBranch?: string
  localPath?: string
  cloneCommand?: string
}

export interface LastError {
  stage?: string
  code?: string
  message?: string
  at?: string
}

export interface ProjectAccounts {
  github?: string       // Gmail/email ที่ใช้ login GitHub
  supabase?: string     // Gmail/email ที่ใช้ login Supabase
  vercel?: string       // Gmail/email ที่ใช้ login Vercel
  cloudflare?: string   // email ที่ใช้ login Cloudflare
}

export interface ProjectDoc {
  id: string

  // Registry — required
  supabaseUrl: string
  anonKey: string

  // Registry — optional
  displayName?: string
  environment: Environment
  projectGroup?: string
  productionUrl?: string
  hosting?: HostingInfo
  githubRepo?: string           // format: "org/repo"
  githubRepoId?: number         // numeric GitHub repo ID
  githubDefaultBranch?: string  // main / master
  accounts?: ProjectAccounts    // บัญชีที่ผูกกับแต่ละ service
  notes?: string
  enabled: boolean

  // Registry — phase 3
  meta?: ProjectMeta

  // Derived (เก็บ cache ใน Firestore ไม่ต้องคำนวณซ้ำ)
  supabaseRef: string           // 20-char ref จาก URL subdomain
  supabaseProjectId?: string    // เก็บ explicit ถ้าต้องการ query ตรงๆ
  dashboardUrl: string
  githubUrl?: string

  // Monitor — system-written
  lastStatus: HealthStatus
  setupStatus: SetupStatus
  lastCheckedAt?: string
  lastLatencyMs?: number
  avgLatency7d?: number
  lastError?: LastError
  consecutiveFails: number
  pingCount?: number

  createdAt: string
  updatedAt: string
}

export interface CheckResult {
  projectId: string
  status: HealthStatus
  setupStatus: SetupStatus
  healthy: boolean
  latencyMs: number
  rowCount?: number
  pingCount?: number
  stage?: 'basic' | 'filter' | 'count' | 'write' | 'connect'
  errorCode?: string
  errorMessage?: string
  checkedAt: string
}

export interface RunDoc {
  id: string
  startedAt: string
  finishedAt: string
  mode: 'scheduled' | 'manual' | 'telegram'
  triggeredBy?: string
  scope: 'all' | 'failed' | string
  total: number
  healthy: number
  slow: number
  failed: number
  paused: number
  networkSuspect: boolean
  telegramSent: boolean
}

export interface GlobalSettings {
  telegramChatId?: string
  telegramWebhookSecret?: string
  slowThresholdMs: number
  timeoutMs: number
  concurrency: number
  retentionDays: number
}
