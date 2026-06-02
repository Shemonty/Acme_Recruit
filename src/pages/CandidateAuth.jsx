import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import bannerImg from '../images/banner.jpg'
import logoImg from '../images/logo.png'

const MOCK = { email: 'candidate@gmail.com', password: '1234' }
const TABS = { LOGIN: 'login', REGISTER: 'register' }
const EMPTY = {
  full_name: '', email: '', phone: '', dob: '', gender: '', address: '', city: '', country: 'Bangladesh',
  linkedin: '', portfolio: '', degree: '', institution: '', edu_start: '', edu_end: '', gpa: '',
  field_of_study: '', has_experience: 'no', job_title: '', company: '', exp_start: '', exp_end: '',
  exp_description: '', skills: '', cover_letter: '', password: '', confirm_password: '',
}

const IS = {
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.14)',
  backdropFilter: 'blur(10px)',
  WebkitBackdropFilter: 'blur(10px)',
  outline: 'none',
  boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.04)',
  colorScheme: 'dark',
}
const ic = `
  w-full
  rounded-2xl
  px-5
  py-4
  text-sm
  text-white
  placeholder-gray-500
  transition-all
  focus:outline-none
`
const lc = "block text-[13px] font-bold text-white uppercase tracking-widest mb-1.5"

function Inp({ label, ...p }) {
  return (
    <div>
      <label className={lc}>{label}</label>
      <input {...p} className={ic} style={IS}
        onFocus={e => e.target.style.border = '1px solid rgba(59,130,246,0.55)'}
        onBlur={e => e.target.style.border = '1px solid rgba(255,255,255,0.10)'} />
    </div>
  )
}

function Sel({ label, children, ...p }) {
  return (
    <div>
      <label className={lc}>{label}</label>
      <select {...p} className={`${ic} cursor-pointer`} style={{ ...IS, colorScheme: 'dark' }}>{children}</select>
    </div>
  )
}

function Txt({ label, ...p }) {
  return (
    <div>
      <label className={lc}>{label}</label>
      <textarea {...p} className={`${ic} resize-none`} style={IS}
        onFocus={e => e.target.style.border = '1px solid rgba(59,130,246,0.55)'}
        onBlur={e => e.target.style.border = '1px solid rgba(255,255,255,0.10)'} />
    </div>
  )
}

export default function CandidateAuth() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [tab, setTab] = useState(TABS.LOGIN)
  const [form, setForm] = useState(EMPTY)
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showRegPass, setShowRegPass] = useState(false)
  const [showConfirmPass, setShowConfirmPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState(1)
  const [phase, setPhase] = useState('auth')
  const [registeredEmail, setRegisteredEmail] = useState('')
  const [experiences, setExperiences] = useState([{ job_title: '', company: '', start: '', end: '', description: '' }])

  const set = (f, v) => { setForm(p => ({ ...p, [f]: v })); setError('') }

  function addExperience() {
    setExperiences(prev => [...prev, { job_title: '', company: '', start: '', end: '', description: '' }])
  }
  function removeExperience(i) {
    setExperiences(prev => prev.filter((_, idx) => idx !== i))
  }
  function setExp(i, field, value) {
    setExperiences(prev => prev.map((e, idx) => idx === i ? { ...e, [field]: value } : e))
  }

  // Where to go after successful auth
  function goAfterAuth() {
    if (jobId) {
      navigate(`/interview/${jobId}`)
    } else {
      navigate('/candidate/dashboard')
    }
  }

  async function handleLogin(e) {
    e.preventDefault(); setError(''); setLoading(true)

    // ── Mock login ──
    if (loginEmail === MOCK.email && loginPassword === MOCK.password) {
      const demoBase = {
        full_name: 'Demo Candidate',
        email: loginEmail,
        phone: '+880 1700 000000',
        gender: 'Male',
        address: 'Dhaka, Bangladesh',
        skills: ['React', 'JavaScript', 'Python'],
        education: { degree: "Bachelor's", institution: 'Demo University', field_of_study: 'Computer Science', end_year: '2024', gpa: '3.5' },
        experience: [],
      }
      try {
        const { data: existing } = await supabase
          .from('candidates')
          .select('id, full_name, email')
          .eq('email', loginEmail)
          .maybeSingle()
        if (existing) {
          sessionStorage.setItem('mock_candidate', JSON.stringify({ ...demoBase, id: existing.id }))
        } else {
          const { data: created, error: mockInsertErr } = await supabase
            .from('candidates')
            .insert({
              full_name: demoBase.full_name,
              email: demoBase.email,
              phone: demoBase.phone,
              gender: demoBase.gender,
              address: demoBase.address,
              skills: demoBase.skills,
              education: demoBase.education,
              experience: demoBase.experience,
            })
            .select('id')
            .single()
          if (mockInsertErr) console.error('Mock candidate insert failed:', mockInsertErr.message)
          sessionStorage.setItem('mock_candidate', JSON.stringify({ ...demoBase, id: created?.id }))
        }
      } catch {
        sessionStorage.setItem('mock_candidate', JSON.stringify(demoBase))
      }
      setTimeout(() => { setLoading(false); goAfterAuth() }, 1000)
      return
    }

    // ── Local mock profile (previously registered offline) ──
    const mockProfile = localStorage.getItem('mock_candidate')
    if (mockProfile) {
      const p = JSON.parse(mockProfile)
      if (p.email === loginEmail) {
        sessionStorage.setItem('mock_candidate', mockProfile)
        setTimeout(() => { setLoading(false); goAfterAuth() }, 1000)
        return
      }
    }

    // ── Real Supabase login ──
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword })
      if (error) {
        const msg = error.message.toLowerCase()
        if (msg.includes('email not confirmed'))
          setError('Please confirm your email first — check your inbox (and spam folder) for a confirmation link.')
        else if (msg.includes('invalid login credentials') || msg.includes('invalid email or password'))
          setError('Incorrect email or password.')
        else
          setError(error.message)
        return
      }
      const { data: p } = await supabase.from('candidates').select('id').eq('user_id', data.user.id).single()
      if (!p) { setError('No profile found. Please register.'); return }
      goAfterAuth()
    } catch { setError('Something went wrong.') }
    finally { setLoading(false) }
  }

  function validate(s) {
    if (s === 1) {
      if (!form.full_name.trim()) return 'Full name is required.'
      if (!form.email.trim()) return 'Email is required.'
      if (!form.phone.trim()) return 'Phone is required.'
      if (!form.dob) return 'Date of birth is required.'
      if (!form.gender) return 'Gender is required.'
      if (!form.city.trim()) return 'City is required.'
    }
    if (s === 2) {
      if (!form.degree) return 'Degree is required.'
      if (!form.institution.trim()) return 'Institution is required.'
      if (!form.field_of_study.trim()) return 'Field of study is required.'
      if (!form.edu_end) return 'Passing year is required.'
      if (!form.gpa.trim()) return 'CGPA / GPA is required.'
      const gpaNum = parseFloat(form.gpa)
      if (isNaN(gpaNum) || gpaNum < 0) return 'Please enter a valid CGPA / GPA (e.g. 3.75).'
      if (gpaNum > 5) return 'CGPA / GPA cannot exceed 5.00.'
      if (!form.skills.trim()) return 'At least one skill is required.'
    }
    if (s === 3) {
      if (!form.password || form.password.length < 8) return 'Password must be at least 8 characters.'
      if (form.password !== form.confirm_password) return 'Passwords do not match.'
    }
    return null
  }

  function next() { const e = validate(step); if (e) { setError(e); return } setError(''); setStep(s => s + 1) }

  async function handleRegister(e) {
    e.preventDefault()
    const err = validate(3); if (err) { setError(err); return }
    setLoading(true); setError('')

    if (form.email === MOCK.email) {
      setTimeout(() => { setLoading(false); goAfterAuth() }, 1000)
      return
    }

    const saveMockProfile = () => {
      localStorage.setItem('mock_candidate', JSON.stringify({
        full_name: form.full_name, email: form.email, phone: form.phone,
        dob: form.dob, gender: form.gender,
        address: `${form.address}, ${form.city}, ${form.country}`,
        linkedin: form.linkedin, portfolio: form.portfolio,
        education: { degree: form.degree, institution: form.institution, field_of_study: form.field_of_study, start_year: form.edu_start, end_year: form.edu_end, gpa: form.gpa },
        experience: form.has_experience === 'yes' ? experiences.filter(e => e.job_title || e.company) : [],
        skills: form.skills.split(',').map(s => s.trim()).filter(Boolean),
        cover_letter: form.cover_letter,
      }))
    }

    try {
      const { data, error: se } = await supabase.auth.signUp({ email: form.email, password: form.password })
      if (se) {
        const msg = se.message.toLowerCase()
        if (msg.includes('rate limit') || msg.includes('email rate limit')) {
          saveMockProfile()
          goAfterAuth()
          return
        }
        if (msg.includes('user already registered'))
          setError('An account with this email already exists. Please sign in instead.')
        else if (msg.includes('invalid email'))
          setError('Please enter a valid email address.')
        else
          setError(se.message)
        return
      }

      const fullPayload = {
        user_id: data.user.id,
        full_name: form.full_name,
        email: form.email,
        phone: form.phone,
        dob: form.dob || null,
        gender: form.gender || null,
        address: [form.address, form.city, form.country].filter(Boolean).join(', '),
        linkedin: form.linkedin || null,
        portfolio: form.portfolio || null,
        education: { degree: form.degree, institution: form.institution, field_of_study: form.field_of_study, start_year: form.edu_start, end_year: form.edu_end, gpa: form.gpa },
        experience: form.has_experience === 'yes' ? experiences.filter(e => e.job_title || e.company) : [],
        skills: form.skills.split(',').map(s => s.trim()).filter(Boolean),
        cover_letter: form.cover_letter || null,
      }

      let { error: insertErr } = await supabase.from('candidates').insert(fullPayload)

      if (insertErr) {
        console.error('Full candidates insert failed:', insertErr.message)
        const corePayload = {
          user_id: data.user.id,
          full_name: form.full_name,
          email: form.email,
          phone: form.phone,
          dob: form.dob || null,
          gender: form.gender || null,
        }
        const { error: coreErr } = await supabase.from('candidates').insert(corePayload)
        if (coreErr) {
          console.error('Core candidates insert also failed:', coreErr.message)
          setError(`Could not save your profile: ${coreErr.message}`)
          return
        }
      }

      // Check if Supabase requires email confirmation
      // If identities array is empty or session is null, email confirmation is needed
      const needsConfirmation = !data.session || data.user?.identities?.length === 0

      if (needsConfirmation) {
        setRegisteredEmail(form.email)
        setPhase('confirm_email')
      } else {
        // Auto-confirmed (e.g. local dev with email confirmation disabled)
        goAfterAuth()
      }
    } catch { setError('Registration failed. Try again.') }
    finally { setLoading(false) }
  }

  const stepInfo = [
    { icon: '👤', title: 'Personal Info' },
    { icon: '🎓', title: 'Education & Skills' },
    { icon: '💼', title: 'Experience & Account' },
  ]

  // ── Email confirmation screen ──
  if (phase === 'confirm_email') {
    return (
      <div className="relative min-h-screen overflow-hidden bg-black flex items-center justify-center p-4">
        <img src={bannerImg} alt="bg" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#070b16]/60 via-[#070b16]/70 to-[#050816]/60" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[180px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-md text-center">
          <img src={logoImg} alt="Acme AI" className="h-16 object-contain mx-auto mb-8" />

          <div className="rounded-[32px] px-10 py-10"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(20px)' }}>

            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6"
              style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.30)' }}>
              📧
            </div>

            <h2 className="text-2xl font-black text-white mb-3">Check your inbox</h2>
            <p className="text-gray-300 text-sm leading-relaxed mb-2">
              We sent a confirmation link to
            </p>
            <p className="text-blue-300 font-bold text-sm mb-5 break-all">{registeredEmail}</p>
            <p className="text-gray-400 text-xs leading-relaxed mb-8">
              Click the link in the email to verify your account, then come back here and sign in.
              Check your spam folder if you don't see it within a minute.
            </p>

            <button
              onClick={() => { setPhase('auth'); setTab(TABS.LOGIN); setLoginEmail(registeredEmail) }}
              className="w-full py-4 rounded-2xl text-sm font-black text-white mb-3"
              style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', boxShadow: '0 0 28px rgba(37,99,235,0.40)' }}>
              I've confirmed — Sign in →
            </button>

            <button
              onClick={() => supabase.auth.resend({ type: 'signup', email: registeredEmail })}
              className="w-full py-3 rounded-2xl text-sm font-bold text-gray-300 hover:text-white transition-colors"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)' }}>
              Resend confirmation email
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-black">

      {/* ── FULL PAGE BACKGROUND ── */}
      <img src={bannerImg} alt="bg" className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-black/0.1" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#070b16]/30 via-[#070b16]/50 to-[#050816]/40" />
      <div className="absolute inset-0 bg-gradient-to-br from-blue-950/30 via-transparent to-purple-950/20" />
      <div className="absolute top-1/2 left-1/3 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[180px] pointer-events-none" />

      {/* ── TOP LEFT: Back button ── */}
      <div className="absolute top-0 left-0 z-30 px-6 py-5">
        <a href="/"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:scale-[1.03]"
          style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.20)', backdropFilter: 'blur(14px)', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
          ← Back to jobs
        </a>
      </div>

      {/* ── MAIN LAYOUT ── */}
      <div className="relative z-10 min-h-screen flex items-center px-6 lg:px-10 xl:px-10 gap-5">

        {/* ── LEFT: Branding ── */}
        <div className="hidden lg:flex flex-col w-[45%] flex-shrink-0 justify-center relative -top-25 translate-x-10  pt-60 ml-20">
          <img src={logoImg} alt="Acme AI" className="h-20 object-contain mb-6 self-start drop-shadow-[0_0_30px_rgba(255,255,255,0.15)]" />

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-blue-300 text-xs font-bold mb-7 w-fit"
            style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.30)', backdropFilter: 'blur(10px)' }}>
            <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            Candidate Portal
          </div>

          <h1 className="text-6xl xl:text-7xl font-black text-white leading-[1.02] tracking-tight mb-5">
            Your next<br />opportunity<br />
            <span className="text-blue-400">starts here.</span>
          </h1>

          <p className="text-gray-200 text-base leading-relaxed max-w-md mb-12">
            Apply and take a short AI-powered interview. Get ranked instantly and hear back from HR within 3–5 business days.
          </p>

          {jobId && (
            <div className="inline-flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-green-300 w-fit"
              style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)' }}>
              🎯 You're applying for a specific role — sign in or register to continue
            </div>
          )}

          <p className="text-gray-300 text-xs mt-16">© 2026 Acme AI Ltd. All rights reserved.</p>
        </div>

        {/* ── RIGHT: Form Card ── */}
        <div className="
          w-full
          lg:w-[75%]
          flex
          justify-center
          items-center
          min-h-screen
          px-4 sm:px-8 lg:px-16
          py-16
        ">
          <div className="w-full max-w-[500px]">

            {/* Tab switcher */}
            <div className="flex rounded-2xl p-1 mb-1"
              style={{ background: 'rgba(10,15,50,0.95)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)' }}>
              {[TABS.LOGIN, TABS.REGISTER].map(t => (
                <button key={t} onClick={() => { setTab(t); setError(''); setStep(1) }}
                  className="flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-200"
                  style={tab === t ? {
                    background: 'linear-gradient(135deg, #1e3a8a, #2563eb)',
                    color: '#fff', boxShadow: '0 4px 18px rgba(37,99,235,0.45)'
                  } : { color: '#6b7280' }}>
                  {t === TABS.LOGIN ? 'Sign In' : 'Create Account'}
                </button>
              ))}
            </div>

            {/* Card */}
            <div className="relative overflow-hidden rounded-[32px] w-full max-w-[500px] px-8 sm:px-10 lg:px-14 py-10">

              {/* ═══ LOGIN ═══ */}
              {tab === TABS.LOGIN && (
                <div className="relative z-10">
                  <div className="mb-8 text-center">
                    <h2 className="text-5xl font-extrabold text-white mb-2">Welcome back</h2>
                    <p className="text-gray-300 text-sm">Sign in to your candidate dashboard</p>
                    {jobId && <p className="text-blue-400 text-xs font-semibold mt-2">Sign in to continue to your interview →</p>}
                  </div>
                  <form onSubmit={handleLogin} className="space-y-5">
                    <Inp label="Email Address" type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="you@email.com" required />
                    <div>
                      <label className={lc}>Password</label>
                      <div className="relative">
                        <input type={showPass ? 'text' : 'password'} value={loginPassword}
                          onChange={e => setLoginPassword(e.target.value)} placeholder="Your password"
                          required className={ic} style={{ ...IS, paddingRight: '4rem' }}
                          onFocus={e => e.target.style.border = '1px solid rgba(59,130,246,0.55)'}
                          onBlur={e => e.target.style.border = '1px solid rgba(255,255,255,0.10)'} />
                        <button type="button" onClick={() => setShowPass(!showPass)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-300 text-xs font-bold">
                          {showPass ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </div>
                    {error && <ErrBox msg={error} />}
                    <BigBtn loading={loading} label={jobId ? 'Sign in & Start Interview →' : 'Sign in →'} />
                  </form>
                  <p className="text-center text-sm text-gray-300 mt-6">
                    No account?{' '}
                    <button onClick={() => setTab(TABS.REGISTER)} className="text-blue-400 font-semibold hover:underline">Register here</button>
                  </p>
                </div>
              )}

              {/* ═══ REGISTER ═══ */}
              {tab === TABS.REGISTER && (
                <div className="relative z-10">

                  {/* Step indicator */}
                  <div className="flex items-center gap-2 mb-3">
                    {stepInfo.map((s, i) => {
                      const n = i + 1; const active = n === step; const done = n < step
                      return (
                        <div key={i} className="flex items-center flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 transition-all"
                              style={done
                                ? { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ade80' }
                                : active
                                ? { background: 'linear-gradient(135deg,#1e40af,#2563eb)', color: '#fff', boxShadow: '0 0 14px rgba(37,99,235,0.5)' }
                                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#4b5563' }}>
                              {done ? '✓' : s.icon}
                            </div>
                            <span className={`text-[10px] font-bold hidden sm:block truncate ${active ? 'text-white' : done ? 'text-green-400' : 'text-gray-300'}`}>
                              {s.title}
                            </span>
                          </div>
                          {i < 2 && <div className="flex-1 h-px mx-2" style={{ background: done ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.06)' }} />}
                        </div>
                      )
                    })}
                  </div>

                  {/* STEP 1 */}
                  {step === 1 && (
                    <div className="space-y-6">
                      <h2 className="text-lg font-bold text-white mb-4">Personal Information</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-2"><Inp label="Full Name *" type="text" value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="e.g. Sharif Rahman" /></div>
                        <Inp label="Email *" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@email.com" />
                        <Inp label="Phone *" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+880 1XXX XXXXXX" />
                        <Inp label="Date of Birth *" type="date" value={form.dob} onChange={e => set('dob', e.target.value)}
                          min={`${new Date().getFullYear() - 100}-01-01`}
                          max={new Date(Date.now() - 16 * 365.25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                        />
                        <Sel label="Gender *" value={form.gender} onChange={e => set('gender', e.target.value)}>
                          <option value="">Select gender</option>
                          <option>Male</option><option>Female</option><option>Non-binary</option><option>Prefer not to say</option>
                        </Sel>
                        <div className="col-span-2"><Inp label="Street Address" type="text" value={form.address} onChange={e => set('address', e.target.value)} placeholder="House, Road, Area" /></div>
                        <Inp label="City *" type="text" value={form.city} onChange={e => set('city', e.target.value)} placeholder="e.g. Dhaka" />
                        <Sel label="Country" value={form.country} onChange={e => set('country', e.target.value)}>
                          <option>Bangladesh</option><option>India</option><option>Pakistan</option><option>United Kingdom</option><option>United States</option><option>Other</option>
                        </Sel>
                        <Inp label="LinkedIn (optional)" type="url" value={form.linkedin} onChange={e => set('linkedin', e.target.value)} placeholder="linkedin.com/in/..." />
                        <Inp label="Portfolio (optional)" type="url" value={form.portfolio} onChange={e => set('portfolio', e.target.value)} placeholder="yoursite.com" />
                      </div>
                      {error && <ErrBox msg={error} />}
                      <button onClick={next} className="w-full mt-3 py-4 rounded-2xl text-sm font-bold text-white"
                        style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', boxShadow: '0 0 28px rgba(37,99,235,0.35)' }}>
                        Next: Education & Skills →
                      </button>
                    </div>
                  )}

                  {/* STEP 2 */}
                  {step === 2 && (
                    <div className="space-y-6">
                      <h2 className="text-lg font-bold text-white mb-4">Education & Skills</h2>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Sel label="Degree *" value={form.degree} onChange={e => set('degree', e.target.value)}>
                          <option value="">Select degree</option>
                          <option>SSC</option><option>HSC</option><option>Diploma</option><option>Bachelor's</option><option>Master's</option><option>PhD</option><option>Other</option>
                        </Sel>
                        <Inp label="Field of Study *" type="text" value={form.field_of_study} onChange={e => set('field_of_study', e.target.value)} placeholder="e.g. Computer Science" />
                        <div className="col-span-2"><Inp label="Institution Name *" type="text" value={form.institution} onChange={e => set('institution', e.target.value)} placeholder="e.g. BUET, NSU, BRAC University" /></div>
                        <Inp label="Start Year" type="text" inputMode="numeric" maxLength={4} value={form.edu_start}
                          onChange={e => set('edu_start', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2019" />
                        <Inp label="Passing Year *" type="text" inputMode="numeric" maxLength={4} value={form.edu_end}
                          onChange={e => set('edu_end', e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="2023" />
                        <div className="col-span-2"><Inp label="CGPA / GPA * (max 5.00)" type="text" inputMode="decimal" value={form.gpa}
                          onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) set('gpa', v) }}
                          placeholder="e.g. 3.75" /></div>
                        <div className="col-span-2">
                          <div>
                            <label className={lc}>Skills * <span className="normal-case text-gray-300 font-normal">(comma separated)</span></label>
                            <input type="text" value={form.skills} onChange={e => set('skills', e.target.value)}
                              placeholder="e.g. React, Python, SQL, Figma" className={ic} style={IS}
                              onFocus={e => e.target.style.border = '1px solid rgba(59,130,246,0.55)'}
                              onBlur={e => e.target.style.border = '1px solid rgba(255,255,255,0.10)'} />
                            {form.skills && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {form.skills.split(',').filter(s => s.trim()).map((s, i) => (
                                  <span key={i} className="px-2.5 py-1 rounded-lg text-xs font-semibold text-blue-300"
                                    style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.25)' }}>
                                    {s.trim()}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {error && <ErrBox msg={error} />}
                      <div className="flex gap-3">
                        <button onClick={() => { setStep(1); setError('') }} className="flex-1 py-4 rounded-2xl text-sm font-bold text-gray-200"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>← Back</button>
                        <button onClick={next} className="flex-[2] py-4 rounded-2xl text-sm font-bold text-white"
                          style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', boxShadow: '0 0 24px rgba(37,99,235,0.35)' }}>
                          Next: Experience →
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 3 */}
                  {step === 3 && (
                    <form onSubmit={handleRegister} className="space-y-6">
                      <h2 className="text-lg font-bold text-white mb-4">Experience & Account Setup</h2>

                      <div>
                        <label className={lc}>Work Experience?</label>
                        <div className="flex gap-3 mt-1">
                          {['yes', 'no'].map(v => (
                            <button key={v} type="button" onClick={() => set('has_experience', v)}
                              className="flex-1 py-2.5 rounded-xl text-xs font-bold transition-all"
                              style={form.has_experience === v
                                ? { background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', color: '#fff' }
                                : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af' }}>
                              {v === 'yes' ? '✓ Yes, experienced' : '✗ Fresher'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {form.has_experience === 'yes' && (
                        <div className="space-y-3">
                          {experiences.map((exp, i) => (
                            <div key={i} className="p-4 rounded-xl relative"
                              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)' }}>
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-black text-blue-300 uppercase tracking-widest">
                                  Experience {experiences.length > 1 ? `#${i + 1}` : ''}
                                </p>
                                {experiences.length > 1 && (
                                  <button type="button" onClick={() => removeExperience(i)}
                                    className="text-red-400 hover:text-red-300 text-lg leading-none font-bold">×</button>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <Inp label="Job Title" type="text" value={exp.job_title}
                                  onChange={e => setExp(i, 'job_title', e.target.value)} placeholder="e.g. Frontend Dev" />
                                <Inp label="Company" type="text" value={exp.company}
                                  onChange={e => setExp(i, 'company', e.target.value)} placeholder="Company name" />
                                <Inp label="Start" type="month" value={exp.start}
                                  onChange={e => setExp(i, 'start', e.target.value)} />
                                <Inp label="End (leave blank if current)" type="month" value={exp.end}
                                  onChange={e => setExp(i, 'end', e.target.value)} />
                                <div className="col-span-2">
                                  <Txt label="Role Description" value={exp.description}
                                    onChange={e => setExp(i, 'description', e.target.value)}
                                    placeholder="Briefly describe your responsibilities..." rows={2} />
                                </div>
                              </div>
                            </div>
                          ))}
                          <button type="button" onClick={addExperience}
                            className="w-full py-3 rounded-xl text-xs font-black transition-all"
                            style={{ background: 'rgba(59,130,246,0.08)', border: '1px dashed rgba(59,130,246,0.35)', color: '#60a5fa' }}>
                            + Add Another Company
                          </button>
                        </div>
                      )}

                      <Txt label="Cover Letter (optional)" value={form.cover_letter} onChange={e => set('cover_letter', e.target.value)} placeholder="Why are you a great fit for this role?" rows={2} />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className={lc}>Create Password *</label>
                          <div className="relative">
                            <input type={showRegPass ? 'text' : 'password'} value={form.password}
                              onChange={e => set('password', e.target.value)} placeholder="Min. 8 chars"
                              className={ic} style={{ ...IS, paddingRight: '3.5rem' }}
                              onFocus={e => e.target.style.border = '1px solid rgba(59,130,246,0.55)'}
                              onBlur={e => e.target.style.border = '1px solid rgba(255,255,255,0.10)'} />
                            <button type="button" onClick={() => setShowRegPass(!showRegPass)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 text-xs font-bold">
                              {showRegPass ? 'Hide' : 'Show'}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className={lc}>Confirm Password *</label>
                          <div className="relative">
                            <input type={showConfirmPass ? 'text' : 'password'} value={form.confirm_password}
                              onChange={e => set('confirm_password', e.target.value)}
                              placeholder="Re-enter" className={ic}
                              style={{ ...IS, paddingRight: '3.5rem', border: form.confirm_password && form.confirm_password !== form.password ? '1px solid rgba(239,68,68,0.6)' : form.confirm_password && form.confirm_password === form.password ? '1px solid rgba(34,197,94,0.6)' : IS.border }}
                              onFocus={e => e.target.style.border = '1px solid rgba(59,130,246,0.55)'}
                              onBlur={e => e.target.style.border = form.confirm_password && form.confirm_password !== form.password ? '1px solid rgba(239,68,68,0.6)' : form.confirm_password && form.confirm_password === form.password ? '1px solid rgba(34,197,94,0.6)' : '1px solid rgba(255,255,255,0.10)'} />
                            <button type="button" onClick={() => setShowConfirmPass(!showConfirmPass)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 text-xs font-bold">
                              {showConfirmPass ? 'Hide' : 'Show'}
                            </button>
                          </div>
                          {form.confirm_password && (
                            form.confirm_password === form.password
                              ? <p className="text-green-400 text-xs font-bold mt-1.5">✓ Passwords match</p>
                              : <p className="text-red-400 text-xs font-bold mt-1.5">✗ Passwords do not match</p>
                          )}
                        </div>
                      </div>

                      {error && <ErrBox msg={error} />}
                      <div className="flex gap-3 mt-2">
                        <button type="button" onClick={() => { setStep(2); setError('') }}
                          className="flex-1 py-4 rounded-2xl text-sm font-bold text-gray-200"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          ← Back
                        </button>
                        <button type="submit" disabled={loading}
                          className="flex-[2] py-4 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
                          style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', boxShadow: '0 0 24px rgba(37,99,235,0.35)' }}>
                          {loading ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Creating account...
                            </span>
                          ) : 'Complete Registration ✓'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ErrBox({ msg }) {
  return (
    <div className="flex items-start gap-2 p-3.5 rounded-xl text-red-400 text-xs"
      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
      <span>⚠</span><span>{msg}</span>
    </div>
  )
}

function BigBtn({ loading, label }) {
  return (
    <button type="submit" disabled={loading}
      className="w-full py-4 rounded-2xl text-sm font-bold text-white disabled:opacity-50"
      style={{ background: 'linear-gradient(135deg,#1e3a8a,#2563eb)', boxShadow: '0 0 28px rgba(37,99,235,0.4)' }}>
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          Signing in...
        </span>
      ) : label}
    </button>
  )
}