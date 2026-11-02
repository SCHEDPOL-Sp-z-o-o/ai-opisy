import { useEffect, useState } from 'react'
import { supabase, plError } from '../supabase.js'
import DrainLoader from '../components/DrainLoader.jsx'

// Raporty Power BI – bezpieczne osadzenie: oglądający loguje się kontem Microsoft i potrzebuje licencji Power BI Pro.
// Linki „Publikuj w internecie” (publiczne) są odrzucane.
const check = url => {
  const u = String(url || '').trim()
  if (!/^https:\/\/app\.powerbi\.com\//i.test(u)) return 'Link musi zaczynać się od https://app.powerbi.com/ (Power BI → Plik → Osadź raport → Witryna lub portal; ang. File → Embed report → Website or portal).'
  if (/\/view\?r=/i.test(u)) return 'To link z „Publikuj w internecie” – raport byłby publiczny dla każdego. Użyj „Osadź raport → Witryna lub portal”.'
  if (!/reportEmbed/i.test(u)) return 'To nie wygląda na link do osadzenia. Skopiuj go z: Plik → Osadź raport → Witryna lub portal.'
  return ''
}

export default function Analytics({ profile }) {
  const admin = profile?.role === 'admin'
  const [reports, setReports] = useState(null)
  const [active, setActive] = useState('')
  const [err, setErr] = useState('')
  const [f, setF] = useState({ title: '', embed_url: '', description: '' })
  const [adding, setAdding] = useState(false)
  async function load() {
    const { data, error } = await supabase.from('studio_reports').select('*').order('sort').order('created_at')
    if (error) { setErr(/studio_reports/.test(error.message) ? 'Brak tabeli raportów – uruchom migrację 30_studio.sql.' : plError(error.message)); return }
    setReports(data || []); if (!active && data?.length) setActive(data[0].id)
  }
  useEffect(() => { load() }, [])
  async function add() {
    const why = check(f.embed_url); if (why) { setErr(why); return }
    const { data: { session } } = await supabase.auth.getSession()
    const { data, error } = await supabase.from('studio_reports').insert({ title: f.title.trim(), embed_url: f.embed_url.trim(), description: f.description.trim() || null, sort: (reports || []).length + 1, created_by: session.user.id }).select('id').single()
    if (error) { setErr(plError(error.message)); return }
    setF({ title: '', embed_url: '', description: '' }); setAdding(false); setErr(''); setActive(data.id); load()
  }
  async function remove(r) {
    if (!confirm(`Usunąć raport „${r.title}” ze Studio? W Power BI nic się nie zmieni.`)) return
    const { error } = await supabase.from('studio_reports').delete().eq('id', r.id)
    if (error) setErr(plError(error.message)); else { setActive(''); load() }
  }
  if (!reports && !err) return <section className="page"><DrainLoader /></section>
  const cur = (reports || []).find(r => r.id === active)
  return (
    <section className="page wide">
      <h1>Analityka</h1>
      <p className="muted lead">Raporty Power BI w Studio. Przy pierwszym otwarciu Power BI poprosi o zalogowanie kontem firmowym Microsoft; do oglądania potrzebna jest licencja Power BI Pro.</p>
      {err && <p className="error">{err}</p>}
      {reports && reports.length === 0 && !adding && (
        <div className="panel"><p className="muted">Nie ma jeszcze raportów.{admin ? ' Dodaj pierwszy raport poniżej.' : ' Admin doda je wkrótce.'}</p></div>
      )}
      {reports && reports.length > 0 && <>
        <div className="tabs" role="tablist">
          {reports.map(r => <button key={r.id} role="tab" aria-selected={r.id === active} className={r.id === active ? 'tab on' : 'tab'} onClick={() => setActive(r.id)}>{r.title}</button>)}
        </div>
        {cur && <div className="panel report-panel">
          <div className="report-head">
            {cur.description ? <p className="muted small">{cur.description}</p> : <span />}
            <span className="report-actions"><a className="link-dark small" href={cur.embed_url} target="_blank" rel="noreferrer">otwórz w nowej karcie</a>{admin && <button className="link-dark danger-link small" onClick={() => remove(cur)}>usuń</button>}</span>
          </div>
          <iframe key={cur.id} className="report-frame" title={cur.title} src={cur.embed_url} allowFullScreen />
        </div>}
      </>}
      {admin && (adding ? (
        <div className="panel">
          <h2>Dodaj raport Power BI</h2>
          <p className="muted small">W Power BI: otwórz raport → <strong>Plik → Osadź raport → Witryna lub portal</strong> (ang. File → Embed report → Website or portal) → skopiuj pierwszy link. Nie używaj „Publikuj w internecie” – taki raport jest publiczny.</p>
          <div className="grid-form">
            <label>Nazwa w Studio<input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="np. Sprzedaż per kanał" /></label>
            <label>Link do osadzenia<input value={f.embed_url} onChange={e => setF({ ...f, embed_url: e.target.value })} placeholder="https://app.powerbi.com/reportEmbed?reportId=…" /></label>
            <label>Opis (opcjonalnie)<input value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></label>
          </div>
          <div className="row-actions"><button className="btn" disabled={!f.title.trim() || !f.embed_url.trim()} onClick={add}>Dodaj</button><button className="link-dark" onClick={() => { setAdding(false); setErr('') }}>Anuluj</button></div>
        </div>
      ) : <button className="btn ghost" onClick={() => setAdding(true)}>+ Dodaj raport</button>)}
    </section>
  )
}
