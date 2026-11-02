import { useState } from 'react'

// Logo z folderu public/ (najpierw SVG, potem PNG); bez pliku – nazwa tekstem
const LOGOS = ['schedpol-logo.svg', 'schedpol-logo.png'].map(f => `${import.meta.env.BASE_URL}${f}`)
function Logo() {
  const [i, setI] = useState(0)
  if (i >= LOGOS.length) return <span className="login-logo-text">Schedpol</span>
  return <img className="login-logo" src={LOGOS[i]} alt="Schedpol" onError={() => setI(i + 1)} />
}
import { supabase, plError } from '../supabase.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(plError(error.message))
    setBusy(false)
  }

  return (
    <main className="login">
      <section className="login-side">
        <div className="login-water" aria-hidden="true">
          <span className="caustic c1" /><span className="caustic c2" />
          <span className="drop d1" /><span className="drop d2" /><span className="drop d3" /><span className="drop d4" /><span className="drop d5" /><span className="drop d6" />
        </div>
        <Logo />
        <div className="drain" aria-hidden="true">
          <span /><span /><span /><span /><span /><span /><span />
        </div>
        <p className="login-claim"><span className="claim-name">SchedpolAI</span> <span className="claim-desc">eCommerce Studio</span></p>
      </section>
      <section className="login-form">
        <form onSubmit={submit} className="panel narrow" noValidate>
          <h1>Zaloguj się</h1>
          <p className="muted">Konto zakłada admin aplikacji.</p>
          <label>E-mail
            <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
          </label>
          <label>Hasło
            <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" disabled={busy || !email || !password}>{busy ? 'Logowanie…' : 'Zaloguj się'}</button>
        </form>
      </section>
    </main>
  )
}
