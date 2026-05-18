import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import HRLogin from './pages/HRLogin'
import CandidateAuth from './pages/CandidateAuth'
import CandidateDashboard from './pages/CandidateDashboard'
import HRDashboard from './pages/HRDashboard'
import Interview from './pages/Interview'
import { HRRoute, CandidateRoute } from './components/ProtectedRoute'

// ── Simple 404 page ──
function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-4"
      style={{ background: '#080c18' }}>
      <p className="text-8xl font-black text-white/10">404</p>
      <h1 className="text-2xl font-black text-white -mt-4">Page not found</h1>
      <p className="text-gray-400 text-sm">The page you're looking for doesn't exist.</p>
      <a href="/"
        className="mt-2 px-6 py-3 rounded-xl text-sm font-bold text-white"
        style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)' }}>
        ← Back to Home
      </a>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/hr/login" element={<HRLogin />} />
        <Route path="/apply/:jobId" element={<CandidateAuth />} />
        <Route path="/candidate/login" element={<CandidateAuth />} />

        {/* Protected: Candidate */}
        <Route path="/candidate/dashboard" element={
          <CandidateRoute><CandidateDashboard /></CandidateRoute>
        } />
        <Route path="/interview/:jobId" element={
          <CandidateRoute><Interview /></CandidateRoute>
        } />

        {/* Protected: HR */}
        <Route path="/hr/dashboard" element={
          <HRRoute><HRDashboard /></HRRoute>
        } />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App