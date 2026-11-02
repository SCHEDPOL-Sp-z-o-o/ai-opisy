import { Fragment, useEffect, useMemo, useState } from 'react'
import { supabase, plError, fetchAll } from '../supabase.js'
import { categoryMatch, techPlan } from '../knowledge.js'
import DrainLoader from './DrainLoader.jsx'

const odm = (n, a, b, c) => `${n} ${n === 1 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? b : c}`
const MODES = { '': '—', wg_pim: 'wg PIM', wszystkie: 'wszystkie serie' }

function TechRow({ t, techs, famCount, factCount, onSave, onDelete }) {
  const [v, setV] = useState({ name: t.name, parent_id: t.parent_id || '', match_series: t.match_series || '' })
  useEffect(() => setV({ name: t.name, parent_id: t.parent_id || '', match_series: t.match_series || '' }), [t])
  const dirty = v.name.trim() !== t.name || (v.parent_id || null) !== (t.parent_id || null) || (v.match_series.trim().toLowerCase() || null) !== (t.match_series || null)
  return (
    <tr>
      <td><input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} aria-label="Nazwa technologii" /></td>
      <td><select value={v.parent_id} onChange={e => setV({ ...v, parent_id: e.target.value })} aria-label="Technologia nadrzędna">
        <option value="">— brak —</option>{techs.filter(x => x.id !== t.id && !x.parent_id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
      <td><input value={v.match_series} onChange={e => setV({ ...v, match_series: e.target.value })} placeholder="np. stabildense" aria-label="Klucz w PIM" /></td>
      <td className="num-cell">{famCount}</td><td className="num-cell">{factCount}</td>
      <td className="actions nowrap">
        {dirty && <button className="btn ghost small-btn" disabled={!v.name.trim()} onClick={() => onSave(t, v)}>Zapisz</button>}
        <button className="link-dark danger-link" onClick={() => onDelete(t)}>Usuń</button>
      </td>
    </tr>
  )
}

export default function TechMap() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [brandId, setBrandId] = useState('')
  const [msg, setMsg] = useState(null)
  const [plan, setPlan] = useState(null)
  const [nt, setNt] = useState({ name: '', parent_id: '', match_series: '' })

  async function load() {
    try {
      const [b, t, m, fam, facts, as] = await Promise.all([
        supabase.from('brands').select('id, name').order('name'),
        supabase.from('kb_technologies').select('*').order('sort'),
        supabase.from('kb_category_tech').select('*'),
        fetchAll('product_families', 'id, brand_id, model_name, category, series, technologies'),
        fetchAll('kb_facts', 'id, level, technology', q => q.eq('level', 'technologia')),
        fetchAll('assortment', 'brand, category_path').catch(() => []),
      ])
      const e = [b, t, m].find(x => x.error)?.error
      if (e) throw e
      setD({ brands: b.data, techs: t.data, map: m.data, families: fam, facts, paths: as })
      if (!brandId) { const withP = b.data.find(x => fam.some(f => f.brand_id === x.id)); setBrandId((withP || b.data[0])?.id || '') }
    } catch (e) { setErr(/kb_category_tech/.test(e.message) ? 'Baza nie ma jeszcze mapy technologii – uruchom migrację 27_mapa_technologii.sql.' : plError(e.message)) }
  }
  useEffect(() => { load() }, [])

  const view = useMemo(() => {
    if (!d || !brandId) return null
    const brand = d.brands.find(b => b.id === brandId)
    const techs = d.techs.filter(t => t.brand_id === brandId)
    const ordered = techs.filter(t => !t.parent_id).flatMap(p => [p, ...techs.filter(c => c.parent_id === p.id)]).concat(techs.filter(c => c.parent_id && !techs.some(p => p.id === c.parent_id)))
    const fams = d.families.filter(f => f.brand_id === brandId)
    // kategorie z drzewa PIM (główne + podkategorie), a gdy brak – z kategorii rodzin
    const cm = new Map()
    for (const r of d.paths.filter(r => !brand || r.brand === brand.name)) {
      const path = (r.category_path || []).filter(Boolean); if (!path.length) continue
      const top = path[0].toLowerCase()
      if (!cm.has(top)) cm.set(top, { key: top, label: path[0], sub: false })
      if (path.length > 1) { const key = path.join(' ').toLowerCase(); if (!cm.has(key)) cm.set(key, { key, label: path.slice(1).join(' › '), parent: top, sub: true }) }
    }
    if (!cm.size) fams.forEach(f => f.category && !cm.has(f.category) && cm.set(f.category, { key: f.category, label: f.category, sub: false }))
    const cats = [...cm.values()].sort((a, b) => (a.sub ? a.parent : a.key).localeCompare(b.sub ? b.parent : b.key, 'pl') || (a.sub - b.sub) || a.key.localeCompare(b.key, 'pl'))
    const map = d.map.filter(m => m.brand_id === brandId)
    return { brand, techs: ordered, fams, cats, map }
  }, [d, brandId])

  if (err) return <p className="error">{err}</p>
  if (!d) return <DrainLoader />
  if (!view) return <p className="muted">Brak marek.</p>
  const famCount = name => view.fams.filter(f => (f.technologies || []).includes(name)).length
  const factCount = name => d.facts.filter(f => String(f.technology || '').toLowerCase() === name.toLowerCase()).length
  const cell = (cat, t) => view.map.find(m => m.category === cat && m.technology_id === t.id)
  const inherited = (cat, t) => view.map.find(m => m.technology_id === t.id && m.category !== cat && categoryMatch(cat, m.category))
  const seriesIn = cat => view.fams.filter(f => categoryMatch(f.category, cat)).length

  async function setCell(cat, t, mode) {
    setMsg(null); setPlan(null)
    const cur = cell(cat, t)
    const r = !mode ? await supabase.from('kb_category_tech').delete().eq('id', cur.id)
      : cur ? await supabase.from('kb_category_tech').update({ mode }).eq('id', cur.id)
      : await supabase.from('kb_category_tech').insert({ brand_id: brandId, category: cat, technology_id: t.id, mode })
    if (r.error) setMsg({ type: 'error', text: plError(r.error.message) }); else load()
  }
  async function saveTech(t, v) {
    setMsg(null)
    const name = v.name.trim(), old = t.name
    const u = await supabase.from('kb_technologies').update({ name, parent_id: v.parent_id || null, match_series: v.match_series.trim().toLowerCase() || null }).eq('id', t.id)
    if (u.error) { setMsg({ type: 'error', text: plError(u.error.message) }); return }
    if (name !== old) {
      // zmiana nazwy przenosi się na fakty i rodziny
      const ids = d.facts.filter(f => String(f.technology || '').toLowerCase() === old.toLowerCase()).map(f => f.id)
      if (ids.length) await supabase.from('kb_facts').update({ technology: name }).in('id', ids)
      for (const f of d.families.filter(f => (f.technologies || []).includes(old))) await supabase.from('product_families').update({ technologies: f.technologies.map(x => x === old ? name : x) }).eq('id', f.id)
    }
    setMsg({ type: 'ok', text: name !== old ? `Zmieniono nazwę „${old}” → „${name}” w słowniku, faktach i rodzinach.` : `Zapisano „${name}”.` }); load()
  }
  async function deleteTech(t) {
    const nf = factCount(t.name), nr = famCount(t.name), kids = view.techs.filter(x => x.parent_id === t.id).length
    if (!confirm(`Usunąć technologię „${t.name}”?\n\n${nr ? `• ${odm(nr, 'rodzina straci', 'rodziny stracą', 'rodzin straci')} tę technologię\n` : ''}${nf ? `• ${odm(nf, 'fakt', 'fakty', 'faktów')} trafi do sekcji „Spoza słownika” w Księdze wiedzy (nie zostaną usunięte)\n` : ''}${kids ? `• ${odm(kids, 'odmiana stanie się', 'odmiany staną się', 'odmian stanie się')} technologią główną\n` : ''}• przypisania w mapie zostaną usunięte`)) return
    const r = await supabase.from('kb_technologies').delete().eq('id', t.id)
    if (r.error) { setMsg({ type: 'error', text: plError(r.error.message) }); return }
    for (const f of d.families.filter(f => (f.technologies || []).includes(t.name))) await supabase.from('product_families').update({ technologies: f.technologies.filter(x => x !== t.name) }).eq('id', f.id)
    setMsg({ type: 'ok', text: `Usunięto „${t.name}”.` }); load()
  }
  async function addTech() {
    const r = await supabase.from('kb_technologies').insert({ brand_id: brandId, name: nt.name.trim(), parent_id: nt.parent_id || null, match_series: nt.match_series.trim().toLowerCase() || null, sort: d.techs.length + 1 })
    if (r.error) setMsg({ type: 'error', text: plError(r.error.message) }); else { setNt({ name: '', parent_id: '', match_series: '' }); setMsg({ type: 'ok', text: `Dodano „${nt.name.trim()}”. Przypisz ją kategoriom w mapie poniżej.` }); load() }
  }
  async function applyPlan() {
    let n = 0
    for (const x of plan) { const r = await supabase.from('product_families').update({ technologies: x.next }).eq('id', x.family.id); if (!r.error) n++ }
    setPlan(null); setMsg({ type: 'ok', text: `Zaktualizowano technologie w ${odm(n, 'rodzinie', 'rodzinach', 'rodzinach')}.` }); load()
  }

  return (
    <>
      <div className="panel">
        <div className="techmap-head">
          <h2>Technologie marki</h2>
          <label className="inline-label">Marka<select value={brandId} onChange={e => { setBrandId(e.target.value); setPlan(null) }}>
            {d.brands.map(b => <option key={b.id} value={b.id}>{b.name}{d.families.some(f => f.brand_id === b.id) ? '' : ' (bez produktów)'}</option>)}</select></label>
        </div>
        <p className="muted small">Słownik technologii marki. Odmiana (np. technologia kompozytowa) dziedziczy fakty technologii nadrzędnej. „Klucz w PIM” to tekst z pola serii/technologii w PIM, po którym rozpoznawane są serie w trybie „wg PIM”.</p>
        <div className="table-wrap"><table className="compact techmap-techs">
          <thead><tr><th>Technologia</th><th>Nadrzędna</th><th>Klucz w PIM</th><th className="num-cell">Rodziny</th><th className="num-cell">Fakty</th><th /></tr></thead>
          <tbody>
            {view.techs.map(t => <TechRow key={t.id} t={t} techs={view.techs} famCount={famCount(t.name)} factCount={factCount(t.name)} onSave={saveTech} onDelete={deleteTech} />)}
            <tr className="add-row">
              <td><input value={nt.name} onChange={e => setNt({ ...nt, name: e.target.value })} placeholder="Nowa technologia…" /></td>
              <td><select value={nt.parent_id} onChange={e => setNt({ ...nt, parent_id: e.target.value })}><option value="">— brak —</option>{view.techs.filter(x => !x.parent_id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></td>
              <td><input value={nt.match_series} onChange={e => setNt({ ...nt, match_series: e.target.value })} placeholder="np. stabildense" /></td>
              <td colSpan={2} /><td><button className="btn small-btn" disabled={!nt.name.trim()} onClick={addTech}>Dodaj</button></td>
            </tr>
          </tbody>
        </table></div>
      </div>

      <div className="panel">
        <h2>Mapa: kategoria × technologia</h2>
        <p className="muted small"><strong>wg PIM</strong> – technologię dostają serie, które mają ją w PIM; <strong>wszystkie serie</strong> – każda seria w kategorii. Przypisanie do kategorii głównej (np. Brodziki) obejmuje jej podkategorie – widać to jako „↳ z kategorii”.</p>
        {view.techs.length === 0 ? <p className="muted">Najpierw dodaj technologie marki.</p> : (
          <div className="table-wrap"><table className="compact techmap-grid">
            <thead><tr><th>Kategoria</th><th className="num-cell">Serie</th>{view.techs.map(t => <th key={t.id}>{t.parent_id ? '› ' : ''}{t.name}</th>)}</tr></thead>
            <tbody>{view.cats.map(c => (
              <tr key={c.key} className={c.sub ? 'sub-cat' : ''}>
                <td>{c.sub ? <span className="muted">↳ </span> : null}{c.label}</td>
                <td className="num-cell">{seriesIn(c.key)}</td>
                {view.techs.map(t => {
                  const own = cell(c.key, t), inh = !own && inherited(c.key, t)
                  return (
                    <td key={t.id} className={own ? 'on' : inh ? 'inh' : ''}>
                      <select value={own?.mode || ''} onChange={e => setCell(c.key, t, e.target.value)} aria-label={`${c.label} – ${t.name}`}>
                        {Object.entries(MODES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                      {inh && <span className="inh-note">↳ z kategorii ({MODES[inh.mode]})</span>}
                    </td>
                  )
                })}
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <div className="row-actions">
          <button className="btn" onClick={() => { const p = techPlan(view.fams, d.techs.filter(t => t.brand_id === brandId), d.map); setPlan(p); setMsg(p.length ? null : { type: 'ok', text: 'Technologie wszystkich rodzin są zgodne z mapą.' }) }}>Zastosuj do rodzin…</button>
          <span className="muted small">Najpierw pokaże podgląd zmian. Technologie spoza słownika dopisane ręcznie zostają.</span>
        </div>
        {plan && plan.length > 0 && (
          <div className="plan">
            <strong>Podgląd: {odm(plan.length, 'rodzina zmieni', 'rodziny zmienią', 'rodzin zmieni')} technologie</strong>
            <ul>{plan.map(x => <li key={x.family.id}><strong>{x.family.model_name}</strong> <span className="muted small">({x.family.category || '—'})</span>{x.add.length > 0 && <span className="ch-plus"> + {x.add.join(', ')}</span>}{x.remove.length > 0 && <span className="ch-minus"> − {x.remove.join(', ')}</span>}</li>)}</ul>
            <div className="row-actions"><button className="btn" onClick={applyPlan}>Zapisz zmiany</button><button className="link-dark" onClick={() => setPlan(null)}>Anuluj</button></div>
          </div>
        )}
        {msg && <p className={msg.type} role="status">{msg.text}</p>}
      </div>
    </>
  )
}
