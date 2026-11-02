import { MODULES } from '../studio/modules.js'

// Moduł w budowie: zakres, właściciel, faza i wejścia potrzebne do startu – bez udawanych funkcji
export default function ModulePage({ moduleKey }) {
  const m = MODULES.find(x => x.key === moduleKey)
  if (!m) return null
  return (
    <section className="page">
      <h1>{m.name}</h1>
      <p className="muted lead">{m.desc}</p>
      <div className="dash-top">
        <div className="panel">
          <h2>Zakres modułu</h2>
          <ul className="module-scope">{(m.scope || []).map(s => <li key={s}>{s}</li>)}</ul>
          <p className="muted small">Właściciel: {m.owner} · {m.phase || ''}</p>
        </div>
        <div className="panel next-steps">
          <h2>Potrzebne do startu</h2>
          <ul className="module-needs">{(m.needs || []).map(s => <li key={s}>{s}</li>)}</ul>
          <p className="muted small">Moduł jest w budowie i widoczny tylko dla admina, dopóki nie zostanie włączony dla zespołu na pulpicie Studio.</p>
        </div>
      </div>
    </section>
  )
}
