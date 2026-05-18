import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ── Spinner shown while checking auth ──
function Checking() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#080c18' }}>
      <span className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
    </div>
  )
}

// ── HR Protected Route ──
// Allows: real Supabase session OR mock HR (window.location check)
export function HRRoute({ children }) {
  const [status, setStatus] = useState('checking') // 'checking' | 'ok' | 'deny'

  useEffect(() => {
    async function check() {
      // Mock HR login (uses window.location redirect, no Supabase session)
      // We store a flag in sessionStorage when mock HR logs in
      const mockHR = sessionStorage.getItem('mock_hr')
      if (mockHR === 'true') { setStatus('ok'); return }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setStatus('deny'); return }

      // Check hr_users table
      const { data: profile } = await supabase
        .from('hr_users')
        .select('id')
        .eq('user_id', session.user.id)
        .maybeSingle()

      setStatus(profile ? 'ok' : 'deny')
    }
    check()
  }, [])

  if (status === 'checking') return <Checking />
  if (status === 'deny') return <Navigate to="/hr/login" replace />
  return children
}

// ── Candidate Protected Route ──
// Allows: mock_candidate in sessionStorage OR real Supabase session with candidates row
export function CandidateRoute({ children }) {
  const [status, setStatus] = useState('checking')

  useEffect(() => {
    async function check() {
      // Mock candidate session
      const mock = sessionStorage.getItem('mock_candidate')
      if (mock) { setStatus('ok'); return }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setStatus('deny'); return }

      const { data: prof } = await supabase
        .from('candidates')
        .select('id')
        .eq('user_id', session.user.id)
        .maybeSingle()

      setStatus(prof ? 'ok' : 'deny')
    }
    check()
  }, [])

  if (status === 'checking') return <Checking />
  if (status === 'deny') return <Navigate to="/candidate/login" replace />
  return children
}