import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/useAuth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AddProject from './pages/AddProject'
import ProjectDetail from './pages/ProjectDetail'

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex min-h-screen items-center justify-center text-base-500">กำลังโหลด…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <Protected>
                <Dashboard />
              </Protected>
            }
          />
          <Route
            path="/add"
            element={
              <Protected>
                <AddProject />
              </Protected>
            }
          />
          <Route
            path="/p/:id"
            element={
              <Protected>
                <ProjectDetail />
              </Protected>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
