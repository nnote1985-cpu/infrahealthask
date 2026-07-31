import rawSql from '../../sql/seed.sql?raw'

/**
 * คืน SQL ที่เติม supabaseRef และ projectName ให้ครบแล้ว
 * ใช้ตอนแสดงให้ user copy — ไม่ต้องแก้อะไรด้วยมือ
 */
export function getSetupSQL(supabaseRef: string, projectName?: string): string {
  const safeName = (projectName || supabaseRef).replace(/'/g, "''")
  const safeRef = supabaseRef.replace(/'/g, "''")
  return rawSql
    .replace("'CHANGE_ME_NAME'", `'${safeName}'`)
    .replace("'CHANGE_ME_REF'", `'${safeRef}'`)
}

// raw template สำหรับ bulk import (ยังไม่รู้ ref)
export const SETUP_SQL = rawSql
