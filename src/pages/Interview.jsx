import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import logoImg from '../images/logo.png'
import bannerImg from '../images/banner.jpg'

const LEVEL_COLOR = {
  Beginner:     { text: '#4ade80', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.30)' },
  Intermediate: { text: '#60a5fa', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.30)' },
  Senior:       { text: '#fbbf24', bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.30)' },
}

// Normalise Gemini's inconsistent question type strings
function normalizeType(raw) {
  const t = (raw || '').toLowerCase().replace(/[_\s/]+/g, '')
  if (t === 'mcq' || t === 'multiplechoice') return 'MCQ'
  if (t.startsWith('true') || t === 'truefalse' || t === 'boolean') return 'True / False'
  if (t.includes('open') || t.includes('text') || t.includes('essay')) return 'Open Text'
  return raw // fallback — keep original
}

export default function Interview() {
  const { jobId } = useParams()
  const navigate  = useNavigate()

  const [phase, setPhase]         = useState('loading')
  const [job, setJob]             = useState(null)
  const [candidate, setCandidate] = useState(null)
  const [answers, setAnswers]     = useState({}) // { [qIndex]: answerString }
  const [timeLeft, setTimeLeft]   = useState(0)
  const [result, setResult]       = useState(null)

  const jobRef       = useRef(null)
  const candidateRef = useRef(null)
  const startRef     = useRef(null)
  const timerRef     = useRef(null)
  const timeLeftRef  = useRef(0)
  const answersRef   = useRef({})

  useEffect(() => { init() }, [])
  useEffect(() => () => clearInterval(timerRef.current), [])

  async function init() {
    try {
      const mock = sessionStorage.getItem('mock_candidate')
      let cand = null
      if (mock) {
        cand = JSON.parse(mock)
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { navigate('/'); return }
        const { data: prof } = await supabase.from('candidates').select('*').eq('user_id', user.id).single()
        if (!prof) { navigate('/'); return }
        cand = prof
      }
      setCandidate(cand)
      candidateRef.current = cand

      const { data: jobData } = await supabase.from('jobs').select('*').eq('id', jobId).single()
      if (!jobData?.questions?.length) {
        alert('This interview has no questions yet. Please check back later.')
        navigate('/candidate/dashboard')
        return
      }

      // ── Duplicate application guard ──
      // Check local session cache first (fast, works offline)
      const localApps = JSON.parse(sessionStorage.getItem('local_applications') || '[]')
      const alreadyAppliedLocally = localApps.some(a => a.job_id === jobId)
      if (alreadyAppliedLocally) {
        alert('You have already completed this interview. Check "My Applications" to see your result.')
        navigate('/candidate/dashboard')
        return
      }
      // Check Supabase if candidate has a real ID
      if (cand?.id) {
        const { data: existing } = await supabase
          .from('applications')
          .select('id')
          .eq('candidate_id', cand.id)
          .eq('job_id', jobId)
          .maybeSingle()
        if (existing) {
          alert('You have already completed this interview. Check "My Applications" to see your result.')
          navigate('/candidate/dashboard')
          return
        }
      }
      setJob(jobData)
      jobRef.current = jobData
      setPhase('intro')
    } catch (e) {
      console.error(e)
      navigate('/candidate/dashboard')
    }
  }

  function startInterview() {
    setAnswers({})
    answersRef.current = {}
    startRef.current = Date.now()
    setPhase('interview')
    // Start full-exam countdown
    const totalSecs = (jobRef.current.time_limit || 30) * 60
    timeLeftRef.current = totalSecs
    setTimeLeft(totalSecs)
    timerRef.current = setInterval(() => {
      timeLeftRef.current--
      setTimeLeft(timeLeftRef.current)
      if (timeLeftRef.current <= 0) {
        clearInterval(timerRef.current)
        // Auto-submit with whatever answers are recorded so far
        const qs = jobRef.current.questions
        const finalAnswers = qs.map((q, i) => ({
          id: q.id, question: q.question, type: q.type,
          answer: answersRef.current[i] || '',
          correct_answer: q.correct_answer, explanation: q.explanation,
        }))
        scoreInterview(finalAnswers)
      }
    }, 1000)
  }

  async function callGemini(body) {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY
    if (!apiKey) throw new Error('No API key')
    const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
    let lastErr
    for (const model of models) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      )
      if (res.ok) return res.json()
      const err = await res.json()
      lastErr = err?.error?.message || 'API error'
      if (res.status !== 429 && res.status !== 503) break
    }
    throw new Error(lastErr)
  }

  function submitAll() {
    clearInterval(timerRef.current)
    const finalAnswers = jobRef.current.questions.map((q, i) => ({
      id: q.id,
      question: q.question,
      type: q.type,
      answer: answers[i] || '',
      correct_answer: q.correct_answer,
      explanation: q.explanation,
    }))
    scoreInterview(finalAnswers)
  }

  async function scoreInterview(finalAnswers) {
    setPhase('scoring')
    const totalMin = Math.max(1, Math.round((Date.now() - startRef.current) / 60000))

    const scored = finalAnswers.map(a => {
      const normType = normalizeType(a.type)
      if (normType !== 'Open Text') {
        const ok = a.answer?.trim().toLowerCase() === a.correct_answer?.trim().toLowerCase()
        return { ...a, type: normType, points: ok ? 1 : 0 }
      }
      return { ...a, type: normType, points: 0 }
    })

    const openQs = scored.filter(a => a.type === 'Open Text')
    if (openQs.length > 0) {
      try {
        const prompt = `You are a strict technical interviewer grading open-ended interview answers.
Grade each answer from 0 to 10. Be objective:
  0 = blank or completely wrong
  5 = partially correct
  10 = accurate, complete, well-explained

${openQs.map((q, i) => `[${i + 1}] Question: ${q.question}
Expected: ${q.explanation}
Candidate answered: "${q.answer || '(blank)'}"
`).join('\n')}

Return ONLY a JSON array of integer scores in the same order, e.g. [7, 3, 9]. No extra text.`

        const data = await callGemini({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 64 }
        })
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]'
        const aiScores = JSON.parse(raw.replace(/```json|```/g, '').trim())
        let si = 0
        scored.forEach(a => {
          if (normalizeType(a.type) === 'Open Text') { a.points = (aiScores[si++] || 0) / 10 }
        })
      } catch { /* open text stays 0 if AI fails */ }
    }

    const total = scored.reduce((s, a) => s + a.points, 0)
    const score = Math.round((total / scored.length) * 100)
    const hrDecision = score >= 80 ? 'shortlisted' : 'under_review'

    // ── Insert application ──
    const basePayload = {
      candidate_id: candidateRef.current?.id || null,
      job_id: jobId,
      score,
      time_taken: totalMin,
      hr_decision: hrDecision,
      submitted_at: new Date().toISOString(),
      answers: scored,
    }
    let insertedId = null
    try {
      const { data: ins, error } = await supabase.from('applications').insert({
        ...basePayload,
        candidate_name: candidateRef.current?.full_name || null,
        candidate_email: candidateRef.current?.email || null,
      }).select('id').single()
      if (error) {
        const { data: ins2 } = await supabase.from('applications').insert(basePayload).select('id').single()
        insertedId = ins2?.id
      } else {
        insertedId = ins?.id
      }
    } catch {
      try {
        const { data: ins3 } = await supabase.from('applications').insert(basePayload).select('id').single()
        insertedId = ins3?.id
      } catch { /* offline */ }
    }

    // ── Rank calculation: rank all submissions for this job by score desc ──
    let myRank = null
    try {
      const { data: allApps } = await supabase
        .from('applications')
        .select('id, score')
        .eq('job_id', jobId)
        .order('score', { ascending: false })

      if (allApps?.length) {
        // Assign rank 1 = highest score; ties share the same rank
        let rank = 0, prevScore = null, sameCount = 0
        const rankMap = {}
        for (const app of allApps) {
          if (app.score !== prevScore) { rank += sameCount + 1; sameCount = 0 } else { sameCount++ }
          rankMap[app.id] = rank
          prevScore = app.score
        }
        // Persist ranks back to Supabase in bulk (best-effort)
        const updates = allApps.map(app => supabase
          .from('applications')
          .update({ rank: rankMap[app.id] })
          .eq('id', app.id)
        )
        await Promise.allSettled(updates)
        myRank = insertedId ? rankMap[insertedId] : null
      }
    } catch { /* rank calc is non-critical */ }

    // ── Increment applicants count on the job ──
    try {
      const { data: jobRow } = await supabase
        .from('jobs').select('applicants').eq('id', jobId).single()
      await supabase
        .from('jobs')
        .update({ applicants: (jobRow?.applicants || 0) + 1 })
        .eq('id', jobId)
    } catch { /* non-critical */ }

    // ── Update local cache with real rank ──
    try {
      const cached = JSON.parse(sessionStorage.getItem('local_applications') || '[]')
      const deduped = cached.filter(a => a.job_id !== jobId)
      deduped.push({
        id: insertedId || `local-${Date.now()}`,
        job_id: jobId,
        job_title: jobRef.current.title,
        department: jobRef.current.department,
        score,
        rank: myRank,
        time_taken: totalMin,
        hr_decision: hrDecision,
        submitted_at: new Date().toISOString(),
      })
      sessionStorage.setItem('local_applications', JSON.stringify(deduped))
    } catch { /* storage unavailable */ }

    setResult({ score, totalMin, hrDecision, scored, rank: myRank })
    setPhase('result')
  }

  const lc           = LEVEL_COLOR[job?.level] ?? LEVEL_COLOR.Intermediate
  const answeredCount = Object.values(answers).filter(v => v !== undefined && v !== '').length
  const inputSt      = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', outline: 'none', color: '#fff' }
  const fmtTime      = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const totalSecs    = (job?.time_limit || 0) * 60
  const timerPct     = totalSecs > 0 ? timeLeft / totalSecs : 1
  const timerClr     = timerPct > 0.5 ? '#4ade80' : timerPct > 0.2 ? '#fbbf24' : '#f87171'

  return (
    <div className="min-h-screen relative" style={{ background: '#080c18' }}>

      {/* BG */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <img src={bannerImg} alt="" className="w-full h-full object-cover opacity-20" />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,rgba(7,11,22,0.96) 0%,rgba(8,12,24,0.92) 100%)' }} />
      </div>

      <div className="relative z-10">

        {/* ══ LOADING ══ */}
        {phase === 'loading' && (
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
              <span className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin inline-block mb-4" />
              <p className="text-gray-300 text-sm font-medium">Loading interview...</p>
            </div>
          </div>
        )}

        {/* ══ INTRO ══ */}
        {phase === 'intro' && job && (
          <div className="min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-lg">

              <div className="flex justify-center mb-8">
                <img src={logoImg} alt="Acme AI" className="h-16 object-contain" />
              </div>

              <div className="rounded-2xl overflow-hidden" style={{ background: '#0d1120', border: '1px solid rgba(255,255,255,0.10)' }}>

                <div className="p-6 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'linear-gradient(135deg,rgba(30,58,138,0.30),rgba(37,99,235,0.12))' }}>
                  <span className="text-xs font-black px-3 py-1 rounded-full inline-block mb-3"
                    style={{ background: lc.bg, border: `1px solid ${lc.border}`, color: lc.text }}>
                    {job.level} Level
                  </span>
                  <h1 className="text-2xl font-black text-white mb-1">{job.title}</h1>
                  <p className="text-sm font-semibold text-gray-300">{job.department} · {job.work_type}</p>
                </div>

                <div className="p-6">
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    {[
                      { icon: '❓', label: 'Questions',  value: job.questions.length },
                      { icon: '⏱', label: 'Total Time',  value: `${job.time_limit} min` },
                      { icon: '🎯', label: 'Pass Score',  value: '80%' },
                    ].map((s, i) => (
                      <div key={i} className="text-center p-4 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div className="text-xl mb-1">{s.icon}</div>
                        <p className="text-xl font-black text-white">{s.value}</p>
                        <p className="text-[10px] font-bold text-gray-300 uppercase tracking-wider mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="p-4 rounded-xl mb-6"
                    style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.20)' }}>
                    <p className="text-xs font-black text-blue-300 mb-2">📋 Interview Rules</p>
                    <ul className="space-y-1.5">
                      {[
                        `You have ${job.time_limit} minutes total — the timer starts when you click Start.`,
                        'All questions appear on one page — you can review before submitting.',
                        'Score ≥ 80% to be automatically shortlisted.',
                        'MCQ & True/False are auto-graded. Open text is reviewed by AI.',
                      ].map((r, i) => (
                        <li key={i} className="text-xs font-medium text-gray-300 flex gap-2">
                          <span className="text-blue-400 flex-shrink-0">·</span>{r}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button onClick={startInterview}
                    className="w-full py-4 rounded-xl text-base font-black text-white transition-all hover:brightness-110"
                    style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', boxShadow: '0 0 28px rgba(37,99,235,0.40)' }}>
                    Start Interview →
                  </button>
                  <button onClick={() => navigate('/candidate/dashboard')}
                    className="w-full mt-3 py-3 rounded-xl text-sm font-bold text-gray-400 hover:text-white transition-colors">
                    ← Back to Dashboard
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ INTERVIEW — all questions on one page ══ */}
        {phase === 'interview' && job && (
          <div className="min-h-screen flex flex-col">

            {/* Sticky top bar */}
            <div className="sticky top-0 z-20 border-b px-6 py-3 flex items-center justify-between flex-shrink-0"
              style={{ background: 'rgba(5,8,18,0.96)', borderColor: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)' }}>
              <div className="flex items-center gap-3">
                <img src={logoImg} alt="" className="h-10 object-contain" />
                <div className="h-4 w-px" style={{ background: 'rgba(255,255,255,0.15)' }} />
                <span className="text-xs font-black text-gray-200 hidden sm:block">{job.title}</span>
              </div>
              <div className="flex items-center gap-4">
                {/* Countdown timer */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${timerClr}50` }}>
                  <span className="text-xs font-bold text-gray-400">⏱</span>
                  <span className="text-sm font-black tabular-nums" style={{ color: timerClr }}>{fmtTime(timeLeft)}</span>
                </div>
                <span className="text-xs font-bold text-gray-300">
                  <span className="text-white font-black">{answeredCount}</span> / {job.questions.length} answered
                </span>
                <button onClick={submitAll}
                  className="px-5 py-2 rounded-xl text-sm font-black text-white transition-all hover:brightness-110"
                  style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)' }}>
                  Submit →
                </button>
              </div>
            </div>

            {/* Timer progress bar */}
            <div className="h-1 flex-shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full transition-all duration-1000"
                style={{ width: `${timerPct * 100}%`, background: timerClr, boxShadow: `0 0 8px ${timerClr}80` }} />
            </div>

            {/* All questions */}
            <div className="flex-1 px-4 py-8">
              <div className="max-w-2xl mx-auto space-y-6">

                {job.questions.map((q, i) => {
                  const ans      = answers[i]
                  const answered = ans !== undefined && ans !== ''
                  return (
                    <div key={i} className="rounded-2xl p-6 transition-all duration-200"
                      style={{ background: '#0d1120', border: `1px solid ${answered ? 'rgba(59,130,246,0.40)' : 'rgba(255,255,255,0.10)'}` }}>

                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-[10px] font-black px-2.5 py-1 rounded-lg"
                          style={{ background: 'rgba(59,130,246,0.15)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.25)' }}>
                          {q.type}
                        </span>
                        <span className="text-[10px] font-bold text-gray-400">Question {i + 1} of {job.questions.length}</span>
                        {answered && <span className="text-[10px] font-black text-green-400 ml-auto">✓ Answered</span>}
                      </div>

                      <p className="text-lg font-bold text-white leading-relaxed mb-5">{q.question}</p>

                      {/* MCQ */}
                      {normalizeType(q.type) === 'MCQ' && q.options && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {q.options.map((opt, j) => (
                            <button key={j}
                              onClick={() => { answersRef.current[i] = opt; setAnswers(prev => ({ ...prev, [i]: opt })) }}
                              className="p-4 rounded-xl text-left text-sm font-semibold transition-all"
                              style={ans === opt
                                ? { background: 'rgba(37,99,235,0.22)', border: '2px solid rgba(59,130,246,0.60)', color: '#fff' }
                                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: '#d1d5db' }}>
                              <span className="font-black text-blue-400 mr-2">{String.fromCharCode(65 + j)}.</span>{opt}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* True / False */}
                      {normalizeType(q.type) === 'True / False' && (
                        <div className="grid grid-cols-2 gap-4">
                          {['True', 'False'].map(opt => (
                            <button key={opt}
                              onClick={() => { answersRef.current[i] = opt; setAnswers(prev => ({ ...prev, [i]: opt })) }}
                              className="py-8 rounded-xl text-lg font-black transition-all"
                              style={ans === opt
                                ? {
                                    background: opt === 'True' ? 'rgba(34,197,94,0.20)' : 'rgba(239,68,68,0.20)',
                                    border: `2px solid ${opt === 'True' ? 'rgba(34,197,94,0.60)' : 'rgba(239,68,68,0.60)'}`,
                                    color: opt === 'True' ? '#4ade80' : '#f87171',
                                  }
                                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.10)', color: '#9ca3af' }}>
                              {opt === 'True' ? '✓  True' : '✗  False'}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Open Text */}
                      {normalizeType(q.type) === 'Open Text' && (
                        <textarea value={ans || ''} rows={4}
                          onChange={e => { answersRef.current[i] = e.target.value; setAnswers(prev => ({ ...prev, [i]: e.target.value })) }}
                          placeholder="Type your answer here..."
                          className="w-full rounded-xl px-4 py-3 text-sm resize-none"
                          style={inputSt} />
                      )}
                    </div>
                  )
                })}

                {/* Bottom submit button */}
                <div className="pt-2 pb-8">
                  <button onClick={submitAll}
                    className="w-full py-4 rounded-xl text-base font-black text-white transition-all hover:brightness-110"
                    style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', boxShadow: '0 0 28px rgba(37,99,235,0.40)' }}>
                    🚀 Submit Interview ({answeredCount}/{job.questions.length} answered)
                  </button>
                  {answeredCount < job.questions.length && (
                    <p className="text-center text-xs font-medium mt-2" style={{ color: 'rgba(251,191,36,0.75)' }}>
                      {job.questions.length - answeredCount} question{job.questions.length - answeredCount !== 1 ? 's' : ''} unanswered — you can still submit
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ SCORING ══ */}
        {phase === 'scoring' && (
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center max-w-sm px-4">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
                style={{ background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(59,130,246,0.30)' }}>
                <span className="w-8 h-8 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin inline-block" />
              </div>
              <h2 className="text-2xl font-black text-white mb-2">Evaluating Your Answers</h2>
              <p className="text-sm font-medium text-gray-300 leading-relaxed">
                AI is reviewing your open-text responses.<br />This takes a few seconds...
              </p>
            </div>
          </div>
        )}

        {/* ══ RESULT ══ */}
        {phase === 'result' && result && job && (
          <div className="min-h-screen py-10 px-4">
            <div className="max-w-2xl mx-auto">

              <div className="flex justify-center mb-8">
                <img src={logoImg} alt="Acme AI" className="h-14 object-contain" />
              </div>

              <div className="rounded-2xl overflow-hidden mb-4"
                style={{ background: '#0d1120', border: '1px solid rgba(255,255,255,0.10)' }}>

                <div className="p-8 text-center border-b"
                  style={{
                    borderColor: 'rgba(255,255,255,0.08)',
                    background: result.score >= 80
                      ? 'linear-gradient(135deg,rgba(22,163,74,0.18),rgba(34,197,94,0.06))'
                      : 'linear-gradient(135deg,rgba(30,58,138,0.25),rgba(37,99,235,0.08))'
                  }}>
                  <p className="text-8xl font-black mb-3"
                    style={{ color: result.score >= 80 ? '#4ade80' : result.score >= 60 ? '#60a5fa' : '#f87171' }}>
                    {result.score}%
                  </p>
                  <p className="text-lg font-black text-white mb-1">
                    {result.score >= 80
                      ? '🎉 Excellent! You\'re auto-shortlisted'
                      : result.score >= 60
                      ? '👍 Good effort — Under HR Review'
                      : '📚 Keep practising — Under HR Review'}
                  </p>
                  <p className="text-sm font-medium text-gray-300">{job.title} · {result.totalMin} min taken</p>
                </div>

                <div className="p-6">
                  <div className="grid grid-cols-4 gap-3 mb-5">
                    {[
                      { l: 'Your Score', v: `${result.score}%`,
                        c: result.score >= 80 ? '#4ade80' : result.score >= 60 ? '#60a5fa' : '#f87171' },
                      { l: 'Your Rank',  v: result.rank ? `#${result.rank}` : '—', c: '#e2e8f0' },
                      { l: 'Time Taken', v: `${result.totalMin} min`, c: '#e2e8f0' },
                      { l: 'Status',     v: result.hrDecision === 'shortlisted' ? 'Shortlisted' : 'Under Review',
                        c: result.hrDecision === 'shortlisted' ? '#4ade80' : '#fbbf24' },
                    ].map((s, i) => (
                      <div key={i} className="text-center p-3 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <p className="text-xl font-black mb-0.5" style={{ color: s.c }}>{s.v}</p>
                        <p className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">{s.l}</p>
                      </div>
                    ))}
                  </div>

                  {result.hrDecision === 'shortlisted' ? (
                    <div className="p-4 rounded-xl mb-5"
                      style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.28)' }}>
                      <p className="text-xs font-black text-green-400 mb-1">⭐ Auto-Shortlisted</p>
                      <p className="text-sm font-medium text-gray-200">
                        Congratulations! Your score exceeded the 80% threshold. HR will review your profile and get in touch with next steps.
                      </p>
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl mb-5"
                      style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.20)' }}>
                      <p className="text-xs font-black text-blue-300 mb-1">🕐 Under HR Review</p>
                      <p className="text-sm font-medium text-gray-200">
                        Your submission has been recorded. HR will review your answers and notify you of their decision soon.
                      </p>
                    </div>
                  )}

                  <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-3">Answer Breakdown</p>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {result.scored.map((a, i) => {
                      const isOpen  = a.type === 'Open Text'
                      const correct = !isOpen && a.answer?.trim().toLowerCase() === a.correct_answer?.trim().toLowerCase()
                      const aiScore = isOpen ? Math.round(a.points * 10) : null
                      return (
                        <div key={i} className="p-3 rounded-xl"
                          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          <div className="flex items-start justify-between gap-3 mb-1">
                            <p className="text-xs font-semibold text-gray-200 flex-1 leading-relaxed">
                              <span className="text-gray-400 font-bold mr-1">Q{i + 1}.</span>{a.question}
                            </p>
                            {isOpen ? (
                              <span className="text-xs font-black flex-shrink-0 tabular-nums"
                                style={{ color: aiScore >= 7 ? '#4ade80' : aiScore >= 4 ? '#fbbf24' : '#f87171' }}>
                                {aiScore}/10
                              </span>
                            ) : (
                              <span className="text-sm font-black flex-shrink-0"
                                style={{ color: correct ? '#4ade80' : '#f87171' }}>
                                {correct ? '✓' : '✗'}
                              </span>
                            )}
                          </div>
                          {!isOpen && !correct && a.correct_answer && (
                            <p className="text-[11px] text-green-400 font-medium mt-1">
                              Correct answer: {a.correct_answer}
                            </p>
                          )}
                          {isOpen && a.answer && (
                            <p className="text-[11px] text-gray-400 mt-1 italic truncate">Your answer: {a.answer}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <button onClick={() => navigate('/candidate/dashboard')}
                className="w-full py-4 rounded-xl text-base font-black text-white transition-all hover:brightness-110"
                style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', boxShadow: '0 0 24px rgba(37,99,235,0.35)' }}>
                ← Back to Dashboard
              </button>

            </div>
          </div>
        )}

      </div>
    </div>
  )
}