import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateQuestionsLLM, parsePDFLLM } from '../lib/llm'
import logoImg from '../images/logo.png'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'




const DEPTS = ['Engineering', 'Analytics', 'Design', 'AI/ML', 'Marketing', 'Operations', 'HR']
const LEVELS = ['Beginner', 'Intermediate', 'Senior']
const WORK_TYPES = ['Remote', 'Hybrid', 'On-site']
const Q_TYPES = [
  { id: 'mcq', label: 'MCQ', desc: 'Multiple choice, auto-graded' },
  { id: 'open', label: 'Open Text', desc: 'AI reviews the answer' },
  { id: 'truefalse', label: 'True / False', desc: 'Quick knowledge check' },
]

const DIFFICULTY_MODES = [
  'Balanced',
  'Theory Heavy',
  'Practical Coding',
  'Debugging',
  'Scenario Based',
  'System Design',
]

const NAV = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'jobs', icon: '💼', label: 'Job Postings' },
  { id: 'candidates', icon: '👥', label: 'Candidates' },
]

const DECISION_STYLE = {
  shortlisted: { color: '#60a5fa', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.28)', label: 'Shortlisted' },
  under_review: { color: '#fbbf24', bg: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.28)', label: 'Under Review' },
  approved: { color: '#4ade80', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.28)', label: 'Approved' },
  rejected: { color: '#f87171', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.28)', label: 'Rejected' },
}

const EMPTY_JOB = {
  title: '',
  department: 'Engineering',
  work_type: 'Remote',
  level: 'Intermediate',
  description: '',
  num_questions: 10,
  time_limit: 30,
  closes_at: '',
  question_types: ['mcq', 'open'],
  question_focus: ['Balanced'],
}

export default function HRDashboard() {
  const navigate = useNavigate()
  const [nav, setNav] = useState('dashboard')
  const [jobs, setJobs] = useState([])
  const [candidates, setCandidates] = useState([])

  const [stats, setStats] = useState({
    totalJobs: 0,
    totalCandidates: 0,
    shortlisted: 0,
    pending: 0,
  })
  const [sideOpen, setSideOpen] = useState(true)

  // Job creation modal
  const [showModal, setShowModal] = useState(false)
  const [modalStep, setModalStep] = useState(1)
  const [jobForm, setJobForm] = useState(EMPTY_JOB)
  const [genLoading, setGenLoading] = useState(false)
  const [questions, setQuestions] = useState([])
  const [saveLoading, setSaveLoading] = useState(false)
  const [pdfFile, setPdfFile] = useState(null)
  const [pdfParsing, setPdfParsing] = useState(false)

  // Candidate review
  const [selCandidate, setSelCandidate] = useState(null)
  const [hrNote, setHrNote] = useState('')
  const [filterJob, setFilterJob] = useState('All')
  const [filterDecision, setFilterDecision] = useState('All')
  const [candProfile, setCandProfile] = useState(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [emailStatus, setEmailStatus] = useState(null) // null | 'sending' | 'sent' | 'error'

  useEffect(() => { loadData() }, [])

  async function loadData() {
    try {
      // Load jobs
      const { data: jobsData } = await supabase
        .from('jobs')
        .select('*')
        .order('created_at', { ascending: false })
      if (jobsData?.length) setJobs(jobsData)

      // Load applications + job title (candidates queried separately to avoid RLS join block)
      const { data: appsData } = await supabase
        .from('applications')
        .select('*, jobs(title)')
        .order('score', { ascending: false })

      if (appsData?.length) {
        // Fetch candidate names separately (bypasses RLS join restriction)
        const candidateIds = [...new Set(appsData.map(a => a.candidate_id).filter(Boolean))]
        let candMap = {}
        if (candidateIds.length) {
          const { data: cands } = await supabase
            .from('candidates')
            .select('id, full_name, email')
            .in('id', candidateIds)
          cands?.forEach(c => { candMap[c.id] = c })
        }

        const mapped = appsData.map(a => ({
          id: a.id,
          full_name: candMap[a.candidate_id]?.full_name || a.candidate_name || 'Candidate',
          email: candMap[a.candidate_id]?.email || a.candidate_email || '',
          job_title: a.jobs?.title,
          score: a.score,
          time_taken: a.time_taken,
          hr_decision: a.hr_decision,
          submitted_at: a.submitted_at,
          hr_note: a.hr_note,
          candidate_id: a.candidate_id,
          job_id: a.job_id,
          answers: a.answers || [],
        }))
        setCandidates(mapped)

        // ── Dynamic stats from real data ──
        setStats({
          totalJobs: jobsData?.length || 0,
          totalCandidates: mapped.length,
          shortlisted: mapped.filter(c => c.score >= 80).length,
          pending: mapped.filter(c => c.hr_decision === 'under_review' || c.hr_decision === 'pending').length,
        })
      } else {
        setStats(s => ({ ...s, totalJobs: jobsData?.length || 0 }))
      }
    } catch (e) {
      console.error('Load error:', e)
    }
  }

 // ── Parse JD PDF with local LLM backend ──
  async function parsePDFWithGemini(file) {
    setPdfParsing(true)
    try {
      const parsed = await parsePDFLLM(file)

      if (!parsed?.title && !parsed?.description) {
        throw new Error('No job data found in PDF')
      }

      const matchedDept =
        DEPTS.find(
          d => d.toLowerCase() === parsed.department?.toLowerCase()
        ) || 'Engineering'

      setJobForm(p => ({
        ...p,
        title: parsed.title || p.title,
        description: parsed.description || p.description,
        department: matchedDept,
      }))
      setPdfFile(file)
    } catch (e) {
      console.error('PDF parse error:', e)
      alert(`Failed to extract PDF properly. ${e.message}`)
    } finally {
      setPdfParsing(false)
    }
  }

  // ── Generate questions with local LLM backend ──
  async function generateQuestions() {
    setGenLoading(true)
    try {
      const parsed = await generateQuestionsLLM({
        title: jobForm.title,
        description: jobForm.description,
        level: jobForm.level,
        num_questions: jobForm.num_questions,
        question_types: jobForm.question_types,
        tech_stack: jobForm.tech_stack || '',
        question_focus: jobForm.question_focus || ['Balanced'],
      })

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('LLM returned no questions')
      }

      setQuestions(parsed)
      setModalStep(3)
    } catch (e) {
      console.error('LLM error:', e)
      alert(`Failed: ${e.message}`)
    } finally {
      setGenLoading(false)
    }
  }
  function toggleQType(id) {
    setJobForm(p => ({
      ...p,
      question_types: p.question_types.includes(id)
        ? p.question_types.filter(t => t !== id)
        : [...p.question_types, id]
    }))
  }

  function regenerateOne(idx) {
    // Remove and regenerate single question placeholder
    const updated = [...questions]
    updated[idx] = { ...updated[idx], question: '⟳ Regenerating...', _regen: true }
    setQuestions(updated)
    // In real app, call Gemini for single question
    setTimeout(() => {
      const q = [...questions]
      q[idx] = { ...q[idx], question: q[idx].question + ' (regenerated)', _regen: false }
      setQuestions(q)
    }, 1500)
  }

  function deleteQ(idx) { setQuestions(q => q.filter((_, i) => i !== idx)) }


 function downloadQuestionsPDF() {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  // ── HEADER BACKGROUND ──
  doc.setFillColor(15, 23, 42)       // dark navy
  doc.rect(0, 0, pageW, 42, 'F')

  // ── COMPANY NAME (top left) ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(99, 179, 237)     // blue-300
  doc.text('ACME AI LTD.', 14, 13)

  // ── DIVIDER LINE ──
  doc.setDrawColor(59, 130, 246)
  doc.setLineWidth(0.4)
  doc.line(14, 16, pageW - 14, 16)

  // ── MAIN TITLE ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.setTextColor(255, 255, 255)
  doc.text(`${jobForm.title} — Interview Questions`, 14, 27)

  // ── SUB LABEL ──
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(148, 163, 184)    // gray-400
  doc.text('Recruitment · Confidential', 14, 34)

  // ── META PILLS (right side of header) ──
  const meta = [
    jobForm.department,
    jobForm.level,
    jobForm.question_focus?.join(', ') || 'Balanced',
  ]
  const experienceMap = { Beginner: '0–2 yrs', Intermediate: '2–5 yrs', Senior: '5+ yrs' }
  meta.push(experienceMap[jobForm.level] || '')

  let metaX = pageW - 14
  ;[...meta].reverse().forEach(label => {
    const w = doc.getTextWidth(label) + 6
    metaX -= w + 3
    doc.setFillColor(30, 58, 138)
    doc.roundedRect(metaX, 6, w, 7, 1.5, 1.5, 'F')
    doc.setFontSize(7)
    doc.setTextColor(147, 197, 253)
    doc.text(label, metaX + 3, 11.5)
  })

  // ── QUESTIONS TABLE ──
  const rows = questions.map((q, i) => {
    // Question text — clean, no repeated option letters
    let qText = q.question

    // Options (for MCQ / True-False) — just the option text, no letter prefix
    let optionsText = ''
    if (q.options && Array.isArray(q.options) && q.options.length) {
      optionsText = q.options
        .map((opt, idx) => {
          // Strip leading "A.", "A)", "A " etc. that Gemini sometimes bakes in
          const stripped = opt.replace(/^[A-Da-d][.):\s]+\s*/, '').trim()
          return `${String.fromCharCode(65 + idx)}. ${stripped}`
        })
        .join('\n')
      qText = qText + '\n\n' + optionsText
    }

    // Answer guide
    const answerGuide = q.correct_answer
      ? q.correct_answer.replace(/^[A-Da-d][.):\s]+\s*/, '').trim()   // strip prefix if present
      : q.explanation || '—'

    // Type label — normalise
    const rawT = (q.type || '').toLowerCase().replace(/[_\s/]+/g, '')
    const typeLabel = rawT === 'mcq' ? 'MCQ'
      : rawT.startsWith('true') ? 'True / False'
      : (rawT.includes('open') || rawT.includes('text')) ? 'Open Text'
      : q.type || ''

    return [i + 1, qText, typeLabel, answerGuide]
  })

  autoTable(doc, {
    startY: 48,
    head: [['#', 'Question', 'Type', 'Answer Guide']],
    body: rows,
    theme: 'grid',
    styles: {
      fontSize: 8.5,
      cellPadding: { top: 4, right: 4, bottom: 4, left: 4 },
      overflow: 'linebreak',
      valign: 'top',
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: [30, 58, 138],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'left',
      cellPadding: { top: 5, right: 4, bottom: 5, left: 4 },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],   // very light gray rows
    },
    columnStyles: {
      0: { cellWidth: 12,  halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 96 },
      2: { cellWidth: 24, halign: 'center' },
      3: { cellWidth: 48 },
    },
    // Colour-code type cell
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 2) {
        const t = (data.cell.raw || '').toLowerCase()
        if (t.includes('mcq')) {
          data.cell.styles.textColor = [37, 99, 235]
          data.cell.styles.fillColor = [239, 246, 255]
        } else if (t.includes('open')) {
          data.cell.styles.textColor = [124, 58, 237]
          data.cell.styles.fillColor = [245, 243, 255]
        } else if (t.includes('true')) {
          data.cell.styles.textColor = [5, 150, 105]
          data.cell.styles.fillColor = [236, 253, 245]
        }
      }
      // Highlight correct answer cell lightly
      if (data.section === 'body' && data.column.index === 3) {
        data.cell.styles.textColor = [30, 64, 175]
      }
    },
    margin: { left: 14, right: 14 },
  })

  // ── FOOTER on every page ──
  const totalPages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    // footer bar
    doc.setFillColor(15, 23, 42)
    doc.rect(0, pageH - 12, pageW, 12, 'F')
    doc.setFontSize(7.5)
    doc.setTextColor(100, 116, 139)
    doc.text('Generated by Acme AI HR Platform · Confidential', 14, pageH - 4.5)
    doc.text(`Page ${p} of ${totalPages}`, pageW - 14, pageH - 4.5, { align: 'right' })
  }

  doc.save(`${jobForm.title.replace(/\s+/g, '-')}-Interview-Questions.pdf`)
}

  // ── Publish job ──
  async function publishJob() {
    setSaveLoading(true)
    try {
      const { data, error } = await supabase.from('jobs').insert({
        title: jobForm.title, department: jobForm.department, work_type: jobForm.work_type,
        level: jobForm.level, description: jobForm.description, num_questions: jobForm.num_questions,
        time_limit: jobForm.time_limit, closes_at: jobForm.closes_at,
        question_types: jobForm.question_types, questions: questions, status: 'published', applicants: 0,
      }).select().single()

      if (error) throw error
      setJobs(prev => [data, ...prev])
      setShowModal(false)
      setModalStep(1)
      setJobForm(EMPTY_JOB)
      setQuestions([])
      setPdfFile(null)
      setNav('jobs')
    } catch (e) {
      alert('Failed to save job. Check Supabase connection.')
    } finally {
      setSaveLoading(false)
    }
  }

  // ── Toggle job status ──
  async function toggleJobStatus(job) {
    const newStatus = job.status === 'published' ? 'draft' : 'published'
    try {
      await supabase.from('jobs').update({ status: newStatus }).eq('id', job.id)
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: newStatus } : j))
    } catch { setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: newStatus } : j)) }
  }

  // ── Delete job ──
  async function deleteJob(job) {
    if (!window.confirm(`Delete "${job.title}"? This will remove it from the candidate portal permanently.`)) return
    try {
      await supabase.from('jobs').delete().eq('id', job.id)
    } catch { /* mock fallback */ }
    setJobs(prev => prev.filter(j => j.id !== job.id))
  }

  // ── HR Decision ──
  async function updateDecision(candidateId, appId, decision, note) {
    try {
      await supabase.from('applications').update({ hr_decision: decision, hr_note: note }).eq('id', appId)
    } catch { /* mock */ }
    setCandidates(prev => prev.map(c => c.id === appId ? { ...c, hr_decision: decision, hr_note: note } : c))
    setSelCandidate(prev => prev ? { ...prev, hr_decision: decision, hr_note: note } : null)
  }

  async function sendEmail() {
    const candidateEmail = selCandidate?.email
    const candidateName  = selCandidate?.full_name || 'Candidate'
    const jobTitle       = selCandidate?.job_title || 'the position'
    const decision       = selCandidate?.hr_decision
    if (!candidateEmail || !decision) return
    setEmailStatus('sending')
    try {
      const LLM_URL = import.meta.env.VITE_LLM_API_URL || 'http://localhost:8000'
      const res = await fetch(`${LLM_URL}/api/send-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_email: candidateEmail,
          candidate_name: candidateName,
          job_title: jobTitle,
          hr_note: hrNote || '',
          decision,
        }),
      })
      if (res.ok) {
        setEmailStatus('sent')
        setTimeout(() => setEmailStatus(null), 4000)
      } else {
        const err = await res.json().catch(() => ({}))
        console.warn('Email send failed:', err.detail)
        setEmailStatus('error')
        setTimeout(() => setEmailStatus(null), 6000)
      }
    } catch (e) {
      console.warn('Email endpoint unreachable:', e.message)
      setEmailStatus('error')
      setTimeout(() => setEmailStatus(null), 6000)
    }
  }

  async function fetchCandProfile(candidateId) {
    if (!candidateId) return
    setLoadingProfile(true)
    try {
      const { data } = await supabase
        .from('candidates')
        .select('*')
        .eq('id', candidateId)
        .single()
      setCandProfile(data || null)
    } catch { setCandProfile(null) }
    finally { setLoadingProfile(false) }
  }

  async function logout() {
    sessionStorage.removeItem('hr_auth')
    await supabase.auth.signOut()
    navigate('/hr/login')
  }

  const filteredCandidates = candidates.filter(c =>
    (filterJob === 'All' || c.job_title === filterJob) &&
    (filterDecision === 'All' || c.hr_decision === filterDecision)
  )

  const jobTitles = ['All', ...new Set(candidates.map(c => c.job_title).filter(Boolean))]

  const fmt = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  const isExpired = d => d && new Date(d) < new Date()

  // Shared styles
  const cardStyle = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }
  const inputStyle = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', outline: 'none', color: '#fff' }

  return (
    <div className="min-h-screen flex" style={{ background: '#080c18' }}>

      {/* ══════════════════════════
          SIDEBAR
      ══════════════════════════ */}
      <aside className={`${sideOpen ? 'w-56' : 'w-16'} flex-shrink-0 flex flex-col transition-all duration-200 border-r`}
        style={{ background: 'rgba(5,8,18,0.98)', borderColor: 'rgba(255,255,255,0.08)', position: 'sticky', top: 0, height: '100vh' }}>

        {/* Logo */}
        <div className="p-4 border-b flex items-center justify-center gap-3" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <img src={logoImg} alt="Acme AI" className="h-20 mt-5 object-contain" />

        </div>

        {/* Nav items */}
        <nav className="flex-1 p-3 space-y-1">
          {[{ id: 'main', label: 'MAIN' }, ...NAV.slice(0, 2), { id: 'review', label: 'REVIEW' }, NAV[2]].map((item, i) => {
            if (item.label && !item.icon) return sideOpen ? (
              <p key={i} className="text-[12px] font-black text-gray-200 uppercase tracking-widest px-2 pt-4 pb-1">{item.label}</p>
            ) : <div key={i} className="h-4" />
            return (
              <button key={item.id} onClick={() => setNav(item.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition-all"
                style={nav === item.id
                  ? { background: 'rgba(37,99,235,0.20)', color: 'white', border: '1px solid rgba(59,130,246,0.30)' }
                  : { color: '#ffffff', border: '1px solid transparent' }}>
                <span className="text-base flex-shrink-0">{item.icon}</span>
                {sideOpen && <span>{item.label}</span>}
              </button>
            )
          })}
        </nav>

        {/* Collapse + logout */}
        <div className="p-3 border-t space-y-2" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <button onClick={() => setSideOpen(p => !p)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xm font-bold text-gray-100 hover:text-gray-200 transition-colors">
            <span>{sideOpen ? '◀' : '▶'}</span>
            {sideOpen && <span>Collapse</span>}
          </button>
          <button onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-5 rounded-xl text-xm font-bold text-gray-100 hover:text-red-400 transition-colors">
            <span>🚪</span>
            {sideOpen && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* ══════════════════════════
          MAIN CONTENT
      ══════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <header className="border-b px-6 py-4 flex items-center justify-between flex-shrink-0"
          style={{ background: 'rgba(5,8,18,0.95)', borderColor: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' }}>
          <div>
            <h1 className="text-3xl font-black text-white capitalize">{nav === 'dashboard' ? 'Dashboard Overview' : nav === 'jobs' ? 'Job Postings' : 'Candidates'}</h1>
            <p className="text-xs font-medium text-gray-100">HR Administration Panel</p>
          </div>
          <div className="flex items-center gap-3">
            {nav === 'jobs' && (
              <button onClick={() => { setShowModal(true); setModalStep(1) }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black text-white transition-all"
                style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', boxShadow: '0 0 20px rgba(37,99,235,0.40)' }}>
                + New Job Posting
              </button>
            )}
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black text-white"
              style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)' }}>HR</div>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-6">

          {/* ════ DASHBOARD ════ */}
          {nav === 'dashboard' && (
            <div>
              {/* Stats */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[
                  { label: 'Total Jobs', value: stats.totalJobs, color: '#60a5fa', icon: '💼' },
                  { label: 'Total Candidates', value: stats.totalCandidates, color: '#a78bfa', icon: '👥' },
                  { label: 'Shortlisted (≥80%)', value: stats.shortlisted, color: '#4ade80', icon: '⭐' },
                  { label: 'Pending Review', value: stats.pending, color: '#fbbf24', icon: '🕐' },
                ].map((s, i) => (
                  <div key={i} className="rounded-2xl p-5" style={cardStyle}>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-2xl">{s.icon}</span>
                      <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                    </div>
                    <p className="text-3xl font-black" style={{ color: s.color }}>{s.value}</p>
                    <p className="text-xs font-bold text-gray-100 mt-1 uppercase tracking-wider">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Recent jobs */}
              <div className="rounded-2xl p-6 mb-6" style={cardStyle}>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-2xl font-black text-white">Recent Job Postings</h2>
                  <button onClick={() => setNav('jobs')} className="text-xm font-bold text-blue-400 hover:underline">View all →</button>
                </div>
                <div className="space-y-3">
                  {jobs.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-4xl mb-3">💼</p>
                      <p className="text-gray-300 font-semibold">
                        No jobs created yet
                      </p>
                    </div>
                  ) : (
                    jobs.slice(0, 4).map(job => (
                      <div key={job.id} className="flex items-center justify-between p-4 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div>
                          <p className="text-xl font-bold text-white">{job.title}</p>
                          <p className="text-xm font-medium text-gray-300">{job.department} · {job.level} · Closes {fmt(job.closes_at)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-gray-200">{job.applicants || 0} applied</span>
                          <span className="text-xs font-bold px-2.5 py-1 rounded-lg"
                            style={job.status === 'published' && !isExpired(job.closes_at)
                              ? { background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }
                              : { background: 'rgba(239,68,68,0.10)', color: '#f87171', border: '1px solid rgba(239,68,68,0.22)' }}>
                            {job.status === 'published' && !isExpired(job.closes_at) ? 'Live' : isExpired(job.closes_at) ? 'Expired' : 'Draft'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Recent candidates */}
              <div className="rounded-2xl p-6" style={cardStyle}>
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-2xl font-black text-white">Recent Candidates</h2>
                  <button onClick={() => setNav('candidates')} className="text-sm font-bold text-blue-400 hover:underline">View all →</button>
                </div>
                {candidates.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-4xl mb-3">👥</p>
                    <p className="text-gray-300 text-sm font-semibold">No candidates yet</p>
                    <p className="text-gray-400 text-xs mt-1">Candidates will appear here after they complete interviews</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {candidates.slice(0, 5).map(c => {
                      const ds = DECISION_STYLE[c.hr_decision] || DECISION_STYLE.under_review
                      return (
                        <div key={c.id}
                          onClick={() => { setNav('candidates'); setTimeout(() => { setSelCandidate(c); setHrNote(c.hr_note || '') }, 100) }}
                          className="flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all hover:bg-white/5"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                              style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)' }}>
                              {c.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-white truncate">{c.full_name}</p>
                              <p className="text-xs font-medium text-gray-400 truncate">{c.job_title} · {fmt(c.submitted_at)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                            <span className="text-sm font-black"
                              style={{ color: c.score >= 80 ? '#4ade80' : c.score >= 60 ? '#60a5fa' : '#f87171' }}>
                              {c.score}%
                            </span>
                            <span className="text-[11px] font-bold px-2 py-1 rounded-lg hidden sm:block"
                              style={{ background: ds.bg, color: ds.color, border: `1px solid ${ds.border}` }}>
                              {ds.label}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════ JOB POSTINGS ════ */}
          {nav === 'jobs' && (
            <div>
              <div className="space-y-4">
                {jobs.length === 0 ? (
                  <div
                    className="rounded-2xl p-12 text-center"
                    style={cardStyle}
                  >
                    <p className="text-5xl mb-4">📄</p>

                    <p className="text-xl font-black text-white mb-2">
                      No job postings yet
                    </p>

                    <p className="text-sm text-gray-400">
                      Create your first AI-powered interview
                    </p>
                  </div>
                ) : (
                  jobs.map(job => {
                    const expired = isExpired(job.closes_at)
                    return (
                      <div key={job.id} className="rounded-2xl p-6" style={cardStyle}>
                        <div className="flex items-start justify-between flex-wrap gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 flex-wrap mb-1">
                              <h3 className="font-black text-white text-lg">{job.title}</h3>
                              <span className="text-xs font-bold px-2.5 py-1 rounded-lg"
                                style={job.status === 'published' && !expired
                                  ? { background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }
                                  : expired
                                    ? { background: 'rgba(239,68,68,0.10)', color: '#f87171', border: '1px solid rgba(239,68,68,0.22)' }
                                    : { background: 'rgba(234,179,8,0.10)', color: '#fbbf24', border: '1px solid rgba(234,179,8,0.22)' }}>
                                {expired ? 'Expired' : job.status === 'published' ? 'Live' : 'Draft'}
                              </span>
                            </div>
                            <p className="text-sm font-semibold text-gray-300">{job.department} · {job.level} · {job.work_type}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {!expired && (
                              <button onClick={() => toggleJobStatus(job)}
                                className="px-3 py-2 rounded-xl text-xm font-bold transition-all"
                                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', color: '#9ca3af' }}>
                                {job.status === 'published' ? 'Unpublish' : 'Publish'}
                              </button>
                            )}
                            <button onClick={() => setNav('candidates')}
                              className="px-3 py-2 rounded-xl text-xm font-bold transition-all"
                              style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)', color: '#60a5fa' }}>
                              View Candidates
                            </button>
                            <button onClick={() => deleteJob(job)}
                              className="px-3 py-2 rounded-xl text-xm font-bold transition-all"
                              style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                              🗑 Delete
                            </button>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-4 mt-4 text-xs font-semibold text-gray-200">
                          <span>👥 {job.applicants || 0} applicants</span>
                          <span>❓ {job.num_questions} questions</span>
                          <span>⏱ {job.time_limit} min total</span>
                          <span>📅 Closes {fmt(job.closes_at)}</span>
                          {expired && <span className="text-red-400">⚠ Removed from candidate portal</span>}
                        </div>

                        {(job.questions?.length > 0) && (
                          <div className="mt-4 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                            <p className="text-xs font-bold text-gray-300 mb-2">QUESTIONS PREVIEW</p>
                            <div className="space-y-2">
                              {job.questions.slice(0, 2).map((q, i) => (
                                <div key={i} className="p-3 rounded-xl text-xs" style={{ background: 'rgba(255,255,255,0.03)' }}>
                                  <span className="font-bold text-gray-300">Q{i + 1}. </span>
                                  <textarea
                                    value={q.question}
                                    readOnly
                                    className="w-full bg-transparent text-gray-200 outline-none resize-none"
                                    rows={2}
                                  />
                                  <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold" style={{ background: 'rgba(59,130,246,0.15)', color: '#93c5fd' }}>{q.type}</span>
                                </div>
                              ))}
                              {job.questions.length > 2 && <p className="text-xs text-gray-300">+{job.questions.length - 2} more questions</p>}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {/* ════ CANDIDATES ════ */}
          {nav === 'candidates' && (
            <div className="flex gap-6">
              {/* Left: candidate list */}
              <div className="flex-1 min-w-0">
                {/* Filters */}
                <div className="flex flex-wrap gap-3 mb-5">
                  <select value={filterJob} onChange={e => setFilterJob(e.target.value)}
                    className="px-3 py-2 rounded-xl text-xm font-bold cursor-pointer"
                    style={{ ...inputStyle, colorScheme: 'dark' }}>
                    {jobTitles.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <select value={filterDecision} onChange={e => setFilterDecision(e.target.value)}
                    className="px-3 py-2 rounded-xl text-xm font-bold cursor-pointer"
                    style={{ ...inputStyle, colorScheme: 'dark' }}>
                    {['All', 'shortlisted', 'under_review', 'approved', 'rejected'].map(s => (
                      <option key={s} value={s}>{s === 'All' ? 'All Status' : DECISION_STYLE[s]?.label}</option>
                    ))}
                  </select>
                  <span className="text-xs font-bold text-gray-300 self-center">{filteredCandidates.length} candidates</span>
                </div>

                {/* Table */}
                <div className="rounded-2xl overflow-hidden" style={cardStyle}>
                  {/* Header */}
                  <div className="grid grid-cols-12 gap-3 px-5 py-3 text-[10px] font-black text-white uppercase tracking-widest border-b"
                    style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                    <div className="col-span-4">Candidate</div>
                    <div className="col-span-3">Score</div>
                    <div className="col-span-2">Time</div>
                    <div className="col-span-3">Status</div>
                  </div>

                  {filteredCandidates.map(c => {
                    const ds = DECISION_STYLE[c.hr_decision] || DECISION_STYLE.under_review
                    const isSelected = selCandidate?.id === c.id
                    return (
                      <div key={c.id} onClick={() => { setSelCandidate(c); setHrNote(c.hr_note || '') }}
                        className="grid grid-cols-12 gap-3 px-5 py-4 cursor-pointer transition-all border-b items-center"
                        style={{ borderColor: 'rgba(255,255,255,0.05)', background: isSelected ? 'rgba(37,99,235,0.10)' : 'transparent' }}>
                        <div className="col-span-4 flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)' }}>
                            {c.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">{c.full_name}</p>
                            <p className="text-[11px] font-medium text-gray-300 truncate">{c.email}</p>
                          </div>
                        </div>
                        <div className="col-span-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                              <div className="h-full rounded-full" style={{ width: `${c.score}%`, background: c.score >= 80 ? '#4ade80' : c.score >= 60 ? '#60a5fa' : '#f87171' }} />
                            </div>
                            <span className="text-xs font-black" style={{ color: c.score >= 80 ? '#4ade80' : c.score >= 60 ? '#60a5fa' : '#f87171' }}>{c.score}%</span>
                          </div>
                        </div>
                        <div className="col-span-2"><span className="text-sm font-semibold text-gray-300">{c.time_taken || '—'}m</span></div>
                        <div className="col-span-3">
                          <span className="text-[11px] font-bold px-2 py-1 rounded-lg" style={{ background: ds.bg, color: ds.color, border: `1px solid ${ds.border}` }}>
                            {ds.label}
                          </span>
                        </div>
                      </div>
                    )
                  })}

                  {filteredCandidates.length === 0 && (
                    <div className="text-center py-16">
                      <p className="text-gray-200 font-semibold">No candidates found</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: candidate detail panel */}
              {selCandidate && (
                <div className="w-80 flex-shrink-0">
                  <div className="rounded-2xl p-5 sticky top-0" style={cardStyle}>
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xm font-black text-white"
                          style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)' }}>
                          {selCandidate.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <p className="text-sm font-black text-white">{selCandidate.full_name}</p>
                          <p className="text-[11px] font-medium text-gray-200">{selCandidate.job_title}</p>
                        </div>
                      </div>
                      <button onClick={() => setSelCandidate(null)} className="text-gray-300 hover:text-white text-lg leading-none">×</button>
                    </div>

                    {/* Score */}
                    <div className="p-4 rounded-xl text-center mb-4"
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <p className="text-4xl font-black mb-1" style={{ color: selCandidate.score >= 80 ? '#4ade80' : selCandidate.score >= 60 ? '#60a5fa' : '#f87171' }}>
                        {selCandidate.score}%
                      </p>
                      <p className="text-xs font-bold text-gray-200">Total Score</p>
                      <div className="flex justify-around mt-3 text-xs">
                        <div><p className="font-black text-white">{selCandidate.time_taken || '—'}m</p><p className="text-gray-300">Time</p></div>
                        <div><p className="font-black text-white">{fmt(selCandidate.submitted_at)}</p><p className="text-gray-300">Date</p></div>
                      </div>
                    </div>

                    {/* HR Note */}
                    <div className="mb-4">
                      <label className="text-[10px] font-black text-gray-100 uppercase tracking-widest block mb-1.5">HR Note / Interview Message</label>
                      <textarea value={hrNote} onChange={e => setHrNote(e.target.value)} rows={3}
                        placeholder="Add a note or interview invite message..."
                        className="w-full rounded-xl px-3 py-2.5 text-xs text-white resize-none"
                        style={inputStyle} />
                    </div>

                    {/* Decision buttons */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-gray-100 uppercase tracking-widest">HR Decision</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => updateDecision(selCandidate.candidate_id, selCandidate.id, 'approved', hrNote)}
                          className="py-2.5 rounded-xl text-xs font-black text-white transition-all"
                          style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.30)', color: '#4ade80' }}>
                          ✓ Approve
                        </button>
                        <button onClick={() => updateDecision(selCandidate.candidate_id, selCandidate.id, 'rejected', hrNote)}
                          className="py-2.5 rounded-xl text-xs font-black transition-all"
                          style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.28)', color: '#f87171' }}>
                          ✗ Reject
                        </button>
                        <button onClick={() => updateDecision(selCandidate.candidate_id, selCandidate.id, 'shortlisted', hrNote)}
                          className="col-span-2 py-2.5 rounded-xl text-xs font-black transition-all"
                          style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.28)', color: '#60a5fa' }}>
                          ⭐ Move to Shortlist
                        </button>
                      </div>
                    </div>

                    {/* Current status */}
                    <div className="mt-3 p-3 rounded-xl text-center"
                      style={{ background: DECISION_STYLE[selCandidate.hr_decision]?.bg, border: `1px solid ${DECISION_STYLE[selCandidate.hr_decision]?.border}` }}>
                      <p className="text-xs font-black" style={{ color: DECISION_STYLE[selCandidate.hr_decision]?.color }}>
                        Current: {DECISION_STYLE[selCandidate.hr_decision]?.label}
                      </p>
                    </div>

                    {/* Send Email button */}
                    {selCandidate.hr_decision && selCandidate.email && (
                      <div className="mt-3">
                        <button
                          onClick={sendEmail}
                          disabled={emailStatus === 'sending'}
                          className="w-full py-2.5 rounded-xl text-xs font-black transition-all"
                          style={{
                            background: emailStatus === 'sending' ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.15)',
                            border: '1px solid rgba(99,102,241,0.35)',
                            color: emailStatus === 'sending' ? '#818cf8' : '#a5b4fc',
                            opacity: emailStatus === 'sending' ? 0.7 : 1,
                          }}>
                          {emailStatus === 'sending' ? '📧 Sending...' : '📧 Send Email to Candidate'}
                        </button>
                        {emailStatus === 'sent' && (
                          <p className="text-center text-xs font-bold mt-1.5" style={{ color: '#4ade80' }}>✅ Email sent successfully</p>
                        )}
                        {emailStatus === 'error' && (
                          <p className="text-center text-xs font-bold mt-1.5" style={{ color: '#f87171' }}>⚠️ Failed to send — check backend logs</p>
                        )}
                      </div>
                    )}

                    {/* View Full Profile button */}
                    {selCandidate.candidate_id && (
                      <button
                        onClick={() => fetchCandProfile(selCandidate.candidate_id)}
                        className="mt-3 w-full py-2.5 rounded-xl text-xs font-black text-white transition-all hover:brightness-110"
                        style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)' }}>
                        👤 View Full Profile
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ══════════════════════════
          CANDIDATE PROFILE MODAL
      ══════════════════════════ */}
      {(candProfile || loadingProfile) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-2xl rounded-2xl overflow-hidden" style={{ background: '#0d1120', border: '1px solid rgba(255,255,255,0.10)', maxHeight: '90vh', overflowY: 'auto' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'linear-gradient(135deg,rgba(30,58,138,0.30),rgba(37,99,235,0.10))' }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black text-white"
                  style={{ background: 'linear-gradient(135deg,#1e40af,#3b82f6)' }}>
                  {candProfile?.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '??'}
                </div>
                <div>
                  <p className="text-base font-black text-white">{candProfile?.full_name || '—'}</p>
                  <p className="text-xs font-medium text-gray-300">{candProfile?.email || selCandidate?.email}</p>
                </div>
              </div>
              <button onClick={() => setCandProfile(null)} className="text-gray-300 hover:text-white text-2xl leading-none">×</button>
            </div>

            {loadingProfile ? (
              <div className="flex items-center justify-center py-20">
                <span className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin inline-block" />
              </div>
            ) : (
              <div className="p-6 space-y-5">

                {/* Personal Details */}
                <div>
                  <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-3">📋 Personal Details</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { l: 'Email',   v: candProfile?.email },
                      { l: 'Phone',   v: candProfile?.phone },
                      { l: 'Gender',  v: candProfile?.gender },
                      { l: 'Address', v: candProfile?.address },
                    ].map((item, i) => (
                      <div key={i} className={`p-3 rounded-xl ${item.l === 'Address' ? 'col-span-2' : ''}`}
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mb-1">{item.l}</p>
                        <p className="text-sm font-semibold text-white">{item.v || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Education */}
                <div>
                  <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-3">🎓 Education</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { l: 'Degree',       v: candProfile?.education?.degree },
                      { l: 'Field of Study', v: candProfile?.education?.field_of_study },
                      { l: 'Institution',  v: candProfile?.education?.institution },
                      { l: 'Passing Year', v: candProfile?.education?.end_year },
                      { l: 'CGPA / GPA',   v: candProfile?.education?.gpa },
                    ].map((item, i) => (
                      <div key={i} className={`p-3 rounded-xl ${item.l === 'Institution' ? 'col-span-2' : ''}`}
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mb-1">{item.l}</p>
                        <p className="text-sm font-semibold text-white">{item.v || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Skills */}
                <div>
                  <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-3">🛠 Skills</p>
                  <div className="p-4 rounded-xl flex flex-wrap gap-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    {(!candProfile?.skills || candProfile.skills.length === 0)
                      ? <p className="text-sm text-gray-300">No skills listed</p>
                      : candProfile.skills.map((s, i) => (
                        <span key={i} className="px-3 py-1.5 rounded-xl text-xs font-bold text-blue-300"
                          style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.28)' }}>{s}</span>
                      ))}
                  </div>
                </div>

                {/* Experience */}
                <div>
                  <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-3">💼 Experience</p>
                  {(!candProfile?.experience || candProfile.experience.length === 0)
                    ? (
                      <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <p className="text-sm text-gray-300">Fresher — No prior experience</p>
                      </div>
                    ) : candProfile.experience.map((exp, i) => (
                      <div key={i} className="p-4 rounded-xl mb-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <p className="font-bold text-white text-sm">{exp.job_title}</p>
                        <p className="text-xs font-semibold text-blue-300 mt-0.5">{exp.company} · {exp.start} – {exp.end || 'Present'}</p>
                        {exp.description && <p className="text-xs font-medium text-gray-300 mt-2">{exp.description}</p>}
                      </div>
                    ))}
                </div>

                {/* Interview Answers */}
                {selCandidate?.answers?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-3">📝 Interview Answers — {selCandidate.job_title}</p>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {selCandidate.answers.map((a, i) => {
                        const isOpen   = (a.type || '').toLowerCase().includes('open') || (a.type || '').toLowerCase().includes('text')
                        const isCorrect = !isOpen && (a.answer || '').trim().toLowerCase() === (a.correct_answer || '').trim().toLowerCase()
                        const aiScore  = isOpen ? Math.round((a.points || 0) * 10) : null
                        return (
                          <div key={i} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="text-xs font-semibold text-gray-200 flex-1 leading-relaxed">
                                <span className="text-gray-400 font-bold mr-1">Q{i + 1}.</span>{a.question}
                              </p>
                              {isOpen
                                ? <span className="text-xs font-black flex-shrink-0" style={{ color: aiScore >= 7 ? '#4ade80' : aiScore >= 4 ? '#fbbf24' : '#f87171' }}>{aiScore}/10</span>
                                : <span className="text-sm font-black flex-shrink-0" style={{ color: isCorrect ? '#4ade80' : '#f87171' }}>{isCorrect ? '✓' : '✗'}</span>
                              }
                            </div>
                            {a.answer && <p className="text-[11px] text-blue-300 mt-1">Answer: {a.answer}</p>}
                            {!isOpen && !isCorrect && a.correct_answer && (
                              <p className="text-[11px] text-green-400 mt-0.5">Correct: {a.correct_answer}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════
          JOB CREATION MODAL
      ══════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(8px)' }}>
          <div className="w-full max-w-2xl rounded-2xl overflow-hidden" style={{ background: '#0d1120', border: '1px solid rgba(255,255,255,0.10)', maxHeight: '90vh', overflowY: 'auto' }}>

            {/* Modal header */}
            <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <div>
                <h2 className="text-lg font-black text-white">Create New Job Posting</h2>
                <p className="text-xs font-medium text-gray-300">Step {modalStep} of 3 — {['Job Details', 'Question Types', 'Review & Publish'][modalStep - 1]}</p>
              </div>
              {/* Step dots */}
              <div className="flex items-center gap-2">
                {[1, 2, 3].map(s => (
                  <div key={s} className="h-2 rounded-full transition-all" style={{ width: s === modalStep ? '2rem' : '0.5rem', background: s <= modalStep ? '#2563eb' : 'rgba(255,255,255,0.10)' }} />
                ))}
                <button onClick={() => { setShowModal(false); setModalStep(1); setJobForm(EMPTY_JOB); setQuestions([]); setPdfFile(null) }}
                  className="ml-3 text-gray-300 hover:text-white text-xl leading-none transition-colors">×</button>
              </div>
            </div>

            <div className="p-6">


              {/* STEP 1: Job details */}
              {modalStep === 1 && (
                <div className="space-y-5">

                  {/* PDF Upload */}
                  <div>
                    <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest block mb-1.5">
                      Upload Job Description (PDF)
                    </label>

                    <label
                      className="w-full flex flex-col items-center justify-center gap-2 py-8 rounded-2xl cursor-pointer transition-all"
                      style={
                        pdfFile
                          ? {
                            background: 'rgba(34,197,94,0.06)',
                            border: '2px dashed rgba(34,197,94,0.40)',
                          }
                          : {
                            background: 'rgba(255,255,255,0.03)',
                            border: '2px dashed rgba(255,255,255,0.15)',
                          }
                      }
                    >
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        disabled={pdfParsing}
                        onChange={e => {
                          const f = e.target.files?.[0]
                          if (f) parsePDFWithGemini(f)
                          e.target.value = ''
                        }}
                      />

                      {pdfParsing ? (
                        <>
                          <span className="w-6 h-6 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />

                          <span className="text-sm font-bold text-blue-300">
                            Reading JD with AI...
                          </span>
                        </>
                      ) : pdfFile ? (
                        <>
                          <span className="text-3xl">✅</span>

                          <span className="text-sm font-bold text-green-400">
                            {pdfFile.name}
                          </span>

                          <span className="text-xs text-gray-300">
                            AI extracted title, department & description
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-3xl">📄</span>

                          <span className="text-sm font-bold text-gray-300">
                            Drop JD PDF here or click to upload
                          </span>

                          <span className="text-xs text-gray-400">
                            AI will extract title, department & description automatically
                          </span>
                        </>
                      )}
                    </label>
                  </div>

                  {/* FORM */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    {/* TITLE */}
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest block mb-1.5">
                        Job Title *
                      </label>

                      <input
                        type="text"
                        value={jobForm.title}
                        onChange={e =>
                          setJobForm(p => ({
                            ...p,
                            title: e.target.value,
                          }))
                        }
                        placeholder="e.g. Frontend Engineer"
                        className="w-full rounded-xl px-4 py-3 text-sm"
                        style={inputStyle}
                      />
                    </div>

                    {/* DEPARTMENT */}
                    <div>
                      <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest block mb-1.5">
                        Department
                      </label>

                      <select
                        value={jobForm.department}
                        onChange={e =>
                          setJobForm(p => ({
                            ...p,
                            department: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl px-4 py-3 text-sm cursor-pointer"
                        style={{ ...inputStyle, colorScheme: 'dark' }}
                      >
                        {DEPTS.map(d => (
                          <option key={d}>{d}</option>
                        ))}
                      </select>
                    </div>

                    {/* WORK TYPE */}
                    <div>
                      <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest block mb-1.5">
                        Work Type
                      </label>

                      <select
                        value={jobForm.work_type}
                        onChange={e =>
                          setJobForm(p => ({
                            ...p,
                            work_type: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl px-4 py-3 text-sm cursor-pointer"
                        style={{ ...inputStyle, colorScheme: 'dark' }}
                      >
                        {WORK_TYPES.map(w => (
                          <option key={w}>{w}</option>
                        ))}
                      </select>
                    </div>

                    {/* DESCRIPTION */}
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest block mb-1.5">
                        Job Description *
                      </label>

                      <textarea
                        value={jobForm.description}
                        onChange={e =>
                          setJobForm(p => ({
                            ...p,
                            description: e.target.value,
                          }))
                        }
                        placeholder="Describe the role, required skills, responsibilities..."
                        rows={4}
                        className="w-full rounded-xl px-4 py-3 text-sm resize-none"
                        style={inputStyle}
                      />
                    </div>

                    {/* QUESTIONS */}
                    <div>
                      <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest block mb-1.5">
                        No. of Questions
                      </label>

                      <input
                        type="number"
                        value={jobForm.num_questions}
                        onChange={e =>
                          setJobForm(p => ({
                            ...p,
                            num_questions: parseInt(e.target.value),
                          }))
                        }
                        min={3}
                        max={20}
                        className="w-full rounded-xl px-4 py-3 text-sm"
                        style={inputStyle}
                      />
                    </div>

                    {/* TIME */}
                    <div>
                      <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest block mb-1.5">
                        Total Exam Time (mins)
                      </label>

                      <input
                        type="number"
                        value={jobForm.time_limit}
                        onChange={e =>
                          setJobForm(p => ({
                            ...p,
                            time_limit: parseInt(e.target.value),
                          }))
                        }
                        min={1}
                        max={180}
                        className="w-full rounded-xl px-4 py-3 text-sm"
                        style={inputStyle}
                      />
                    </div>

                    {/* CLOSING DATE */}
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-black text-gray-300 uppercase tracking-widest block mb-1.5">
                        Closing Date *
                      </label>

                      <input
                        type="date"
                        value={jobForm.closes_at}
                        onChange={e =>
                          setJobForm(p => ({
                            ...p,
                            closes_at: e.target.value,
                          }))
                        }
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full rounded-xl px-4 py-3 text-sm"
                        style={{ ...inputStyle, colorScheme: 'dark' }}
                      />
                    </div>
                  </div>

                  {/* QUESTION FOCUS + DIFFICULTY */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                    {/* QUESTION FOCUS */}
                    <div
                      className="rounded-2xl p-5"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(59,130,246,0.18)',
                      }}
                    >
                      <h3 className="text-sm font-black text-blue-400 uppercase tracking-wide mb-4">
                        🎯 Question Focus
                      </h3>

                      <div className="space-y-3">

                        {[
                          {
                            key: 'Practical Coding',
                            icon: '💻',
                            desc: 'Real-world coding & implementation',
                          },
                          {
                            key: 'Debugging',
                            icon: '🐞',
                            desc: 'Find and fix code issues',
                          },
                          {
                            key: 'Scenario Based',
                            icon: '💬',
                            desc: 'Problem solving scenarios',
                          },
                          {
                            key: 'System Design',
                            icon: '🏗',
                            desc: 'Architecture & scalability',
                          },
                          {
                            key: 'Theory Heavy',
                            icon: '📘',
                            desc: 'Concepts & theoretical knowledge',
                          },
                          {
                            key: 'Balanced',
                            icon: '⚖',
                            desc: 'Mix of all important types',
                          },
                        ].map(item => {
                          const active =
                            jobForm.question_focus?.includes(item.key)

                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => {
                                const current =
                                  jobForm.question_focus || []

                                const updated = active
                                  ? current.filter(v => v !== item.key)
                                  : [...current, item.key]

                                setJobForm(p => ({
                                  ...p,
                                  question_focus: updated,
                                }))
                              }}
                              className="w-full flex items-center justify-between p-3 rounded-xl transition-all"
                              style={
                                active
                                  ? {
                                    background:
                                      'rgba(37,99,235,0.15)',
                                    border:
                                      '1px solid rgba(59,130,246,0.45)',
                                  }
                                  : {
                                    background:
                                      'rgba(255,255,255,0.03)',
                                    border:
                                      '1px solid rgba(255,255,255,0.06)',
                                  }
                              }
                            >
                              <div className="flex items-center gap-3 text-left">
                                <div className="text-2xl">
                                  {item.icon}
                                </div>

                                <div>
                                  <p className="text-sm font-bold text-white">
                                    {item.key}
                                  </p>

                                  <p className="text-xs text-gray-400">
                                    {item.desc}
                                  </p>
                                </div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* DIFFICULTY */}
                    <div
                      className="rounded-2xl p-5"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(59,130,246,0.18)',
                      }}
                    >
                      <h3 className="text-sm font-black text-blue-400 uppercase tracking-wide mb-4">
                        📊 Difficulty Level
                      </h3>

                      <div className="space-y-3">

                        {[
                          {
                            key: 'Beginner',
                            exp: 'No experience',
                            desc: 'Freshers & fundamentals',
                          },

                          {
                            key: 'Intermediate',
                            exp: '1–3 years experience',
                            desc: 'Industry-level practical skills',
                          },

                          {
                            key: 'Senior',
                            exp: '5+ years experience',
                            desc: 'Architecture & leadership',
                          },
                        ].map(level => {
                          const active =
                            jobForm.level === level.key

                          return (
                            <button
                              key={level.key}
                              type="button"
                              onClick={() =>
                                setJobForm(p => ({
                                  ...p,
                                  level: level.key,
                                }))
                              }
                              className="w-full p-4 rounded-2xl text-left transition-all"
                              style={
                                active
                                  ? {
                                    background:
                                      'rgba(37,99,235,0.15)',
                                    border:
                                      '1px solid rgba(59,130,246,0.45)',
                                  }
                                  : {
                                    background:
                                      'rgba(255,255,255,0.03)',
                                    border:
                                      '1px solid rgba(255,255,255,0.06)',
                                  }
                              }
                            >
                              <h4 className="text-base font-black text-white">
                                {level.key}
                              </h4>

                              <p className="text-sm text-blue-300 mt-1">
                                {level.exp}
                              </p>

                              <p className="text-xs text-gray-400 mt-1">
                                {level.desc}
                              </p>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {/* NEXT BUTTON */}
                  <button
                    onClick={() => {
                      if (
                        !jobForm.title ||
                        !jobForm.description ||
                        !jobForm.closes_at
                      ) {
                        alert('Please fill all required fields.')
                        return
                      }

                      setModalStep(2)
                    }}
                    className="w-full py-4 rounded-xl text-sm font-black text-white"
                    style={{
                      background:
                        'linear-gradient(135deg,#1e3a8a,#2563eb)',
                      boxShadow:
                        '0 0 24px rgba(37,99,235,0.35)',
                    }}
                  >
                    Next: Select Question Types →
                  </button>
                </div>
              )}

              {/* STEP 2: Question types */}
              {modalStep === 2 && (
                <div className="space-y-5">
                  <p className="text-sm font-semibold text-gray-300">Select the types of questions to include in the interview:</p>
                  <div className="grid grid-cols-1 gap-3">
                    {Q_TYPES.map(qt => {
                      const selected = jobForm.question_types.includes(qt.id)
                      return (
                        <button key={qt.id} onClick={() => toggleQType(qt.id)}
                          className="p-4 rounded-xl text-left transition-all"
                          style={selected
                            ? { background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(59,130,246,0.40)' }
                            : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-black text-white text-sm">{qt.label}</p>
                              <p className="text-xs font-medium text-gray-200 mt-0.5">{qt.desc}</p>
                            </div>
                            <div className="w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 ml-3"
                              style={selected ? { background: '#2563eb' } : { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}>
                              {selected && <span className="text-white text-xs">✓</span>}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  <div className="p-4 rounded-xl" style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.18)' }}>
                    <p className="text-xs font-bold text-blue-300 mb-1">🤖 AI will generate {jobForm.num_questions} questions at <span style={{ color: '#93c5fd' }}>{jobForm.level}</span> level</p>
                    <p className="text-xs font-medium text-gray-200">
                      {jobForm.level === 'Beginner' && 'Fundamental concepts & basic syntax — suitable for 0–2 yrs experience.'}
                      {jobForm.level === 'Intermediate' && 'Practical application & design patterns — suitable for 2–5 yrs experience.'}
                      {jobForm.level === 'Senior' && 'System design, architecture & leadership scenarios — suitable for 5+ yrs experience.'}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => setModalStep(1)} className="flex-1 py-4 rounded-xl text-sm font-black text-gray-200"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>← Back</button>
                    <button onClick={generateQuestions} disabled={genLoading || jobForm.question_types.length === 0}
                      className="flex-[2] py-4 rounded-xl text-sm font-black text-white disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', boxShadow: '0 0 24px rgba(37,99,235,0.35)' }}>
                      {genLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Generating with AI...
                        </span>
                      ) : '🤖 Generate Questions with AI →'}
                    </button>
                  </div>
                </div>
              )}


              {/* STEP 3: Review questions */}
              {modalStep === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-gray-300">{questions.length} questions generated — review before publishing</p>
                    <button onClick={generateQuestions} disabled={genLoading}
                      className="text-xs font-bold text-blue-400 hover:underline disabled:opacity-50">
                      {genLoading ? 'Regenerating...' : '↻ Regenerate all'}
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
                    {questions.map((q, i) => (
                      <div key={i} className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <p className="text-sm font-semibold text-white flex-1">
                            <span className="text-gray-300 font-bold mr-2">Q{i + 1}.</span>{q.question}
                          </p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-[10px] font-black px-2 py-0.5 rounded"
                              style={{ background: 'rgba(59,130,246,0.15)', color: '#93c5fd' }}>{q.type}</span>
                            <button onClick={() => deleteQ(i)} className="text-gray-300 hover:text-red-400 text-xs transition-colors">✕</button>
                          </div>
                        </div>
                        {q.options && (
                          <div className="grid grid-cols-2 gap-1.5 mt-2">
                            {q.options.map((opt, oi) => (
                              <div key={oi} className="text-xs px-2.5 py-1.5 rounded-lg font-medium"
                                style={{ background: opt === q.correct_answer ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)', color: opt === q.correct_answer ? '#4ade80' : '#9ca3af', border: opt === q.correct_answer ? '1px solid rgba(34,197,94,0.25)' : '1px solid transparent' }}>
                                {opt === q.correct_answer ? '✓ ' : ''}{opt}
                              </div>
                            ))}
                          </div>
                        )}
                        {q.explanation && <p className="text-xs text-gray-300 mt-2 italic">{q.explanation}</p>}
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setModalStep(2)} className="flex-1 py-4 rounded-xl text-sm font-black text-gray-200"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>← Back</button>
                    <button onClick={publishJob} disabled={saveLoading}
                      className="flex-[2] py-4 rounded-xl text-sm font-black text-white disabled:opacity-60"
                      style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)', boxShadow: '0 0 24px rgba(34,197,94,0.35)' }}>
                      {saveLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Publishing...
                        </span>
                      ) : '🚀 Publish Job & Activate Interview'}
                    </button>
                    <button
                      onClick={downloadQuestionsPDF}
                      className="px-4 py-3 rounded-xl text-sm font-black text-white"
                      style={{
                        background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)',
                      }}
                    >
                      ⬇ Download PDF
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}