import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Markdown, { slugify } from '../help/Markdown.jsx'
import Workflow from '../help/Workflow.jsx'
import { SECTIONS, MANUAL_UPDATED } from '../help/content.js'

export default function Help() {
  const [q, setQ] = useState('')
  const loc = useLocation()
  // przejście do sekcji z pomocy kontekstowej (/pomoc?s=...)
  useEffect(() => {
    const s = new URLSearchParams(loc.search).get('s')
    if (s) setTimeout(() => document.getElementById(s)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }, [loc.search])
  const ql = q.trim().toLowerCase()
  const visible = SECTIONS.filter(s => !ql || `${s.title}\n${s.md}`.toLowerCase().includes(ql))
  const go = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <section className="page help-page">
      <h1>Instrukcja obsługi</h1>
      <p className="muted small">Aktualizacja: {new Date(MANUAL_UPDATED).toLocaleDateString('pl-PL')}</p>
      <div className="help-layout">
        <nav className="help-toc" aria-label="Spis treści">
          <input placeholder="Szukaj w instrukcji…" value={q} onChange={e => setQ(e.target.value)} />
          {visible.map(s => (
            <div key={s.id}>
              <button className="link-dark" onClick={() => go(s.id)}>{s.title}</button>
              {s.id === 'zadania' && <div className="help-sub">{[...s.md.matchAll(/^### (.+)$/gm)].map(m => <button key={m[1]} className="link-dark small" onClick={() => go(slugify(m[1]))}>{m[1]}</button>)}</div>}
            </div>
          ))}
          {!visible.length && <p className="muted small">Brak wyników dla „{q}”.</p>}
        </nav>
        <div className="help-body">
          {visible.map(s => (
            <article key={s.id} id={s.id} className="panel help-section">
              <h2>{s.title}</h2>
              {s.diagram ? <><Markdown text={s.md.split('\n\n')[0]} highlight={q} /><Workflow /><Markdown text={s.md.split('\n\n').slice(1).join('\n\n')} highlight={q} /></> : <Markdown text={s.md} highlight={q} />}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
