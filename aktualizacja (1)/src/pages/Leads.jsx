import { useEffect, useMemo, useState } from 'react'
import { supabase, plError, fetchAll } from '../supabase.js'
import { runJob, LEADS_URL } from '../jobs.js'
import DrainLoader from '../components/DrainLoader.jsx'

// Pozyskiwanie klientów: research (AI + źródła) → kwalifikacja (AI + człowiek) → przekazanie do ClickUp (CRM EXPORT).
// W Studio tylko dane firm – osoby kontaktowe wyłącznie w ClickUp (RODO).
const COUNTRIES = [['DE', 'Niemcy', 'DACH'], ['AT', 'Austria', 'DACH'], ['CH', 'Szwajcaria', 'DACH'], ['FR', 'Francja', 'Europa Zachodnia'], ['NL', 'Holandia', 'Europa Zachodnia'], ['BE', 'Belgia', 'Europa Zachodnia'], ['IT', 'Włochy', 'Europa Południowa'], ['ES', 'Hiszpania', 'Europa Południowa'], ['CZ', 'Czechy', 'CEE'], ['SK', 'Słowacja', 'CEE'], ['HU', 'Węgry', 'CEE'], ['RO', 'Rumunia', 'CEE']]
const SEGMENTS = ['E-commerce', 'Hurtownia', 'DIY / Sieci', 'Salon']
const BRANDS = ['Aedler', 'Schaedler', 'Schedpol/Schedline', 'Multi-brand']
const MODELS = ['Sklep własny', 'Marketplace', 'Dropshipping', 'Private label', 'Sieć retail']
const STAGES = [['nowa', 'Do kwalifikacji'], ['zakwalifikowana', 'Zakwalifikowane'], ['w_crm', 'W CRM'], ['odrzucona', 'Odrzucone']]
const domainOf = u => { try { return new URL(/^https?:/i.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '').toLowerCase() } catch { return null } }

function LeadCard({ lead, profile, ctx, onSaved, onClose, setMsg }) {
  const [f, setF] = useState(lead)
  const [busy, setBusy] = useState('')
  const [src, setSrc] = useState('')
  useEffect(() => setF(lead), [lead.id, lead.updated_at])
  const ai = lead.ai || null
  const dirty = ['name', 'website', 'potential', 'model', 'analysis', 'pitch', 'vat_id', 'city'].some(k => (f[k] || '') !== (lead[k] || ''))
  const save = async (patch, ok) => {
    const { error } = await supabase.from('leads').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', lead.id)
    if (error) setMsg({ type: 'error', text: /lead_needs_source/.test(error.message) ? 'Bez źródła nie można zakwalifikować firmy – dodaj adres źródła.' : /leads_domain_key/.test(error.message) ? 'Firma z tą domeną już jest w bazie.' : plError(error.message) })
    else { setMsg(ok ? { type: 'ok', text: ok } : null); onSaved() }
  }
  const job = async (type, payload, label) => {
    setBusy(label); setMsg(null)
    try { const r = await runJob(type, payload, { url: LEADS_URL, timeoutSec: 300 }); return r }
    catch (e) { setMsg({ type: 'error', text: plError(e.message) }) } finally { setBusy('') }
  }
  async function qualify() {
    const r = await job('lead_qualify', { lead_id: lead.id, brand_context: ctx }, 'Czytanie strony i ocena AI…')
    if (r) { setMsg({ type: r.sells_bathroom === false ? 'hint' : 'ok', text: `Ocena AI gotowa: potencjał ${r.potential || '—'}${r.sells_bathroom === false ? ' · uwaga: AI nie znalazło na stronie kategorii łazienka' : ''}${r.red_flags?.length ? ` · ryzyka: ${r.red_flags.join('; ')}` : ''}. Sprawdź i zatwierdź albo odrzuć.` }); onSaved() }
  }
  async function toCrm() {
    const r = await job('lead_to_crm', { lead_id: lead.id }, 'Tworzenie zadania w ClickUp…')
    if (r) { setMsg({ type: 'ok', text: 'Firma przekazana do ClickUp (CRM EXPORT).' }); onSaved() }
  }
  const sources = lead.sources || []
  return (
    <div className="panel lead-card">
      <div className="prices-head"><h2>{lead.name}</h2><button className="link-dark" onClick={onClose}>zamknij</button></div>
      <p className="small"><a href={lead.website} target="_blank" rel="noreferrer">{lead.website}</a> · {lead.country} · {lead.segment} · {lead.brand}{lead.reachable === false && <span className="warn-text"> · strona nie odpowiadała</span>}</p>
      {lead.why && <p className="muted small">Dlaczego w researchu: {lead.why}</p>}
      <h3>Źródła {sources.length === 0 && <span className="crit-text small">– brak: bez źródła nie można zakwalifikować</span>}</h3>
      <ul className="small">{sources.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.url}</a>{s.note ? <span className="muted"> – {s.note}</span> : null}</li>)}</ul>
      <div className="row-actions"><input value={src} onChange={e => setSrc(e.target.value)} placeholder="Dodaj źródło: https://…" /><button className="btn ghost small-btn" disabled={!/^https?:\/\/\S+\.\S+/.test(src.trim())} onClick={() => { save({ sources: [...sources, { url: src.trim(), note: 'dodane ręcznie' }] }); setSrc('') }}>Dodaj źródło</button></div>

      {ai && <div className="ai-box">
        <h3>Ocena AI <span className="muted small">({new Date(lead.ai_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })})</span></h3>
        <p className="small">{ai.sells_bathroom ? '✓ Sprzedaje wyposażenie łazienek' : '✗ Na stronie nie widać kategorii łazienka'}{ai.bathroom_categories?.length ? `: ${ai.bathroom_categories.join(', ')}` : ''}</p>
        {ai.competitor_brands?.length > 0 && <p className="small">Marki konkurencji w ofercie: {ai.competitor_brands.join(', ')}</p>}
        {ai.size_signals && <p className="small">Skala: {ai.size_signals}</p>}
        {ai.potential_reason && <p className="small">Potencjał {ai.potential}: {ai.potential_reason}</p>}
        {ai.legal_name && <p className="small">Nazwa prawna: {ai.legal_name}</p>}
        {ai.red_flags?.length > 0 && <p className="small warn-text">Ryzyka: {ai.red_flags.join('; ')}</p>}
      </div>}

      <h3>Dane do ClickUp</h3>
      <div className="grid-form lead-form">
        <label>Nazwa<input value={f.name || ''} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <label>Strona WWW<input value={f.website || ''} onChange={e => setF({ ...f, website: e.target.value })} /></label>
        <label>Miasto<input value={f.city || ''} onChange={e => setF({ ...f, city: e.target.value })} /></label>
        <label>NIP / USt-IdNr<input value={f.vat_id || ''} onChange={e => setF({ ...f, vat_id: e.target.value })} /></label>
        <label>Potencjał<select value={f.potential || ''} onChange={e => setF({ ...f, potential: e.target.value || null })}><option value="">—</option><option value="A">A – Kluczowy</option><option value="B">B – Rozwojowy</option><option value="C">C – Uzupełniający</option></select></label>
        <label>Model współpracy<select value={f.model || ''} onChange={e => setF({ ...f, model: e.target.value || null })}><option value="">—</option>{MODELS.map(m => <option key={m}>{m}</option>)}</select></label>
      </div>
      <label className="block-label">Analiza klienta<textarea rows={4} value={f.analysis || ''} onChange={e => setF({ ...f, analysis: e.target.value })} /></label>
      <label className="block-label">Argumentacja sprzedażowa<textarea rows={3} value={f.pitch || ''} onChange={e => setF({ ...f, pitch: e.target.value })} /></label>

      <div className="row-actions">
        {dirty && <button className="btn ghost" onClick={() => save({ name: f.name, website: f.website, domain: domainOf(f.website), city: f.city || null, vat_id: f.vat_id || null, potential: f.potential || null, model: f.model || null, analysis: f.analysis || null, pitch: f.pitch || null }, 'Zapisano.')}>Zapisz zmiany</button>}
        {lead.status !== 'w_crm' && <button className="btn ghost" disabled={!!busy} onClick={qualify}>{ai ? 'Oceń ponownie (AI)' : 'Oceń stronę (AI)'}</button>}
        {lead.status === 'nowa' && <button className="btn" disabled={!sources.length || !f.potential || dirty} title={!sources.length ? 'Dodaj źródło' : !f.potential ? 'Ustaw potencjał' : dirty ? 'Najpierw zapisz zmiany' : ''} onClick={() => save({ status: 'zakwalifikowana', qualified_by: profile.id, qualified_at: new Date().toISOString() }, 'Firma zakwalifikowana – możesz przekazać ją do ClickUp.')}>Zatwierdź</button>}
        {lead.status === 'zakwalifikowana' && <button className="btn" disabled={!!busy || dirty} onClick={toCrm}>Przekaż do ClickUp</button>}
        {lead.status === 'w_crm' && lead.clickup_url && <a className="btn ghost" href={lead.clickup_url} target="_blank" rel="noreferrer">Otwórz w ClickUp</a>}
        {['nowa', 'zakwalifikowana'].includes(lead.status) && <button className="link-dark danger-link" onClick={() => { const r = prompt('Powód odrzucenia (np. nie sprzedaje łazienek, za mały, konkurencja):'); if (r !== null) save({ status: 'odrzucona', reject_reason: r || null }, 'Firma odrzucona.') }}>Odrzuć</button>}
        {lead.status === 'odrzucona' && <button className="link-dark" onClick={() => save({ status: 'nowa', reject_reason: null }, 'Przywrócono do kwalifikacji.')}>Przywróć</button>}
        {busy && <span className="muted working small">{busy}</span>}
      </div>
      {lead.reject_reason && <p className="muted small">Powód odrzucenia: {lead.reject_reason}</p>}
    </div>
  )
}

export default function Leads({ profile }) {
  const [leads, setLeads] = useState(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState(null)
  const [cc, setCc] = useState('DE'), [segment, setSegment] = useState('E-commerce'), [brand, setBrand] = useState('Aedler')
  const [stage, setStage] = useState('nowa')
  const [sel, setSel] = useState('')
  const [count, setCount] = useState(15)
  const [busy, setBusy] = useState(false)
  const [ctx, setCtx] = useState(null)
  const [add, setAdd] = useState({ name: '', website: '', source: '' })
  const country = COUNTRIES.find(c => c[0] === cc)

  async function load() {
    try { setLeads(await fetchAll('leads', '*')) }
    catch (e) { setErr(/leads/.test(e.message) ? 'Brak tabeli leadów – uruchom migrację 41_pozyskiwanie.sql.' : plError(e.message)) }
  }
  useEffect(() => { load() }, [])
  // kontekst marki do kwalifikacji: kategorie i liczba serii z bazy produktów Studio
  useEffect(() => {
    (async () => {
      const b = await supabase.from('brands').select('id, name').ilike('name', brand.split('/')[0])
      const id = b.data?.[0]?.id; if (!id) { setCtx({ categories: [] }); return }
      const fam = await fetchAll('product_families', 'category', q => q.eq('brand_id', id)).catch(() => [])
      const m = new Map(); for (const x of fam) { const c = x.category || 'inne'; m.set(c, (m.get(c) || 0) + 1) }
      setCtx({ categories: [...m.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 12).map(([name, n]) => ({ name, count: n })) })
    })()
  }, [brand])

  const scope = useMemo(() => (leads || []).filter(l => l.country_code === cc && l.segment === segment && l.brand === brand), [leads, cc, segment, brand])
  if (err) return <section className="page"><h1>Pozyskiwanie klientów</h1><p className="error">{err}</p></section>
  if (!leads) return <section className="page"><DrainLoader /></section>
  const list = scope.filter(l => l.status === stage).sort((a, b) => (a.potential || 'Z').localeCompare(b.potential || 'Z') || b.created_at.localeCompare(a.created_at))
  const counts = Object.fromEntries(STAGES.map(([k]) => [k, scope.filter(l => l.status === k).length]))
  const cur = leads.find(l => l.id === sel)

  async function research() {
    setBusy(true); setMsg(null)
    try {
      const r = await runJob('lead_research', { country: cc, country_name: country[1], region: country[2], segment, brand, count, exclude_domains: leads.map(l => l.domain).filter(Boolean) }, { url: LEADS_URL, timeoutSec: 300 })
      const SK = { excluded: 'już w CRM lub Studio', duplicate: 'powtórzone', no_website: 'bez adresu strony', not_in_search: 'domena spoza wyników researchu', directory: 'katalog zamiast firmy', google_link: 'link Google zamiast strony firmy', no_name: 'bez nazwy' }
      const why = Object.entries(r.skip || {}).filter(([, v]) => v > 0).map(([k, v]) => `${SK[k] || k}: ${v}`).join(', ')
      setMsg({ type: r.saved ? 'ok' : 'hint', text: `Research: AI zaproponowało ${r.found} firm, ${r.unique} nowych${r.from_search ? ` (w tym ${r.from_search} z adresem ustalonym z wyników wyszukiwania)` : ''}, ${r.reachable} z działającą stroną. Dodano do kwalifikacji: ${r.saved}.${why ? ` Odpadły – ${why}.` : ''}${r.grounded === false ? ' Uwaga: wyszukiwanie Google nie zwróciło wyników – firmy pochodzą z wiedzy modelu, a jedynym potwierdzeniem jest działająca strona; sprawdzaj je dokładniej przy kwalifikacji.' : ''}${!r.unique ? ` Przykład odpowiedzi AI: ${r.sample || '—'} | po uporządkowaniu: ${r.sample_order || '—'}` : ''}` })
      setStage('nowa'); load()
    } catch (e) { setMsg({ type: 'error', text: /kod 404/.test(e.message) ? 'n8n nie zna adresu „studio-pozyskiwanie” – workflow „Studio – pozyskiwanie” nie jest aktywny.' : plError(e.message) }) } finally { setBusy(false) }
  }
  async function addLead() {
    const d = domainOf(add.website)
    const { error } = await supabase.from('leads').insert({ name: add.name.trim(), website: 'https://' + d, domain: d, country_code: cc, country: country[1], region: country[2], segment, brand, sources: [{ url: add.source.trim(), note: 'dodane ręcznie' }], created_by: profile.id })
    if (error) setMsg({ type: 'error', text: /leads_domain_key/.test(error.message) ? `Firma ${d} już jest w bazie.` : plError(error.message) })
    else { setAdd({ name: '', website: '', source: '' }); setStage('nowa'); load() }
  }

  return (
    <section className="page wide">
      <h1>Pozyskiwanie klientów</h1>
      <p className="muted lead">Research firm z adresem źródła, kwalifikacja (AI + człowiek) i przekazanie do ClickUp. W Studio są tylko dane firm – osoby kontaktowe prowadzicie w ClickUp.</p>
      <div className="panel">
        <div className="row-actions lead-scope">
          <label className="inline-label">Kraj<select value={cc} onChange={e => setCc(e.target.value)}>{COUNTRIES.map(c => <option key={c[0]} value={c[0]}>{c[1]}</option>)}</select></label>
          <label className="inline-label">Segment<select value={segment} onChange={e => setSegment(e.target.value)}>{SEGMENTS.map(s => <option key={s}>{s}</option>)}</select></label>
          <label className="inline-label">Marka<select value={brand} onChange={e => setBrand(e.target.value)}>{BRANDS.map(b => <option key={b}>{b}</option>)}</select></label>
          <span className="lead-funnel small">{STAGES.map(([k, l]) => <span key={k}>{l}: <strong>{counts[k]}</strong></span>)}</span>
        </div>
        <div className="row-actions">
          <label className="inline-label">Ile firm<select value={count} onChange={e => setCount(Number(e.target.value))}>{[10, 15, 20, 25].map(n => <option key={n}>{n}</option>)}</select></label>
          <button className="btn" disabled={busy} onClick={research}>{busy ? 'Szukanie…' : 'Szukaj nowych firm (AI)'}</button>
          <span className="muted small">AI szuka w internecie, pomija firmy z CRM EXPORT i ze Studio, sprawdza, czy strony działają. Każda firma ma źródło.</span>
        </div>
        {busy && <p className="muted working small" role="status">Research trwa zwykle 1–3 minuty.</p>}
        {msg && <p className={msg.type} role="status">{msg.text}</p>}
      </div>

      <div className="panel">
        <div className="tabs" role="tablist">{STAGES.map(([k, l]) => <button key={k} role="tab" aria-selected={stage === k} className={stage === k ? 'tab on' : 'tab'} onClick={() => setStage(k)}>{l} ({counts[k]})</button>)}</div>
        {list.length === 0 ? <p className="muted">{stage === 'nowa' ? 'Brak firm do kwalifikacji – uruchom research albo dodaj firmę ręcznie.' : 'Brak firm na tym etapie.'}</p> : (
          <div className="table-wrap"><table className="compact prices-table">
            <thead><tr><th>Firma</th><th>Strona</th><th>Miasto</th><th>Potencjał</th><th>Ocena AI</th><th className="num-cell">Źródła</th>{stage === 'w_crm' && <th>ClickUp</th>}</tr></thead>
            <tbody>{list.map(l => (
              <tr key={l.id} className={sel === l.id ? 'sel' : ''} onClick={() => setSel(sel === l.id ? '' : l.id)}>
                <td>{l.name}{l.reachable === false && <span className="tag">strona nie działa</span>}</td>
                <td className="small">{l.domain}</td><td className="small">{l.city || '—'}</td>
                <td>{l.potential ? <span className={`tag pot-${l.potential}`}>{l.potential}</span> : '—'}</td>
                <td className="small">{l.ai ? (l.ai.sells_bathroom ? '✓ łazienka' : <span className="warn-text">✗ brak łazienki</span>) : <span className="muted">—</span>}</td>
                <td className="num-cell">{(l.sources || []).length || <span className="crit-text">0</span>}</td>
                {stage === 'w_crm' && <td>{l.clickup_url ? <a href={l.clickup_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>otwórz</a> : '—'}</td>}
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <details className="lead-add"><summary className="small">+ Dodaj firmę ręcznie</summary>
          <div className="row-actions">
            <input value={add.name} onChange={e => setAdd({ ...add, name: e.target.value })} placeholder="Nazwa firmy" />
            <input value={add.website} onChange={e => setAdd({ ...add, website: e.target.value })} placeholder="Strona, np. badshop.de" />
            <input value={add.source} onChange={e => setAdd({ ...add, source: e.target.value })} placeholder="Źródło (URL) – obowiązkowe" />
            <button className="btn ghost small-btn" disabled={!add.name.trim() || !domainOf(add.website) || !/^https?:\/\/\S+\.\S+/.test(add.source.trim())} onClick={addLead}>Dodaj</button>
          </div>
        </details>
      </div>
      {cur && <LeadCard lead={cur} profile={profile} ctx={ctx} onSaved={load} onClose={() => setSel('')} setMsg={setMsg} />}
    </section>
  )
}
