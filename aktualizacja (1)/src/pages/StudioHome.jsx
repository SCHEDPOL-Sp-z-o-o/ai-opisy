import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { supabase, plError } from '../supabase.js'
import { MODULES } from '../studio/modules.js'

export default function StudioHome({ profile }) {
  const { vis, reloadVis: onVisChange, canSeeModule } = useOutletContext()
  const admin = profile?.role === 'admin'
  const [err, setErr] = useState('')
  const shown = MODULES.filter(m => admin || (canSeeModule ? canSeeModule(m) : vis[m.key]))
  async function toggle(m) {
    setErr('')
    const { error } = await supabase.from('app_modules').upsert({ key: m.key, team_visible: !vis[m.key], updated_at: new Date().toISOString() })
    if (error) setErr(plError(error.message)); else onVisChange()
  }
  return (
    <section className="page">
      <header className="studio-head">
        <h1>SchedpolAI eCommerce Studio</h1>
        <p className="muted lead">Jedno miejsce dla e-commerce Schedpol: treści, oferta w kanałach, pozyskiwanie klientów, ceny i analityka.</p>
      </header>
      {err && <p className="error">{err}</p>}
      <div className="module-grid">
        {shown.map(m => (
          <div key={m.key} className={`module-tile ${m.status}`}>
            <div className="module-tile-head">
              <h2><Link to={m.home}>{m.name}</Link></h2>
              <span className={m.status === 'aktywny' ? 'tag okt' : 'tag'}>{m.status === 'aktywny' ? 'działa' : `w budowie${m.phase ? ` · ${m.phase}` : ''}`}</span>
            </div>
            <p>{m.desc}</p>
            <p className="muted small">Właściciel: {m.owner}</p>
            <div className="module-tile-foot">
              <Link className="btn ghost small-btn" to={m.home}>{m.status === 'aktywny' ? 'Otwórz' : 'Zobacz plan'}</Link>
              {admin && <label className="check small" title="Czy zespół widzi ten moduł w menu i na pulpicie">
                <input type="checkbox" checked={!!vis[m.key]} onChange={() => toggle(m)} /> widoczny dla zespołu
              </label>}
            </div>
          </div>
        ))}
      </div>
      {admin && <p className="muted small">Jako admin widzisz wszystkie moduły. Zespół w trybie domyślnym widzi moduły z zaznaczonym „widoczny dla zespołu”; osoby z własnym dostępem (Użytkownicy → Dostęp do zakładek) widzą tylko przyznane zakładki.</p>}
    </section>
  )
}
