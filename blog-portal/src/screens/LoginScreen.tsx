import { useState, type FormEvent } from 'react'
import { LOCAL_AUTH } from '../config/auth'
import { LoginBrandHeader } from '../components/MatriksLogo'
import { LoginBackground } from '../components/LoginBackground'
import { apiLogin } from '../lib/api'

interface Props {
  onSuccess: () => void
}

export function LoginScreen({ onSuccess }: Props) {
  const [email, setEmail] = useState<string>(LOCAL_AUTH.email)
  const [password, setPassword] = useState('')
  const [isCustomer, setIsCustomer] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await apiLogin(email.trim(), password)
      onSuccess()
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Giriş başarısız. API çalışıyor mu? (npm run dev)',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <LoginBackground />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-[400px] rounded-[24px] bg-white px-8 py-9 shadow-[0_30px_90px_rgba(8,4,40,0.55)] sm:px-10 sm:py-10">
          <div className="mb-7">
            <LoginBrandHeader />
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
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
              className="w-full rounded-[12px] border border-[#D9DEE8] bg-white px-4 py-3.5 text-[14px] text-slate-800 outline-none transition placeholder:text-[#9AA3B2] focus:border-[#6D5EFC] focus:ring-2 focus:ring-[#6D5EFC]/20"
            />

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Şifre *"
              required
              className="w-full rounded-[12px] border border-[#D9DEE8] bg-white px-4 py-3.5 text-[14px] text-slate-800 outline-none transition placeholder:text-[#9AA3B2] focus:border-[#6D5EFC] focus:ring-2 focus:ring-[#6D5EFC]/20"
            />

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
              {loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}
            </button>
          </form>

          <p className="mt-7 text-center text-[13px] text-slate-500">
            Demo hesap:{' '}
            <span className="font-medium text-[#3B5BDB]">
              nursen.akay@matriksdata.com
            </span>
          </p>
          <p className="mt-1 text-center text-[12px] text-slate-400">
            Şifre: admin1234 · SQLite yerel API
          </p>
        </div>
      </div>
    </div>
  )
}
