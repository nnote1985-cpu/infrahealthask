import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/useAuth'

export default function Login() {
  const { signIn, user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true })
  }, [user, loading, navigate])

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-base-700 bg-base-900 p-8 text-center">
        <div className="mono text-xs uppercase tracking-widest text-accent">Infra Registry</div>
        <h1 className="mt-2 text-xl font-semibold text-base-300">Health Monitor</h1>
        <p className="mt-2 text-sm text-base-500">
          เข้าสู่ระบบด้วยบัญชีที่ได้รับอนุญาตเพื่อดู dashboard
        </p>
        <button
          onClick={() => signIn()}
          disabled={loading}
          className="focus-ring mt-6 w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
        >
          เข้าสู่ระบบด้วย Google
        </button>
      </div>
    </div>
  )
}
