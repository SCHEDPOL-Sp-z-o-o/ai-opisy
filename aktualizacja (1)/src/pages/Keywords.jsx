import { useEffect, useState } from 'react'
import { supabase, plError } from '../supabase.js'
import { runJob } from '../jobs.js'

import { KEYWORD_LANGS as LANGS } from '../languages.js'
import DrainLoader from '../components/DrainLoader.jsx'
const LANG = Object.fromEntries(Object.entries(LANGS).map(([k, v]) => [k, `${v.name} (${v.country})`]))

const LOCATION = Object.fromEntries(Object.entries(LANGS).map(([k, v]) => [k, v.location]))

function AddBank({ categories, existing, onAdded }) {
  const [f, setF] = useState({ category: '', language: 'ro', seeds: '' })
  const [msg, setMsg] = useState(null)
  async function add(e) {
    e.preventDefault()
    const category = f.category.trim().toLowerCase()
    if (existing.some(b => b.category === category && b.language === f.language)) { setMsg({ type: 'error', text: 'Taki bank już istnieje.' }); return }
    const seeds = [...new Set(f.seeds.split('\n').map(x => x.trim()).filter(Boolean))]
    const { error } = await supabase.from('keyword_banks').insert({ category, language: f.language, location_code: LOCATION[f.language], seeds })
    setMsg(error ? { type: 'error', text: plError(error.message) } : { type: 'ok', text: 'Bank dodany. Przed odświeżeniem niech frazy startowe sprawdzi osoba znająca język.' })
    if (!error) { setF({ ...f, seeds: '' }); onAdded() }
  }
  return (
    <details className="panel">
      <summary><strong>Dodaj bank fraz</strong> <span className="muted small">dla nowej kategorii albo języka</span></summary>
      <form onSubmit={add}>
        <div className="grid-form">
          <label>Kategoria (jak w PIM)<input list="cat-list" value={f.category} onChange={e => setF({ ...f, category: e.target.value })} placeholder="np. odpływy liniowe" /></label>
          <label>Język / rynek<select value={f.language} onChange={e => setF({ ...f, language: e.target.value })}>{Object.entries(LANG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        </div>
        <label>Frazy startowe (jedna w linii)<textarea rows={4} value={f.seeds} onChange={e => setF({ ...f, seeds: e.target.value })} /></label>
        <datalist id="cat-list">{categories.map(c => <option key={c} value={c} />)}</datalist>
        <p className="muted small">Kategoria musi być taka sama jak kategoria rodzin produktów (ścieżka PIM małymi literami, np. „brodziki standard”, „wanny”) – inaczej generacja nie znajdzie banku.</p>
        <button className="btn" disabled={!f.category.trim()}>Dodaj bank</button>
        {msg && <p className={msg.type} role="status">{msg.text}</p>}
      </form>
    </details>
  )
}

function Bank({ bank, onChanged, canVerify }) {
  const [seeds, setSeeds] = useState((bank.seeds || []).join('\n'))
  const [minVol, setMinVol] = useState(bank.min_volume ?? 10)
  const [manual, setManual] = useState('')
  const [stage, setStage] = useState('')
  const [msg, setMsg] = useState(null)
  const [all, setAll] = useState(false)
  const kws = bank.keywords || []
  const excluded = new Set(bank.excluded || [])
  const seedList = [...new Set(seeds.split('\n').map(s => s.trim()).filter(Boolean))]
  const seedsDirty = seedList.join('\n') !== (bank.seeds || []).join('\n') || Number(minVol) !== (bank.min_volume ?? 10)

  async function patch(p, ok) {
    const { error } = await supabase.from('keyword_banks').update(p).eq('id', bank.id)
    setMsg(error ? { type: 'error', text: plError(error.message) } : ok ? { type: 'ok', text: ok } : null)
    if (!error) onChanged()
  }
  async function refresh() {
    if (!(bank.seeds || []).length) { setMsg({ type: 'error', text: 'Bank nie ma fraz startowych. Wpisz je (w języku rynku) i zapisz, potem odśwież.' }); return }
    if (!bank.seeds_verified && !confirm('Frazy startowe tego banku nie zostały jeszcze sprawdzone przez osobę znającą język. Odświeżyć mimo to?')) return
    setMsg(null); setStage('DataForSEO pobiera wolumeny wyszukiwań…')
    try {
      if (seedsDirty) await supabase.from('keyword_banks').update({ seeds: seedList, min_volume: Number(minVol) }).eq('id', bank.id)
      const res = await runJob('keywords_refresh', { bank_id: bank.id, seeds: seedList, location_code: bank.location_code, language: bank.language,
        min_volume: Number(minVol), manual: kws.filter(k => k.source === 'manual') }, { timeoutSec: 240 })
      setMsg({ type: 'ok', text: `Zapisano ${res.saved} fraz (koszt DataForSEO: $${res.stats?.cost_usd ?? 0}).${res.notes?.length ? ' Uwagi: ' + res.notes.join('; ') : ''}` })
      onChanged()
    } catch (e) { setMsg({ type: 'error', text: e.message }) } finally { setStage('') }
  }
  const toggle = kw => patch({ excluded: excluded.has(kw) ? [...excluded].filter(x => x !== kw) : [...excluded, kw] })
  function addManual(e) {
    e.preventDefault()
    const kw = manual.trim(); if (!kw) return
    if (kws.some(k => k.kw.toLowerCase() === kw.toLowerCase())) { setMsg({ type: 'error', text: 'Ta fraza już jest w banku.' }); return }
    patch({ keywords: [{ kw, volume: null, source: 'manual' }, ...kws] }, 'Fraza dodana. Frazy ręczne (np. z wyszukiwarki eMAG) zawsze zostają w banku.')
    setManual('')
  }
  const shown = all ? kws : kws.slice(0, 40)

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{bank.category} · {LANG[bank.language] || bank.language}</h2>
        <span className="muted small">
          {bank.seeds_verified ? <span className="tag okt">frazy startowe sprawdzone</span> : <span className="tag warn">frazy startowe do weryfikacji</span>}
          {canVerify && <button className="link-dark gap" onClick={() => patch({ seeds_verified: !bank.seeds_verified }, bank.seeds_verified ? 'Cofnięto weryfikację.' : 'Oznaczono jako sprawdzone.')}>{bank.seeds_verified ? 'cofnij' : 'oznacz jako sprawdzone'}</button>}
          {' · '}{bank.refreshed_at ? `odświeżono ${new Date(bank.refreshed_at).toLocaleDateString('pl-PL')}` : 'jeszcze nie odświeżano'}
        </span>
      </div>
      <div className="kw-grid">
        <div>
          <label>Frazy startowe (jedna w linii)
            <textarea rows={8} value={seeds} onChange={e => setSeeds(e.target.value)} />
          </label>
          <label>Minimalny wolumen miesięczny<input type="number" min="0" value={minVol} onChange={e => setMinVol(e.target.value)} /></label>
          <p className="muted small">Frazy startowe sprawdź z osobą znającą język – to od nich zależy cała pula.</p>
          <button className="btn" onClick={refresh} disabled={!!stage || !seedList.length}>{stage ? 'Odświeżanie…' : 'Odśwież frazy'}</button>
          {seedsDirty && !stage && <button className="link-dark gap" onClick={() => patch({ seeds: seedList, min_volume: Number(minVol) }, 'Zapisano frazy startowe.')}>Zapisz bez odświeżania</button>}
          {stage && <p className="muted working" role="status">{stage}</p>}
          {msg && <p className={msg.type} role="status">{msg.text}</p>}
        </div>
        <div>
          <form className="row-form" onSubmit={addManual}>
            <label>Dodaj frazę ręcznie (np. z podpowiedzi wyszukiwarki eMAG)<input value={manual} onChange={e => setManual(e.target.value)} /></label>
            <button className="btn ghost" disabled={!manual.trim()}>Dodaj</button>
          </form>
          {kws.length === 0 ? <p className="muted">Bank jest pusty. Kliknij „Odśwież frazy”.</p> : (
            <div className="table-wrap">
              <table className="compact">
                <thead><tr><th>Fraza</th><th className="num">Wyszukiwania / mies.</th><th>Źródło</th><th>Wyklucz</th></tr></thead>
                <tbody>
                  {shown.map(k => (
                    <tr key={k.kw} className={excluded.has(k.kw) ? 'inactive' : ''}>
                      <td>{k.kw}</td>
                      <td className="num">{k.volume == null ? '—' : Number(k.volume).toLocaleString('pl-PL')}</td>
                      <td className="muted">{k.source === 'manual' ? 'ręczna' : 'Google (DataForSEO)'}</td>
                      <td><input type="checkbox" checked={excluded.has(k.kw)} onChange={() => toggle(k.kw)} aria-label={`Wyklucz ${k.kw}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {kws.length > 40 && <button className="link-dark" onClick={() => setAll(!all)}>{all ? 'Pokaż mniej' : `Pokaż wszystkie (${kws.length})`}</button>}
            </div>
          )}
          {excluded.size > 0 && <p className="muted small">Wykluczone: {excluded.size}. AI ich nie użyje (np. frazy z markami konkurencji albo niepasujące do oferty).</p>}
        </div>
      </div>
    </div>
  )
}

export default function Keywords({ profile }) {
  const [banks, setBanks] = useState(null)
  const [cats, setCats] = useState([])
  const [err, setErr] = useState('')
  const [filter, setFilter] = useState('')
  async function load() {
    const [{ data, error }, fam] = await Promise.all([
      supabase.from('keyword_banks').select('*').order('category').order('language'),
      supabase.from('product_families').select('category'),
    ])
    if (error) setErr(plError(error.message)); else setBanks(data)
    setCats([...new Set([...(fam.data || []).map(x => x.category), ...(data || []).map(x => x.category)].filter(Boolean))].sort())
  }
  useEffect(() => { load() }, [])
  if (err) return <section className="page"><h1>Frazy kluczowe</h1><p className="error">{err}</p></section>
  if (!banks) return <section className="page"><DrainLoader /></section>
  const order = { ro: 1, hu: 2, bg: 3 }
  return (
    <section className="page wide">
      <h1>Frazy kluczowe</h1>
      <p className="muted lead">Bank fraz jest wspólny dla całej kategorii w danym języku. Z niego AI dobiera frazę główną i frazy sekcji dla każdego opisu. Odświeżaj raz w miesiącu.</p>
      <AddBank categories={cats} existing={banks} onAdded={load} />
      <div className="seg kw-filter">
        <button className={!filter ? 'seg-btn on' : 'seg-btn'} onClick={() => setFilter('')}>Wszystkie</button>
        {[...new Set(banks.map(b => b.category))].sort().map(c => <button key={c} className={filter === c ? 'seg-btn on' : 'seg-btn'} onClick={() => setFilter(c)}>{c}</button>)}
      </div>
      {[...banks].filter(b => !filter || b.category === filter).sort((a, b) => a.category.localeCompare(b.category) || (order[a.language] || 9) - (order[b.language] || 9)).map(b => <Bank key={b.id + (b.refreshed_at || '') + (b.keywords || []).length + (b.excluded || []).length + b.seeds_verified} bank={b} onChanged={load} canVerify={['akceptujacy', 'admin'].includes(profile?.role)} />)}
    </section>
  )
}
