import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from './firebase'
import type { ProjectDoc } from '../types'

export function useProjects() {
  const [projects, setProjects] = useState<ProjectDoc[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(collection(db, 'projects'), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setProjects(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProjectDoc)))
        setLoading(false)
      },
      (err) => {
        console.error('useProjects snapshot error', err)
        setLoading(false)
      }
    )
    return unsub
  }, [])

  return { projects, loading }
}
