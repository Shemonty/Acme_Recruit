import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import logoImg from '../images/logo.png'
import bannerImg from '../images/banner.jpg'

const MOCK_JOBS = [
  { id: '1', title: 'Frontend Engineer', department: 'Engineering', level: 'Intermediate', work_type: 'Remote', description: 'React, TypeScript, REST APIs. 2+ years experience required. Work on our core product UI.', applicants: 87, closes_at: '2026-06-15', num_questions: 10, time_limit: 3, status: 'published' },
  { id: '2', title: 'Backend Developer (Node)', department: 'Engineering', level: 'Senior', work_type: 'Hybrid', description: 'Node.js, PostgreSQL, system design. 5+ years required. Lead backend architecture decisions.', applicants: 52, closes_at: '2026-06-20', num_questions: 12, time_limit: 4, status: 'published' },
  { id: '3', title: 'Data Analyst', department: 'Analytics', level: 'Beginner', work_type: 'On-site', description: 'Excel, SQL, Power BI. Fresh graduates welcome. Join our growing analytics team.', applicants: 114, closes_at: '2026-06-18', num_questions: 8, time_limit: 2, status: 'published' },
  { id: '4', title: 'UI/UX Designer', department: 'Design', level: 'Intermediate', work_type: 'Remote', description: 'Figma, user research, design systems. Portfolio required. Shape product experience.', applicants: 39, closes_at: '2026-06-25', num_questions: 10, time_limit: 3, status: 'published' },
  { id: '5', title: 'ML Engineer', department: 'AI/ML', level: 'Senior', work_type: 'Remote', description: 'PyTorch, model fine-tuning, LLMOps. Computer vision experience preferred.', applicants: 61, closes_at: '2026-06-30', num_questions: 15, time_limit: 5, status: 'published' },
]

const MOCK_APPS = [] 

const LC = {
  Beginner:     { text: '#4ade80', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.30)' },
  Intermediate: { text: '#60a5fa', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.30)' },
  Senior:       { text: '#fbbf24', bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.30)' },
}

const SM = {
  under_review: { label: 'Under Review',                   color: '#fbbf24', bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.28)',  icon: '🕐' },
  pending:      { label: 'Under Review',                   color: '#fbbf24', bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.28)',  icon: '🕐' },
  shortlisted:  { label: 'Shortlisted',                    color: '#60a5fa', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.28)', icon: '⭐' },
  approved:     { label: 'Approved — Interview Scheduled', color: '#4ade80', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.28)',  icon: '✅' },
  rejected:     { label: 'Not Selected',                   color: '#f87171', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.28)',  icon: '✗'  },
}

const TABS = ['Available Jobs', 'My Applications', 'Profile']

export default function CandidateDashboard() {
  const navigate = useNavigate()
  const [tab, setTab]               = useState('Available Jobs')
  const [candidate, setCandidate]   = useState(null)
  const candidateIdRef              = useRef(null)
  const [jobs, setJobs]             = useState(MOCK_JOBS)
  const [apps, setApps]             = useState(MOCK_APPS)
  const [loading, setLoading]       = useState(true)
  const [selJob, setSelJob]         = useState(null)
  const [lvl, setLvl]               = useState('All')
  const [dept, setDept]             = useState('All')

  useEffect(() => { init() }, [])
  useEffect(() => { if (tab === 'My Applications') refreshApps() }, [tab])

  async function init() {
    setLoading(true)
    try {
      const localApps = JSON.parse(sessionStorage.getItem('local_applications') || '[]')

      // Check mock session
      const mock = sessionStorage.getItem('mock_candidate')
      if (mock) {
        const cand = JSON.parse(mock)
        setCandidate(cand)
        candidateIdRef.current = cand?.id || null
        if (localApps.length) setApps(localApps)
        await loadJobs()
        setLoading(false)
        return
      }

      // Real auth
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/'); return }

      const { data: prof } = await supabase.from('candidates').select('*').eq('user_id', user.id).single()
      if (prof) {
        setCandidate(prof)
        candidateIdRef.current = prof.id
        const { data: appsData } = await supabase
          .from('applications')
          .select('*, jobs(title,department,level)')
          .eq('candidate_id', prof.id)
          .order('submitted_at', { ascending: false })

        // Merge Supabase apps with local cache (local fills gaps if Supabase insert was slow)
        const supaApps = appsData || []
        const merged = [
          ...supaApps,
          ...localApps.filter(la => !supaApps.some(a => a.job_id === la.job_id)),
        ]
        if (merged.length) setApps(merged)
      }
      await loadJobs()
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

async function loadJobs() {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', 'published')
    .gte('closes_at', today)
    .order('created_at', { ascending: false })

  if (data && data.length > 0) {
    setJobs(data) // ← real jobs from Supabase
  }
  // if empty, keep MOCK_JOBS as fallback
}

  async function refreshApps() {
    const cid = candidateIdRef.current
    if (!cid) return
    try {
      const { data } = await supabase
        .from('applications')
        .select('*, jobs(title,department,level)')
        .eq('candidate_id', cid)
        .order('submitted_at', { ascending: false })
      if (data?.length) {
        const localApps = JSON.parse(sessionStorage.getItem('local_applications') || '[]')
        const merged = [...data, ...localApps.filter(la => !data.some(a => a.job_id === la.job_id))]
        setApps(merged)
      }
    } catch (e) { console.error(e) }
  }

  async function logout() {
    sessionStorage.removeItem('mock_candidate')
    await supabase.auth.signOut()
    navigate('/')
  }

  const appliedIds = apps.map(a => a.job_id)
  const depts      = ['All', ...new Set(jobs.map(j => j.department))]
  const levels     = ['All', 'Beginner', 'Intermediate', 'Senior']
  const filtered   = jobs.filter(j => !appliedIds.includes(j.id) && (lvl === 'All' || j.level === lvl) && (dept === 'All' || j.department === dept))
  const fmt        = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  const name     = candidate?.full_name || 'Candidate'
  const first    = name.split(' ')[0]
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#080c18' }}>
      <div className="text-center">
        <span className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin inline-block mb-3" />
        <p className="text-gray-300 text-sm font-medium">Loading your dashboard...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen relative">

      {/* BG */}
      <div className="fixed inset-0 z-0">
        <img src={bannerImg} alt="" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/80" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,rgba(7,11,22,0.92) 0%,rgba(8,12,24,0.85) 50%,rgba(5,8,20,0.95) 100%)' }} />
        <div className="absolute top-0 left-1/3 w-[700px] h-[500px] bg-blue-700/8 rounded-full blur-[160px]" />
      </div>

      {/* NAVBAR */}
      <nav className="sticky top-0 z-50 border-b" style={{ background: 'rgba(4,6,18,0.94)', borderColor: 'rgba(255,255,255,0.09)', backdropFilter: 'blur(24px)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-shrink-0">
            <img src={logoImg} alt="Acme AI" className="h-20 object-contain" />
            <div className="h-5 w-px bg-white/10" />
            <span className="text-xs font-black text-gray-200 uppercase">Candidate Portal</span>
          </div>

          <div className="hidden sm:flex items-center gap-1">
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className="px-4 py-2 rounded-xl text-sm font-extrabold transition-all"
                style={tab === t ? { background: 'rgba(37,99,235,0.18)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.30)' } : { color: '#ffffff' }}>
                {t}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black text-white"
                style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)' }}>{initials}</div>
              <div className="hidden sm:block">
                <p className="text-sm font-bold text-white leading-none">{first}</p>
                <p className="text-[11px] text-gray-200 leading-none mt-0.5">{candidate?.email}</p>
              </div>
            </div>
            <button onClick={logout} className="px-4 py-2.5 rounded-xl text-sm font-extrabold text-white hover:brightness-110 transition-all"
              style={{ border: '1px solid rgba(59,130,246,0.50)', background: 'rgba(37,99,235,0.20)' }}>
              Sign out
            </button>
          </div>
        </div>

        <div className="sm:hidden flex border-t overflow-x-auto" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} className="flex-1 py-3 text-sm font-extrabold whitespace-nowrap px-2 transition-all"
              style={{ color: tab === t ? '#93c5fd' : '#ffffff', borderBottom: tab === t ? '2px solid #3b82f6' : '2px solid transparent' }}>
              {t}
            </button>
          ))}
        </div>
      </nav>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-8">

        {/* ── AVAILABLE JOBS ── */}
        {tab === 'Available Jobs' && (
          <div>
            <div className="mb-8">
              <h1 className="text-3xl font-black text-white mb-1">Welcome back, <span className="text-blue-400">{first}</span></h1>
              <p className="text-gray-300 text-sm font-medium">{filtered.length} open positions available for you</p>
            </div>

            <div className="flex flex-wrap gap-2 mb-6">
              {levels.map(l => (
                <button key={l} onClick={() => setLvl(l)} className="px-4 py-2 rounded-lg text-sm font-bold transition-all"
                  style={lvl === l ? { background: 'rgba(37,99,235,0.22)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.40)' } : { background: 'rgba(255,255,255,0.06)', color: '#ffffff', border: '1px solid rgba(255,255,255,0.12)' }}>
                  {l}
                </button>
              ))}
              <select value={dept} onChange={e => setDept(e.target.value)} className="px-4 py-2 rounded-lg text-sm font-bold cursor-pointer"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: '#ffffff', colorScheme: 'dark' }}>
                {depts.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-5xl mb-4">🎉</div>
                <p className="font-bold text-white text-xl">You've applied to all positions!</p>
                <p className="text-gray-300 text-sm mt-1">Check "My Applications" to track your progress.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {filtered.map(job => {
                  const lc = LC[job.level] || LC.Intermediate
                  const open = selJob?.id === job.id
                  return (
                    <div key={job.id} onClick={() => setSelJob(open ? null : job)}
                      className="rounded-2xl p-6 cursor-pointer transition-all duration-200"
                      style={{ background: open ? 'rgba(37,99,235,0.12)' : 'rgba(255,255,255,0.05)', border: open ? '1px solid rgba(59,130,246,0.45)' : '1px solid rgba(255,255,255,0.11)', boxShadow: open ? '0 0 28px rgba(37,99,235,0.15)' : 'none' }}>

                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-black text-white text-lg mb-0.5">{job.title}</h3>
                          <p className="text-sm font-semibold text-gray-300">{job.department} · {job.work_type || 'Remote'}</p>
                        </div>
                        <span className="text-xs font-bold px-3 py-1 rounded-full flex-shrink-0 ml-2"
                          style={{ background: lc.bg, border: `1px solid ${lc.border}`, color: lc.text }}>{job.level}</span>
                      </div>

                      <p className="text-sm font-medium text-gray-300 leading-relaxed mb-4">{job.description}</p>

                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-gray-200 mb-4">
                        <span>👥 {job.applicants || 0} applicants</span>
                        <span>📅 Closes {fmt(job.closes_at)}</span>
                        <span>❓ {job.num_questions} questions</span>
                        <span>⏱ {job.time_limit} min/q</span>
                      </div>

                      {open && (
                        <div className="mt-4 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
                          <div className="grid grid-cols-3 gap-2 mb-4">
                            {[
                              { l: 'Department', v: job.department },
                              { l: 'Work Type',  v: job.work_type || 'Remote' },
                              { l: 'Level',      v: job.level },
                              { l: 'Questions',  v: `${job.num_questions} Qs` },
                              { l: 'Time / Q',   v: `${job.time_limit} min` },
                              { l: 'Closes',     v: fmt(job.closes_at) },
                            ].map((d, i) => (
                              <div key={i} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}>
                                <p className="text-[10px] font-bold text-gray-300 uppercase tracking-wider mb-1">{d.l}</p>
                                <p className="text-sm font-bold text-white">{d.v}</p>
                              </div>
                            ))}
                          </div>
                          <div className="p-3 rounded-xl mb-4" style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.22)' }}>
                            <p className="text-xs font-bold text-blue-300 mb-1">💡 About this interview</p>
                            <p className="text-xs font-medium text-gray-300 leading-relaxed">
                              {job.num_questions} AI-generated questions · Score above <strong className="text-white">80%</strong> to get auto-shortlisted · Results shown immediately.
                            </p>
                          </div>
                          <button onClick={e => { e.stopPropagation(); navigate(`/interview/${job.id}`) }}
                            className="w-full py-4 rounded-xl text-sm font-black text-white transition-all hover:brightness-110"
                            style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', boxShadow: '0 0 28px rgba(37,99,235,0.45)' }}>
                            Start AI Interview →
                          </button>
                        </div>
                      )}

                      {!open && <p className="text-xs font-bold text-blue-400">Click to view details & apply →</p>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── MY APPLICATIONS ── */}
        {tab === 'My Applications' && (
          <div>
            <div className="mb-8">
              <h1 className="text-3xl font-black text-white mb-1">My Applications</h1>
              <p className="text-gray-300 text-sm font-medium">Track your results and HR decisions</p>
            </div>

            {apps.length === 0 ? (
              <div className="text-center py-20">
                <div className="text-5xl mb-4">📋</div>
                <p className="font-bold text-white text-xl">No applications yet</p>
                <p className="text-gray-300 text-sm mt-1">Go to Available Jobs and start your first interview!</p>
                <button onClick={() => setTab('Available Jobs')} className="mt-5 px-6 py-3 rounded-xl text-sm font-black text-white"
                  style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)' }}>Browse Jobs →</button>
              </div>
            ) : (
              <div className="space-y-4">
                {apps.map(app => {
                  const st = SM[app.hr_decision] || SM.under_review
                  return (
                    <div key={app.id} className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.11)' }}>
                      <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
                        <div>
                          <h3 className="font-black text-white text-xl mb-0.5">{app.job_title || app.jobs?.title}</h3>
                          <p className="text-sm font-semibold text-gray-300">{app.department || app.jobs?.department} · Applied {fmt(app.submitted_at)}</p>
                        </div>
                        <span className="text-xs font-bold px-3 py-2 rounded-xl" style={{ background: st.bg, border: `1px solid ${st.border}`, color: st.color }}>
                          {st.icon} {st.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-3 mb-5">
                        {[
                          { l: 'Score', v: `${app.score}%`, c: app.score >= 80 ? '#4ade80' : app.score >= 60 ? '#60a5fa' : '#f87171' },
                          { l: 'Rank',  v: `#${app.rank || '—'}`, c: '#e2e8f0' },
                          { l: 'Time',  v: `${app.time_taken || '—'} min`, c: '#e2e8f0' },
                        ].map((s, i) => (
                          <div key={i} className="p-4 rounded-xl text-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
                            <p className="text-2xl font-black mb-1" style={{ color: s.c }}>{s.v}</p>
                            <p className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">{s.l}</p>
                          </div>
                        ))}
                      </div>

                      <div className="mb-5">
                        <div className="flex justify-between text-xs font-bold text-gray-300 mb-2"><span>Score</span><span>{app.score}%</span></div>
                        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.09)' }}>
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${app.score}%`, background: app.score >= 80 ? 'linear-gradient(90deg,#16a34a,#4ade80)' : app.score >= 60 ? 'linear-gradient(90deg,#1d4ed8,#60a5fa)' : 'linear-gradient(90deg,#dc2626,#f87171)' }} />
                        </div>
                        <div className="flex justify-between text-[11px] font-semibold mt-1.5">
                          <span className="text-gray-300">0%</span>
                          <span className="text-yellow-500">⭐ 80% auto-shortlist</span>
                          <span className="text-gray-300">100%</span>
                        </div>
                      </div>

                      {app.hr_decision === 'approved' && (
                        <div className="p-4 rounded-xl" style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)' }}>
                          <p className="text-xs font-black text-green-400 mb-2">📩 Message from HR</p>
                          <p className="text-sm font-medium text-gray-200">{app.hr_note || 'Congratulations! You have been selected. HR will contact you shortly for the next steps.'}</p>
                        </div>
                      )}
                      {app.hr_decision === 'rejected' && (
                        <div className="p-4 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.22)' }}>
                          <p className="text-xs font-black text-red-400 mb-2">Decision</p>
                          <p className="text-sm font-medium text-gray-300">Thank you for applying. After careful review we've decided not to move forward. We encourage you to apply for other roles.</p>
                        </div>
                      )}
                      {app.hr_decision === 'shortlisted' && (
                        <div className="p-4 rounded-xl" style={{ background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.25)' }}>
                          <p className="text-xs font-black text-blue-400 mb-1">⭐ Auto-shortlisted</p>
                          <p className="text-sm font-medium text-gray-300">Your score exceeded the 80% threshold. HR is reviewing your profile and will make a decision soon.</p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── PROFILE ── */}
        {tab === 'Profile' && (
          <div className="max-w-5xl mx-auto">
            <div className="mb-8">
              <h1 className="text-3xl font-black text-white mb-1">My Profile</h1>
              <p className="text-gray-300 text-sm font-medium">Your candidate information on file</p>
            </div>

            {/* Header card — full width */}
            <div className="rounded-2xl p-6 mb-6 flex items-center gap-5" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.11)' }}>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)' }}>{initials}</div>
              <div>
                <h2 className="text-xl font-black text-white">{name}</h2>
                <p className="text-sm font-semibold text-gray-300 mt-0.5">{candidate?.email}</p>
                <p className="text-xs font-medium text-gray-200 mt-0.5">{candidate?.phone}</p>
              </div>
            </div>

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

              {/* LEFT — Personal Details + Education */}
              <div className="flex flex-col gap-4">
                {[
                  { title: '📋 Personal Details', items: [
                    { l: 'Email',   v: candidate?.email },
                    { l: 'Phone',   v: candidate?.phone },
                    { l: 'Gender',  v: candidate?.gender },
                    { l: 'Address', v: candidate?.address, full: true },
                  ]},
                  { title: '🎓 Education', items: [
                    { l: 'Degree',       v: candidate?.education?.degree },
                    { l: 'Field',        v: candidate?.education?.field_of_study },
                    { l: 'Institution',  v: candidate?.education?.institution, full: true },
                    { l: 'Passing Year', v: candidate?.education?.end_year },
                    { l: 'CGPA / GPA',   v: candidate?.education?.gpa },
                  ]},
                ].map((sec, si) => (
                  <div key={si} className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.11)' }}>
                    <h3 className="text-sm font-black text-white mb-4">{sec.title}</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {sec.items.map((item, i) => (
                        <div key={i} className={item.full ? 'col-span-2' : ''}>
                          <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mb-1">{item.l}</p>
                          <p className="text-sm font-semibold text-gray-200">{item.v || '—'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* RIGHT — Skills + Experience */}
              <div className="flex flex-col gap-4">
                <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.11)' }}>
                  <h3 className="text-sm font-black text-white mb-4">🛠 Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {(!candidate?.skills || candidate.skills.length === 0)
                      ? <p className="text-sm font-medium text-gray-300">No skills added</p>
                      : candidate.skills.map((s, i) => (
                        <span key={i} className="px-3 py-1.5 rounded-xl text-xs font-bold text-blue-300"
                          style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.28)' }}>{s}</span>
                      ))}
                  </div>
                </div>

                <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.11)' }}>
                  <h3 className="text-sm font-black text-white mb-4">💼 Experience</h3>
                  {(!candidate?.experience || candidate.experience.length === 0)
                    ? <p className="text-sm font-semibold text-gray-200">Fresher — No prior experience</p>
                    : candidate.experience.map((exp, i) => (
                      <div key={i} className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <p className="font-bold text-white">{exp.job_title}</p>
                        <p className="text-xs font-semibold text-gray-200 mt-0.5">{exp.company} · {exp.start} – {exp.end || 'Present'}</p>
                        {exp.description && <p className="text-sm font-medium text-gray-300 mt-2">{exp.description}</p>}
                      </div>
                    ))}
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  )
}