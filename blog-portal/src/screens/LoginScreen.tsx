import { useState, type FormEvent } from 'react'
import { LOCAL_AUTH } from '../config/auth'
import { LoginBrandHeader } from '../components/MatriksLogo'
import { LoginBackground } from '../components/LoginBackground'
import { apiLogin, apiRegister } from '../lib/api'

interface Props {
  onSuccess: () => void
}

type AuthMode = 'login' | 'register'

export function LoginScreen({ onSuccess }: Props) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [isCustomer, setIsCustomer] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function switchMode(next: AuthMode) {
    setMode(next)
    setError('')
    setPassword('')
    setPassword2('')
    if (next === 'login' && !email) setEmail(LOCAL_AUTH.email)
    if (next === 'register') setEmail('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (mode === 'register') {
        if (password !== password2) {
          throw new Error('Şifreler eşleşmiyor')
        }
        await apiRegister(email.trim(), password, displayName.trim() || undefined)
      } else {
        await apiLogin(email.trim(), password)
      }
      onSuccess()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'İşlem başarısız. API çalışıyor mu?',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <LoginBackground />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px] rounded-[24px] bg-white px-8 py-9 shadow-[0_30px_90px_rgba(8,4,40,0.55)] sm:px-10 sm:py-10">
          <div className="mb-6">
            <LoginBrandHeader />
            <p className="mt-3 text-center text-[13px] leading-relaxed text-slate-500">
              Matriks MCP Content Portal — blog üret, onayla, yayınla
            </p>
          </div>

          <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                mode === 'login'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Giriş yap
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                mode === 'register'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Ücretsiz kayıt ol
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' ? (
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ad Soyad"
                autoComplete="name"
                className="w-full rounded-[12px] border border-[#D9DEE8] bg-white px-4 py-3.5 text-[14px] text-slate-800 outline-none transition placeholder:text-[#9AA3B2] focus:border-[#6D5EFC] focus:ring-2 focus:ring-[#6D5EFC]/20"
              />
            ) : null}

            <label className="flex items-center gap-3 px-0.5 py-1">
              <button
                type="button"
                role="switch"
                aria-checked={isCustomer}
                onClick={() => setIsCustomer((v) => !v)}
                className={`relative h-[22px] w-[40px] shrink-0 rounded-full transition ${
                  isCustomer ? 'bg-[#00D07B]' : 'bg-[#C5CBD6]'
                }`}
              >
                <span
                  className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition ${
                    isCustomer ? 'left-[20px]' : 'left-[2px]'
                  }`}
                />
              </button>
              <span className="text-[14px] text-slate-600">
                Matriks müşterisiyim
              </span>
            </label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-posta Adresi *"
              required
              autoComplete="email"
              className="w-full rounded-[12px] border border-[#D9DEE8] bg-white px-4 py-3.5 text-[14px] text-slate-800 outline-none transition placeholder:text-[#9AA3B2] focus:border-[#6D5EFC] focus:ring-2 focus:ring-[#6D5EFC]/20"
            />

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'Şifre * (en az 6 karakter)' : 'Şifre *'}
              required
              minLength={mode === 'register' ? 6 : undefined}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              className="w-full rounded-[12px] border border-[#D9DEE8] bg-white px-4 py-3.5 text-[14px] text-slate-800 outline-none transition placeholder:text-[#9AA3B2] focus:border-[#6D5EFC] focus:ring-2 focus:ring-[#6D5EFC]/20"
            />

            {mode === 'register' ? (
              <input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                placeholder="Şifre tekrar *"
                required
                minLength={6}
                autoComplete="new-password"
                className="w-full rounded-[12px] border border-[#D9DEE8] bg-white px-4 py-3.5 text-[14px] text-slate-800 outline-none transition placeholder:text-[#9AA3B2] focus:border-[#6D5EFC] focus:ring-2 focus:ring-[#6D5EFC]/20"
              />
            ) : null}

            {error ? (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full rounded-[12px] bg-[#00D07B] px-4 py-3.5 text-[15px] font-bold text-white shadow-[0_8px_20px_rgba(0,208,123,0.28)] transition hover:bg-[#00B86D] disabled:opacity-60"
            >
              {loading
                ? mode === 'register'
                  ? 'Hesap oluşturuluyor…'
                  : 'Giriş yapılıyor…'
                : mode === 'register'
                  ? 'Ücretsiz hesap oluştur'
                  : 'Giriş Yap'}
            </button>
          </form>

          {mode === 'login' ? (
            <p className="mt-6 text-center text-[13px] text-slate-500">
              Hesabın yok mu?{' '}
              <button
                type="button"
                onClick={() => switchMode('register')}
                className="font-semibold text-[#3B5BDB] hover:underline"
              >
                Ücretsiz kayıt ol
              </button>
            </p>
          ) : (
            <p className="mt-6 text-center text-[13px] text-slate-500">
              Zaten hesabın var mı?{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="font-semibold text-[#3B5BDB] hover:underline"
              >
                Giriş yap
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
