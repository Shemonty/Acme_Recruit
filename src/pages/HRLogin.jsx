import { useState } from 'react'
import { supabase } from '../lib/supabase'
import bannerImg from '../images/banner.jpg'
import logoImg from '../images/logo.png'

const STEPS = {
  LOGIN: 'login',
  CHANGE_PASSWORD: 'change_password',
  SUCCESS: 'success',
}

const MOCK_HR = {
  email: 'admin@gmail.com',
  password: '1234',
}

export default function HRLogin() {
  const [step, setStep] = useState(STEPS.LOGIN)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [showPass, setShowPass] = useState(false)
  const [showNewPass, setShowNewPass] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()

    setError('')
    setLoading(true)

    if (email === MOCK_HR.email && password === MOCK_HR.password) {
      setTimeout(() => {
        sessionStorage.setItem('mock_hr', 'true')
        setLoading(false)
        window.location.href = '/hr/dashboard'
      }, 1000)

      return
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        setError('Invalid email or password.')
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from('hr_users')
        .select('*')
        .eq('user_id', data.user.id)
        .single()

      if (!profile) {
        setError('No HR access. Contact your administrator.')
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      if (profile.must_change_password) {
        setStep(STEPS.CHANGE_PASSWORD)
      } else {
        window.location.href = '/hr/dashboard'
      }
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault()

    setError('')

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) {
        setError(error.message)
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      await supabase
        .from('hr_users')
        .update({
          must_change_password: false,
        })
        .eq('user_id', user.id)

      setStep(STEPS.SUCCESS)

      setTimeout(() => {
        window.location.href = '/hr/dashboard'
      }, 2000)
    } catch {
      setError('Failed to update password.')
    } finally {
      setLoading(false)
    }
  }

  function getStrength(pass) {
    if (!pass) return { score: 0, label: '', color: '' }

    let s = 0

    if (pass.length >= 8) s++
    if (/[A-Z]/.test(pass)) s++
    if (/[0-9]/.test(pass)) s++
    if (/[^A-Za-z0-9]/.test(pass)) s++

    const m = [
      ,
      { label: 'Weak', color: 'bg-red-500' },
      { label: 'Fair', color: 'bg-yellow-500' },
      { label: 'Good', color: 'bg-blue-500' },
      { label: 'Strong', color: 'bg-green-500' },
    ]

    return { score: s, ...m[s] }
  }

  const strength = getStrength(newPassword)

  const inputStyle = {
    background: '#d9deea',
    border: '1px solid rgba(255,255,255,0.04)',
    outline: 'none',
    color: '#111827',
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-black">

      {/* BACKGROUND IMAGE */}
      <img
        src={bannerImg}
        alt="background"
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* OVERLAYS */}
      <div className="absolute inset-0 bg-black/0.10" />

      <div className="absolute inset-0 bg-gradient-to-r from-[#070b16]/20 via-[#070b16]/45 to-[#050816]/10" />

      <div className="absolute inset-0 bg-gradient-to-br from-blue-950/30 via-transparent to-purple-950/10" />

      {/* GLOW */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-blue-600/10 rounded-full blur-[180px]" />

      {/* TOP BAR */}
      <div className="absolute top-0 left-0 w-full z-30 px-6 lg:px-10 py-6 flex items-center justify-between">

        

        {/* BACK BUTTON */}
        <a
          href="/"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-300 hover:scale-[1.03]"
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.18)',
            backdropFilter: 'blur(14px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          ← Back to site
        </a>
      </div>

      {/* MAIN CONTENT */}
     <div className="relative z-10 min-h-screen flex items-center justify-between gap-6 xl:gap-5 px-6 lg:px-5 xl:px-60 pt-10">
        
        
        
        {/* LEFT CONTENT */}
        <div className="hidden lg:flex w-[52%] flex-col justify-center pr-6 xl:pr-10">
         <img
    src={logoImg}
    alt="Acme AI"
    className="h-24 object-contain mb-10 mr-150 dpx_rgba(255,25rop-shadow-[0_0_305,255,0.22)]"
  />
       
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-blue-300 text-xs font-semibold mb-7 w-fit"
            style={{
              background: 'rgba(59,130,246,0.15)',
              border: '1px solid rgba(59,130,246,0.3)',
              backdropFilter: 'blur(10px)',
            }}
          >
            
            <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            HR Portal
          </div>

          <h1 className="text-6xl xl:text-7xl font-black text-white leading-[1.02] tracking-tight mb-6">
            Manage
            <br />
            recruitment
            <br />
            <span className="text-blue-400">
              powered by AI.
            </span>
          </h1>

          <p className="text-gray-300 text-lg leading-relaxed max-w-xl mb-12">
            Post jobs, generate AI interview questions, review candidates,
            automate scoring, and make smarter hiring decisions all in one platform.
          </p>

          <p className="text-gray-300 text-sm mt-20">
            © 2026 Acme AI Ltd. All rights reserved.
          </p>
        </div>

        {/* RIGHT CARD */}
        <div className="w-full lg:w-1/2 flex justify-center lg:justify-end">

          <div
            className="w-full max-w-[500px] rounded-[32px] px-9 py-10 relative overflow-hidden"
             style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.18)',
            backdropFilter: 'blur(14px)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
          >

            {/* INNER GLOW */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent pointer-events-none" />

            
            {/* LOGIN */}
            {step === STEPS.LOGIN && (
              <>
                <div className="mb-10 relative z-10 text-center">

                  <h1 className="text-[42px] leading-none font-extrabold text-white mb-4 tracking-tight">
                    HR Portal Sign In
                  </h1>

                  <p className="text-gray-300 text-[15px]">
                    Use the credentials sent by your administrator
                  </p>
                </div>

                <form
                  onSubmit={handleLogin}
                  className="space-y-5 relative z-10"
                >

                  {/* EMAIL */}
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-300 uppercase tracking-[0.18em] mb-3">
                      Email Address
                    </label>

                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="hr@acmeai.tech"
                      required
                      className="w-full rounded-2xl px-5 py-4 text-[15px] font-medium placeholder-gray-500 transition-all"
                      style={inputStyle}
                    />
                  </div>

                  {/* PASSWORD */}
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-300 uppercase tracking-[0.18em] mb-3">
                      Password
                    </label>

                    <div className="relative">

                      <input
                        type={showPass ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Your password"
                        required
                        className="w-full rounded-2xl px-5 py-4 pr-16 text-[15px] font-medium placeholder-gray-500 transition-all"
                        style={inputStyle}
                      />

                      <button
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                        className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-200 text-sm font-semibold"
                      >
                        {showPass ? 'Hide' : 'Show'}
                      </button>

                    </div>
                  </div>

                  {/* ERROR */}
                  {error && (
                    <div
                      className="flex items-start gap-2 p-4 rounded-2xl text-red-300 text-sm"
                      style={{
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.18)',
                      }}
                    >
                      <span>⚠</span>
                      <span>{error}</span>
                    </div>
                  )}

                  {/* BUTTON */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 rounded-2xl text-[15px] font-bold text-white transition-all duration-300 hover:brightness-110 disabled:opacity-50"
                    style={{
                      background:
                        'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 55%, #2563eb 100%)',
                      boxShadow:
                        '0 0 35px rgba(37,99,235,0.35), 0 8px 30px rgba(0,0,0,0.45)',
                    }}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Signing in...
                      </span>
                    ) : (
                      'Sign in to HR Portal →'
                    )}
                  </button>

                  {/* HELP BOX */}
                  <div
                    className="p-4 rounded-2xl text-xs text-gray-200"
                    style={{
                      background: 'rgba(255,255,255,0.015)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <span className="font-semibold text-gray-300">
                      New team member?
                    </span>{' '}
                    -  Ask your admin for login credentials.
                  </div>

                </form>
              </>
            )}

            {/* CHANGE PASSWORD */}
            {step === STEPS.CHANGE_PASSWORD && (
              <>
                <div className="mb-8 text-center">

                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl mx-auto mb-4"
                    style={{
                      background: 'rgba(234,179,8,0.12)',
                      border: '1px solid rgba(234,179,8,0.22)',
                    }}
                  >
                    🔐
                  </div>

                  <h1 className="text-2xl font-bold text-white mb-2">
                    Set your password
                  </h1>

                  <p className="text-gray-200 text-sm">
                    Create a secure password to continue.
                  </p>
                </div>

                <form
                  onSubmit={handleChangePassword}
                  className="space-y-5"
                >

                  <div>
                    <label className="block text-[12px] font-semibold text-gray-300 uppercase tracking-[0.18em] mb-3">
                      New Password
                    </label>

                    <div className="relative">

                      <input
                        type={showNewPass ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 8 characters"
                        required
                        className="w-full rounded-2xl px-5 py-4 pr-16 text-[15px] font-medium placeholder-gray-500"
                        style={inputStyle}
                      />

                      <button
                        type="button"
                        onClick={() => setShowNewPass(!showNewPass)}
                        className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-200 text-sm font-semibold"
                      >
                        {showNewPass ? 'Hide' : 'Show'}
                      </button>

                    </div>

                    {newPassword && (
                      <div className="mt-3">

                        <div className="flex gap-1 mb-2">
                          {[1, 2, 3, 4].map((i) => (
                            <div
                              key={i}
                              className={`h-1 flex-1 rounded-full transition-all ${
                                i <= strength.score
                                  ? strength.color
                                  : 'bg-white/10'
                              }`}
                            />
                          ))}
                        </div>

                        <p className="text-xs text-gray-300">
                          {strength.label}
                        </p>

                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-gray-300 uppercase tracking-[0.18em] mb-3">
                      Confirm Password
                    </label>

                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      required
                      className="w-full rounded-2xl px-5 py-4 text-[15px] font-medium placeholder-gray-500"
                      style={inputStyle}
                    />
                  </div>

                  {error && (
                    <div
                      className="flex items-start gap-2 p-4 rounded-2xl text-red-300 text-sm"
                      style={{
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.18)',
                      }}
                    >
                      <span>⚠</span>
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-4 rounded-2xl text-[15px] font-bold text-white transition-all duration-300 hover:brightness-110 disabled:opacity-50"
                    style={{
                      background:
                        'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 55%, #2563eb 100%)',
                    }}
                  >
                    {loading ? 'Updating...' : 'Update Password →'}
                  </button>

                </form>
              </>
            )}

            {/* SUCCESS */}
            {step === STEPS.SUCCESS && (
              <div className="text-center py-8">

                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-5"
                  style={{
                    background: 'rgba(34,197,94,0.12)',
                    border: '1px solid rgba(34,197,94,0.25)',
                  }}
                >
                  ✓
                </div>

                <h1 className="text-2xl font-bold text-white mb-2">
                  Password updated!
                </h1>

                <p className="text-gray-200 text-sm mb-6">
                  Redirecting to your dashboard...
                </p>

                <div className="flex justify-center">
                  <span className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                </div>

              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}