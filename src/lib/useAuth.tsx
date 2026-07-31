import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth'
import { auth, googleProvider } from './firebase'

interface AuthCtx {
  user: User | null
  loading: boolean
  signIn: () => Promise<void>
  signOutUser: () => Promise<void>
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      console.log('[Auth] state:', u?.email ?? 'null')
      setUser(u)
      setLoading(false)
    })
  }, [])

  return (
    <Ctx.Provider
      value={{
        user,
        loading,
        signIn: async () => {
          try {
            const r = await signInWithPopup(auth, googleProvider)
            console.log('[Auth] popup ok:', r.user.email)
          } catch (e: any) {
            console.error('[Auth] popup error:', e.code, e.message)
          }
        },
        signOutUser: async () => {
          await signOut(auth)
        },
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
