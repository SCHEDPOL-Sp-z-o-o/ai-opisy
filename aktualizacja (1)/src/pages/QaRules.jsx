import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, plError } from '../supabase.js'
import { LANGS as ALL_LANGS, BASE_FORBIDDEN } from '../languages.js'
import DrainLoader from '../components/DrainLoader.jsx'

const TYPES = {
  zakazany_wzorzec: { label: 'Zakazane sformułowanie', hint: 'QA blokuje akceptację opisu, który je zawiera.' },
  marka_konkurencji: { label: 'Marka konkurencji', hint: 'QA blokuje opis z tą nazwą.' },
  instrukcja: { label: 'Zasada redakcyjna dla AI', hint: 'Trafia do promptu przy każdej generacji opisu i wariantu.' },
}
const langLabel = code => !code ? 'wszystkie języki' : `${code.toUpperCase()}${ALL_LANGS[code] ? ` – ${ALL_LANGS[code].name}` : ''}`
const escapeRx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const plural = (n, a, b, c) => n === 1 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? b : c

export default function QaRules({ profile }) {
  const [rules, setRules] = useState(null)
  const [comments, setComments] = useState({})
  const [f, setF] = useState({ rule_type: 'zakazany_wzorzec', text: '', regex: false, language: '' })
  const [test, setTest] = useState('')
  const [msg, setMsg] = useState(null)
  const [chLangs, setChLangs] = useState([])
  const [langFilter, setLangFilter] = useState('')
  const admin = profile?.role === 'admin'

  async function load() {
    const { data, error } = await supabase.from('qa_rules').select('*').order('created_at', { ascending: false })
    if (error) { setMsg({ type: 'error', text: plError(error.message) }); return }
    setRules(data)
    const ch = await supabase.from('channels').select('language')
    setChLangs([...new Set((ch.data || []).map(c => c.language))])
    const ids = data.map(r => r.source_comment_id).filter(Boolean)
    if (ids.length) {
      const c = await supabase.from('review_comments').select('id, description_id, section_key').in('id', ids)
      setComments(Object.fromEntries((c.data || []).map(x => [x.id, x])))
    }
  }
  useEffect(() => { load() }, [])

  async function add(e) {
    e.preventDefault(); setMsg(null)
    const text = f.text.trim()
    let pattern = text
    if (f.rule_type !== 'instrukcja' && !f.regex) pattern = escapeRx(text)
    if (f.rule_type !== 'instrukcja') { try { new RegExp(pattern, 'i') } catch { setMsg({ type: 'error', text: 'Niepoprawne wyrażenie regularne.' }); return } }
    const { data: { session } } = await supabase.auth.getSession()
    const { error } = await supabase.from('qa_rules').insert({ rule_type: f.rule_type, pattern, language: f.language || null, status: admin ? 'aktywna' : 'propozycja', created_by: session.user.id, ...(admin ? { approved_by: session.user.id } : {}) })
    setMsg(error ? { type: 'error', text: plError(error.message) } : { type: 'ok', text: admin ? 'Reguła aktywna. Działa przy następnej generacji i kontroli QA.' : 'Propozycja wysłana do admina.' })
    if (!error) { setF({ ...f, text: '' }); load() }
  }
  async function setStatus(r, status) {
    const { data: { session } } = await supabase.auth.getSession()
    const { error } = await supabase.from('qa_rules').update({ status, ...(status === 'aktywna' ? { approved_by: session.user.id } : {}) }).eq('id', r.id)
    if (error) setMsg({ type: 'error', text: plError(error.message) }); else load()
  }
  async function edit(r, pattern) { if (pattern.trim() && pattern !== r.pattern) { await supabase.from('qa_rules').update({ pattern: pattern.trim() }).eq('id', r.id); load() } }
  async function remove(r) { if (confirm('Usunąć regułę?')) { await supabase.from('qa_rules').delete().eq('id', r.id); load() } }

  if (!rules) return <section className="page"><DrainLoader /></section>
  const groups = [['propozycja', 'Propozycje do zatwierdzenia'], ['aktywna', 'Aktywne'], ['wylaczona', 'Wyłączone']]
  const active = rules.filter(r => r.status === 'aktywna' && r.rule_type !== 'instrukcja' && r.rule_type !== 'limit')
  const hits = test.trim() ? active.filter(r => { try { return new RegExp(r.pattern, 'i').test(test) } catch { return false } }) : []
  const shown = r => r.rule_type === 'instrukcja' ? r.pattern : r.pattern.replace(/\\([.*+?^${}()|[\]\\])/g, '$1')

  const langs = [...new Set([...Object.keys(ALL_LANGS), ...chLangs, ...(rules || []).map(r => r.language).filter(Boolean)])]
  const missingBase = chLangs.filter(l => BASE_FORBIDDEN[l] && !(rules || []).some(r => r.language === l && r.rule_type === 'zakazany_wzorzec'))
  async function addBase(lang) {
    const { data: { session } } = await supabase.auth.getSession()
    const rows = BASE_FORBIDDEN[lang].map(t => ({ rule_type: 'zakazany_wzorzec', pattern: escapeRx(t), language: lang, status: 'aktywna', created_by: session.user.id, approved_by: session.user.id }))
    const { error } = await supabase.from('qa_rules').insert(rows)
    setMsg(error ? { type: 'error', text: plError(error.message) } : { type: 'ok', text: `Dodano ${rows.length} podstawowych zakazów dla ${lang.toUpperCase()}.` })
    if (!error) load()
  }

  return (
    <section className="page">
      <h1>Reguły QA</h1>
      <p className="muted lead">Zakazy blokują akceptację opisu, a zasady redakcyjne AI stosuje już przy pisaniu. Propozycje (np. z uwag w Weryfikacji) zaczynają działać dopiero po zatwierdzeniu przez admina.</p>

      <form className="panel" onSubmit={add}>
        <h2>{admin ? 'Dodaj regułę' : 'Zaproponuj regułę'}</h2>
        <div className="grid-form">
          <label>Typ<select value={f.rule_type} onChange={e => setF({ ...f, rule_type: e.target.value })}>
            {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
          <label>Język<select value={f.language} onChange={e => setF({ ...f, language: e.target.value })}>
            {['', ...langs].map(k => <option key={k} value={k}>{langLabel(k)}</option>)}</select></label>
        </div>
        <label>{f.rule_type === 'instrukcja' ? 'Treść zasady (jedno zdanie, po polsku – AI zastosuje ją w każdym języku)' : f.rule_type === 'marka_konkurencji' ? 'Nazwa marki' : 'Sformułowanie'}
          {f.rule_type === 'instrukcja'
            ? <textarea rows={2} value={f.text} onChange={e => setF({ ...f, text: e.target.value })} placeholder="np. Zawsze podawaj wysokość brodzika w centymetrach." />
            : <input value={f.text} onChange={e => setF({ ...f, text: e.target.value })} placeholder={f.rule_type === 'marka_konkurencji' ? 'np. Radaway' : 'np. cel mai bun'} />}
        </label>
        {f.rule_type !== 'instrukcja' && <label className="check small"><input type="checkbox" checked={f.regex} onChange={e => setF({ ...f, regex: e.target.checked })} /> wyrażenie regularne (dla zaawansowanych; domyślnie szukany jest dokładny fragment, bez względu na wielkość liter)</label>}
        <p className="muted small">{TYPES[f.rule_type].hint}</p>
        <button className="btn" disabled={f.text.trim().length < 2}>{admin ? 'Dodaj i aktywuj' : 'Wyślij propozycję'}</button>
        {msg && <p className={msg.type} role="status">{msg.text}</p>}
      </form>

      <div className="panel">
        <h2>Sprawdź tekst</h2>
        <label>Wklej fragment opisu – zobaczysz, które aktywne zakazy by go zablokowały
          <textarea rows={2} value={test} onChange={e => setTest(e.target.value)} />
        </label>
        {test.trim() && (hits.length ? <p className="error">Zablokowałyby: {hits.map(r => `„${shown(r)}”`).join(', ')}</p> : <p className="ok">Żaden aktywny zakaz nie pasuje.</p>)}
      </div>

      {admin && missingBase.map(l => (
        <div key={l} className="hint">Kanał w języku {l.toUpperCase()} nie ma jeszcze zakazanych sformułowań. <button className="link-dark" onClick={() => addBase(l)}>Dodaj podstawowe ({BASE_FORBIDDEN[l].slice(0, 3).join(', ')}…)</button></div>
      ))}
      <div className="seg lang-filter">
        <button className={!langFilter ? 'seg-btn on' : 'seg-btn'} onClick={() => setLangFilter('')}>Wszystkie</button>
        {langs.filter(l => (rules || []).some(r => r.language === l) || chLangs.includes(l)).map(l => <button key={l} className={langFilter === l ? 'seg-btn on' : 'seg-btn'} onClick={() => setLangFilter(l)}>{l.toUpperCase()}</button>)}
        <button className={langFilter === '_all' ? 'seg-btn on' : 'seg-btn'} onClick={() => setLangFilter('_all')}>dla wszystkich języków</button>
      </div>
      {langFilter && langFilter !== '_all' && <p className="muted small">Pokazane reguły języka {langFilter.toUpperCase()} oraz reguły dla wszystkich języków – razem obowiązują przy opisach w tym języku.</p>}
      {groups.map(([st, title]) => {
        const list = rules.filter(r => r.status === st && r.rule_type !== 'limit' && (!langFilter || (langFilter === '_all' ? !r.language : (r.language === langFilter || !r.language))))
        if (!list.length && st !== 'aktywna') return null
        return (
          <div key={st} className="panel">
            <h2>{title} <span className="muted small">{list.length} {plural(list.length, 'reguła', 'reguły', 'reguł')}</span></h2>
            {list.length === 0 ? <p className="muted">Brak.</p> : (
              <table className="compact rules">
                <thead><tr><th>Typ</th><th>Reguła</th><th>Język</th><th>Źródło</th>{admin && <th />}</tr></thead>
                <tbody>{list.map(r => {
                  const c = comments[r.source_comment_id]
                  return (
                    <tr key={r.id}>
                      <td><span className={`tag t-${r.rule_type}`}>{TYPES[r.rule_type]?.label}</span></td>
                      <td className="rule-text">{admin && r.rule_type === 'instrukcja'
                        ? <textarea rows={2} defaultValue={r.pattern} onBlur={e => edit(r, e.target.value)} aria-label="Treść zasady" />
                        : shown(r)}</td>
                      <td>{r.language ? r.language.toUpperCase() : 'wszystkie'}</td>
                      <td className="muted small">{c ? <Link to={`/weryfikacja/${c.description_id}`}>uwaga w Weryfikacji{c.section_key ? ` (${c.section_key})` : ''}</Link> : 'dodana ręcznie'}</td>
                      {admin && <td className="actions">
                        {st !== 'aktywna' && <button className="link-dark" onClick={() => setStatus(r, 'aktywna')}>Zatwierdź</button>}
                        {st === 'aktywna' && <button className="link-dark" onClick={() => setStatus(r, 'wylaczona')}>Wyłącz</button>}
                        <button className="link-dark danger" onClick={() => remove(r)}>Usuń</button>
                      </td>}
                    </tr>
                  )
                })}</tbody>
              </table>
            )}
          </div>
        )
      })}
    </section>
  )
}
