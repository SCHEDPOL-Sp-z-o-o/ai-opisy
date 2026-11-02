import { Fragment, useEffect, useState } from 'react'
import { supabase, plError, ROLE_LABELS } from '../supabase.js'
import { MODULES, SCREENS } from '../studio/modules.js'

const zakladek = n => `${n} ${n === 1 ? 'zakładka' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 'zakładki' : 'zakładek'}`

// Rola = co osoba może robić (generować, akceptować, publikować, administrować).
// Dostęp do zakładek = gdzie może wejść: domyślny (wg roli i widoczności modułów) albo własna lista zakładek.
function Access({ user, onSaved, setMsg }) {
  const [custom, setCustom] = useState(user.screens_custom)
  const [sel, setSel] = useState(new Set(user.screens))
  const [busy, setBusy] = useState(false)
  const dirty = custom !== user.screens_custom || (custom && (sel.size !== user.screens.length || user.screens.some(s => !sel.has(s))))
  const toggle = k => setSel(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const setModule = (m, on) => setSel(s => { const n = new Set(s); SCREENS.filter(x => x.module === m).forEach(x => on ? n.add(x.key) : n.delete(x.key)); return n })
  async function save() {
    setBusy(true)
    try {
      const a = await supabase.from('profiles').update({ screens_custom: custom }).eq('id', user.id); if (a.error) throw a.error
      const b = await supabase.from('user_screens').delete().eq('user_id', user.id); if (b.error) throw b.error
      if (custom && sel.size) { const c = await supabase.from('user_screens').insert([...sel].map(screen => ({ user_id: user.id, screen }))); if (c.error) throw c.error }
      setMsg({ type: 'ok', text: `Zapisano dostęp: ${user.full_name || user.email}${custom ? ` – ${zakladek(sel.size)}` : ' – domyślny'}. Zmiana działa po odświeżeniu aplikacji u tej osoby.` })
      onSaved()
    } catch (e) { setMsg({ type: 'error', text: /screens_custom|user_screens/.test(e.message) ? 'Brak tabel dostępu – uruchom migrację 42_dostep_do_zakladek.sql.' : plError(e.message) }) } finally { setBusy(false) }
  }
  if (user.role === 'admin') return <p className="muted small">Administrator ma zawsze dostęp do wszystkich zakładek.</p>
  return (
    <div className="access-box">
      <div className="access-mode">
        <label className="check"><input type="radio" checked={!custom} onChange={() => setCustom(false)} /> <strong>Domyślny</strong> <span className="muted small">– wg roli; moduły widoczne dla zespołu (przełącznik na Pulpicie)</span></label>
        <label className="check"><input type="radio" checked={custom} onChange={() => setCustom(true)} /> <strong>Własny</strong> <span className="muted small">– tylko zaznaczone zakładki, także z modułów jeszcze niewłączonych dla zespołu</span></label>
      </div>
      {custom && <div className="access-grid">
        {MODULES.map(m => { const list = SCREENS.filter(x => x.module === m.key); if (!list.length) return null
          const all = list.every(x => sel.has(x.key))
          return (
            <div key={m.key} className="access-mod">
              <label className="check access-mod-head"><input type="checkbox" checked={all} ref={el => { if (el) el.indeterminate = !all && list.some(x => sel.has(x.key)) }} onChange={e => setModule(m.key, e.target.checked)} /> <strong>{m.name}</strong>{m.status !== 'aktywny' && <span className="tag">w budowie</span>}</label>
              {list.length > 1 && list.map(x => <label key={x.key} className="check small access-item"><input type="checkbox" checked={sel.has(x.key)} onChange={() => toggle(x.key)} /> {x.label}</label>)}
            </div>
          )
        })}
      </div>}
      {custom && sel.size === 0 && <p className="hint small">Bez zaznaczonych zakładek osoba zobaczy tylko Pulpit.</p>}
      <div className="row-actions"><button className="btn small-btn" disabled={!dirty || busy} onClick={save}>{busy ? 'Zapisywanie…' : 'Zapisz dostęp'}</button></div>
    </div>
  )
}

export default function Users() {
  const [rows, setRows] = useState([])
  const [msg, setMsg] = useState(null)
  const [open, setOpen] = useState('')

  async function load() {
    const [p, s] = await Promise.all([
      supabase.from('profiles').select('id, email, full_name, role, screens_custom').order('email'),
      supabase.from('user_screens').select('user_id, screen'),
    ])
    if (p.error) {   // przed migracją 42 – bez kolumny screens_custom
      const q = await supabase.from('profiles').select('id, email, full_name, role').order('email')
      if (q.error) { setMsg({ type: 'error', text: plError(q.error.message) }); return }
      setRows(q.data.map(r => ({ ...r, screens_custom: false, screens: [], noAccessTables: true }))); return
    }
    const by = {}; for (const x of s.data || []) (by[x.user_id] = by[x.user_id] || []).push(x.screen)
    setRows(p.data.map(r => ({ ...r, screens: by[r.id] || [] })))
  }
  useEffect(() => { load() }, [])

  async function setRole(id, role) {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id)
    setMsg(error ? { type: 'error', text: plError(error.message) } : { type: 'ok', text: 'Rola zapisana.' })
    load()
  }
  const summary = r => r.role === 'admin' ? 'wszystkie' : !r.screens_custom ? 'domyślny' : `własny: ${zakladek(r.screens.length)}`

  return (
    <section className="page">
      <h1>Użytkownicy</h1>
      <p className="muted lead">Nowe konto dodajesz w Supabase: Authentication → Users → Add user. Tu nadajesz rolę (co osoba może robić) i dostęp do zakładek (gdzie może wejść). Dane cen, cenników, leadów i raportów są chronione także w bazie – bez dostępu do zakładki nie da się ich odczytać.</p>
      {rows[0]?.noAccessTables && <p className="hint">Dostęp do zakładek wymaga migracji 42_dostep_do_zakladek.sql.</p>}
      <div className="panel table-wrap">
        <table>
          <thead><tr><th>Osoba</th><th>E-mail</th><th>Rola</th><th>Dostęp do zakładek</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <Fragment key={r.id}>
                <tr className={open === r.id ? 'sel' : ''}>
                  <td>{r.full_name || '—'}</td>
                  <td>{r.email}</td>
                  <td>
                    <select value={r.role} onChange={e => setRole(r.id, e.target.value)} aria-label={`Rola: ${r.email}`}>
                      {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td><button className="link-dark" disabled={r.noAccessTables} onClick={() => setOpen(open === r.id ? '' : r.id)}>{summary(r)} {open === r.id ? '▴' : '▾'}</button></td>
                </tr>
                {open === r.id && <tr className="access-row"><td colSpan={4}><Access user={r} onSaved={load} setMsg={setMsg} /></td></tr>}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {msg && <p className={msg.type} role="status">{msg.text}</p>}
    </section>
  )
}
