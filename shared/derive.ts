/** แตกค่าที่ derive ได้จาก supabaseUrl เพียงอย่างเดียว ไม่ให้กรอกมือ */
export function deriveFromSupabaseUrl(supabaseUrl: string) {
  const u = new URL(supabaseUrl)
  const ref = u.hostname.split('.')[0]
  return {
    supabaseRef: ref,
    dashboardUrl: `https://supabase.com/dashboard/project/${ref}`,
  }
}

export function deriveGithubUrl(githubRepo?: string) {
  if (!githubRepo) return undefined
  return `https://github.com/${githubRepo}`
}

export function deriveCloneCommand(githubRepo?: string) {
  if (!githubRepo) return undefined
  return `git clone git@github.com:${githubRepo}.git`
}
