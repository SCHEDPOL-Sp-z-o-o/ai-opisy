import { Link, useLocation } from 'react-router-dom'
import Markdown from './Markdown.jsx'
import { helpFor } from './content.js'

export default function HelpDrawer({ open, onClose }) {
  const loc = useLocation()
  const h = helpFor(loc.pathname)
  if (!open) return null
  return (
    <aside className="help-drawer" role="dialog" aria-label="Pomoc do tego ekranu">
      <div className="help-drawer-head"><strong>Pomoc: {h ? h.title : 'ten ekran'}</strong><button className="link-dark" onClick={onClose} aria-label="Zamknij pomoc">Zamknij</button></div>
      {h ? <Markdown text={h.md} /> : <p className="muted">Dla tego ekranu nie ma osobnej pomocy.</p>}
      <Link className="btn ghost" to={`/pomoc?s=${h ? h.section : 'ekrany'}`} onClick={onClose}>Pełna instrukcja →</Link>
    </aside>
  )
}
