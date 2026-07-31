export function timeAgo(iso?: string): string {
  if (!iso) return 'ยังไม่เคยเช็ค'
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'เมื่อสักครู่'
  if (min < 60) return `${min} นาทีที่แล้ว`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} ชม.ที่แล้ว`
  const day = Math.floor(hr / 24)
  return `${day} วันที่แล้ว`
}
