import { useEffect, useMemo, useState } from 'react'
import mammoth from 'mammoth/mammoth.browser.js'
import { supabase, plError, fetchAll } from '../supabase.js'
import { applies, touchesFamily, scopeLabel, LEVEL_LABEL, LEVEL_HINT, categoryMatch } from '../knowledge.js'
import { runJob } from '../jobs.js'
import DrainLoader from '../components/DrainLoader.jsx'
import { autoAssignTechnologies } from '../knowledge.js'

const plural = (n, one, few, many) => n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? few : many

const TABS = [['do_akceptacji', 'Do akceptacji'], ['zatwierdzony', 'Zatwierdzone'], ['odrzucony', 'Odrzucone'], ['dokumenty', 'Dokumenty']]

// Zakres faktu: poziom → marka → technologia / seria → kolor / SKU (listy zależne od wcześniejszego wyboru)
function ScopePicker({ v, set, ctx }) {
  const fams = ctx.families.filter(f => f.brand_id === v.brand_id)
  // technologie występujące w wybranej kategorii (z przypisań rodzin i reguł słownika); bez kategorii – wszystkie marki
  const techsAll = ctx.techs.filter(t => !t.brand_id || t.brand_id === v.brand_id)
  const inCat = new Set(ctx.families.filter(f => f.brand_id === v.brand_id && categoryMatch(f.category, v.category)).flatMap(f => (f.technologies || []).map(t => t.toLowerCase())))
  const mapped = ctx.techMap.filter(m => m.brand_id === v.brand_id && (categoryMatch(v.category, m.category) || categoryMatch(m.category, v.category))).map(m => m.technology_id)
  const mappedIds = new Set([...mapped, ...techsAll.filter(t => mapped.includes(t.id)).map(t => t.parent_id).filter(Boolean)])
  const techs = !v.category ? techsAll : ctx.techMap.some(m => m.brand_id === v.brand_id) ? techsAll.filter(t => mappedIds.has(t.id))
    : techsAll.filter(t => inCat.has(t.name.toLowerCase()) || (t.match_category && categoryMatch(t.match_category, v.category)))
  const prods = ctx.products.filter(p => p.family_id === v.family_id).sort((a, b) => a.sku.localeCompare(b.sku))
  const colors = [...new Set(prods.map(p => p.attributes?.wykonczenie).filter(Boolean))].sort()
  const brandName = ctx.brands.find(b => b.id === v.brand_id)?.name
  const cats = ctx.categories.filter(c => !c.brand || !brandName || c.brand === brandName)
  const up = patch => set({ ...v, ...patch })
  return (
    <div className="grid-form scope-picker">
      <label>Poziom<select value={v.level} onChange={e => up({ level: e.target.value })}>
        {Object.entries(LEVEL_LABEL).map(([k, l]) => <option key={k} value={k}>{l} – {LEVEL_HINT[k]}</option>)}</select></label>
      <label>Marka<select value={v.brand_id || ''} onChange={e => up({ brand_id: e.target.value, category: '', technology: '', family_id: '', color: '', product_id: '' })}>
        {ctx.brandsWithProducts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
      {['kategoria', 'technologia'].includes(v.level) && <label>Kategoria<select value={v.level === 'technologia' && v.allCats ? '__all' : v.category || ''} onChange={e => up(e.target.value === '__all' ? { category: '', allCats: true } : { category: e.target.value, allCats: false })}>
        <option value="">— wybierz —</option>{v.level === 'technologia' && <option value="__all">wszystkie kategorie (fakt o samej technologii)</option>}{cats.map(c => <option key={c.key} value={c.key}>{c.sub ? '\u00a0\u00a0› ' : ''}{c.label}</option>)}
        {v.category && !cats.some(c => c.key === v.category) && <option value={v.category}>{v.category} (brak w drzewie)</option>}</select></label>}
      {v.level === 'technologia' && <label>Technologia<select value={v.technology || ''} onChange={e => up({ technology: e.target.value })}>
        <option value="">— wybierz —</option>{techs.map(t => <option key={t.id} value={t.name}>{t.parent_id ? '\u00a0\u00a0› ' : ''}{t.name}</option>)}
        {v.technology && !techs.some(t => t.name === v.technology) && <option value={v.technology}>{v.technology} (spoza słownika)</option>}</select></label>}
      {['seria', 'model', 'wariant'].includes(v.level) && <label>Seria<select value={v.family_id || ''} onChange={e => up({ family_id: e.target.value, color: '', product_id: '' })}>
        <option value="">— wybierz —</option>{fams.map(f => <option key={f.id} value={f.id}>{f.model_name}</option>)}</select></label>}
      {v.level === 'model' && <label>Kolor<select value={v.color || ''} onChange={e => up({ color: e.target.value })} disabled={!v.family_id}>
        <option value="">— wybierz —</option>{colors.map(c => <option key={c} value={c}>{c}</option>)}
        {v.color && !colors.includes(v.color) && <option value={v.color}>{v.color} (brak takich SKU)</option>}</select></label>}
      {v.level === 'wariant' && <label>SKU<select value={v.product_id || ''} onChange={e => up({ product_id: e.target.value })} disabled={!v.family_id}>
        <option value="">— wybierz —</option>{prods.map(p => <option key={p.id} value={p.id}>{p.sku}{p.attributes?.wykonczenie ? ` · ${p.attributes.wykonczenie}` : ''}</option>)}</select></label>}
    </div>
  )
}
const scopeComplete = v => v.level === 'marka' ? !!v.brand_id : v.level === 'kategoria' ? !!v.category : v.level === 'technologia' ? !!v.technology && (!!v.category || !!v.allCats) : v.level === 'seria' ? !!v.family_id : v.level === 'model' ? !!(v.family_id && v.color) : !!(v.family_id && v.product_id)
const scopeRow = v => ({ level: v.level, brand_id: v.brand_id || null, category: ['kategoria', 'technologia'].includes(v.level) ? v.category || null : null, technology: v.level === 'technologia' ? v.technology || null : null, series: null,
  family_id: ['seria', 'model', 'wariant'].includes(v.level) ? v.family_id || null : null, color: v.level === 'model' ? v.color || null : null, product_id: v.level === 'wariant' ? v.product_id || null : null })
const scopeOf = f => ({ level: f.level, brand_id: f.brand_id || '', category: f.category || '', allCats: f.level === 'technologia' && !!f.technology && !f.category, technology: f.technology || '', family_id: f.family_id || '', color: f.color || '', product_id: f.product_id || '' })

// Komu fakt trafi do opisów (czytelny podgląd zakresu)
function reach(fact, ctx) {
  const fams = ctx.families.filter(f => touchesFamily(fact, f, ctx.families))
  if (fact.level === 'model') { const n = ctx.products.filter(p => fams.some(f => f.id === p.family_id) && String(p.attributes?.wykonczenie || '').toLowerCase() === String(fact.color || '').toLowerCase()).length; return fams.length ? `Dotyczy: ${fams.map(f => f.model_name).join(', ')} · ${fact.color || '—'} (${n} SKU)` : '' }
  if (fact.level === 'wariant') { const p = ctx.products.find(x => x.id === fact.product_id); return p ? `Dotyczy: ${p.sku}` : '' }
  if (fact.level === 'technologia') {
    const cs = [...new Set(fams.map(f => f.category).filter(Boolean))]
    return fams.length ? `Dotyczy: ${fams.map(f => f.model_name).join(', ')}${!fact.category && cs.length > 1 ? ` – UWAGA: różne kategorie (${cs.join(', ')}), sprawdź, czy fakt pasuje do każdej` : ''}` : ''
  }
  if (fact.level === 'kategoria' || fact.level === 'marka') return fams.length ? `Dotyczy: ${fams.length} ${plural(fams.length, 'seria', 'serie', 'serii')} (${fams.slice(0, 6).map(f => f.model_name).join(', ')}${fams.length > 6 ? '…' : ''})` : ''
  return fams.length ? `Dotyczy: ${fams.map(f => f.model_name).join(', ')}` : ''
}

function FactCard({ fact, ctx, canApprove, onChanged, selectable, selected, onToggle }) {
  const [content, setContent] = useState(fact.content)
  const [source, setSource] = useState(fact.source || '')
  const [err, setErr] = useState('')
  const notes = (fact.source_note || '').split(' · ').filter(Boolean)
  const needsSource = (fact.source_note || '').startsWith('WYMAGA ŹRÓDŁA')
  const [scope, setScope] = useState(scopeOf(fact))
  const [editScope, setEditScope] = useState(false)
  const who = reach(fact, ctx)
  const scopeDirty = JSON.stringify(scopeRow(scope)) !== JSON.stringify(scopeRow(scopeOf(fact)))
  const dirty = content.trim() !== fact.content || source.trim() !== (fact.source || '') || scopeDirty

  async function update(patch) {
    setErr('')
    const { error } = await supabase.from('kb_facts').update(patch).eq('id', fact.id)
    if (error) setErr(plError(error.message)); else onChanged()
  }

  return (
    <article className={'fact' + (selected ? ' fact-selected' : '')}>
      {selectable && <label className="fact-check" title="Zaznacz do usunięcia"><input type="checkbox" checked={!!selected} onChange={() => onToggle(fact.id)} aria-label="Zaznacz fakt" /></label>}
      <div className="fact-main">
        <textarea value={content} onChange={e => setContent(e.target.value)} rows={Math.max(2, Math.ceil(content.length / 90))} aria-label="Treść faktu" />
        <p className="fact-meta">
          <span className="tag">{scopeLabel(fact, ctx.brands, ctx.families, ctx.products, ctx.categories)}</span>
          <span className={who ? 'muted' : 'hint-inline'}>{who || 'Nie trafi do żadnego opisu – popraw zakres'}</span>
          {canApprove && <button className="link-dark small" onClick={() => setEditScope(!editScope)}>{editScope ? 'ukryj zakres' : 'zmień zakres'}</button>}
        </p>
        {editScope && <ScopePicker v={scope} set={setScope} ctx={ctx} />}
        <ul className="notes">
          {notes.map((n, i) => <li key={i} className={n.startsWith('WYMAGA') ? 'tag warn' : 'muted'}>{n}</li>)}
        </ul>
        {err && <p className="error" role="alert">{err}</p>}
      </div>
      <div className="fact-side">
        <label>Źródło{needsSource && <span className="req"> (wymagane)</span>}
          <input value={source} onChange={e => setSource(e.target.value)} placeholder="np. Raport z badania nr…" />
        </label>
        {dirty && <button className="btn ghost" disabled={scopeDirty && !scopeComplete(scope)} onClick={() => update({ content: content.trim(), source: source.trim() || null, ...(scopeDirty ? scopeRow(scope) : {}) })}>Zapisz zmiany</button>}
        {canApprove && fact.status === 'do_akceptacji' && (
          <div className="fact-actions">
            <button className="btn" disabled={needsSource && !source.trim()} title={needsSource && !source.trim() ? 'Najpierw wpisz źródło' : ''}
              onClick={() => update({ content: content.trim(), source: source.trim() || null, status: 'zatwierdzony', ...(scopeDirty && scopeComplete(scope) ? scopeRow(scope) : {}) })}>Zatwierdź</button>
            <button className="btn ghost danger" onClick={() => update({ status: 'odrzucony' })}>Odrzuć</button>
          </div>
        )}
        {fact.status !== 'do_akceptacji' && (
          <button className="link-dark" onClick={() => update({ status: 'do_akceptacji' })}>Cofnij do akceptacji</button>
        )}
      </div>
    </article>
  )
}

function AddFact({ ctx, onAdded }) {
  const aedler = ctx.brandsWithProducts.find(b => b.name === 'Aedler')?.id || ctx.brandsWithProducts[0]?.id
  const [content, setContent] = useState('')
  const [scope, setScope] = useState({ level: 'seria', brand_id: aedler, category: '', technology: '', family_id: '', color: '', product_id: '' })
  const [err, setErr] = useState('')
  async function add(e) {
    e.preventDefault(); setErr('')
    const { error } = await supabase.from('kb_facts').insert({ content: content.trim(), source_note: 'Dodany ręcznie', ...scopeRow(scope) })
    if (error) setErr(plError(error.message)); else { setContent(''); onAdded() }
  }
  return (
    <details className="panel add-fact">
      <summary>Dodaj fakt ręcznie</summary>
      <form onSubmit={add}>
        <label>Treść faktu (jedno zdanie, z nazwą technologii, serii lub modelu)
          <textarea rows={2} value={content} onChange={e => setContent(e.target.value)} />
        </label>
        <ScopePicker v={scope} set={setScope} ctx={ctx} />
        {err && <p className="error">{err}</p>}
        <button className="btn" disabled={content.trim().length < 10 || !scopeComplete(scope)}>Dodaj do akceptacji</button>
      </form>
    </details>
  )
}

function Documents({ ctx, docs, onDone }) {
  const aedler = ctx.brandsWithProducts.find(b => b.name === 'Aedler')?.id || ctx.brandsWithProducts[0]?.id
  const [brandId, setBrandId] = useState(aedler)
  const [stage, setStage] = useState('')
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)

  async function upload(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setErr(''); setResult(null)
    try {
      if (!/\.docx$/i.test(file.name)) throw new Error('Obsługiwany format to DOCX (Word 2007 i nowsze).')
      setStage('Odczytywanie tekstu z dokumentu…')
      const { value: text } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
      if (text.trim().length < 50) throw new Error('Dokument nie zawiera tekstu (może to skan albo same obrazki).')
      setStage('Zapisywanie pliku…')
      const { data: { session } } = await supabase.auth.getSession()
      const path = `${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`
      const up = await supabase.storage.from('kb-docs').upload(path, file)
      if (up.error) throw up.error
      const ins = await supabase.from('kb_documents').insert({ file_name: file.name, file_path: path, status: 'przetwarzanie', uploaded_by: session.user.id }).select('id').single()
      if (ins.error) throw ins.error
      setStage('AI wyciąga fakty (do ok. 2 minut)…')
      const brand = ctx.brands.find(b => b.id === brandId)
      const fams = ctx.families.filter(f => f.brand_id === brandId)
      const res = await runJob('kb_extract', {
        document_id: ins.data.id, file_name: file.name, brand_id: brandId, brand_name: brand?.name, text: text.slice(0, 60000),
        families: fams.map(f => { const pr = ctx.products.filter(p => p.family_id === f.id); return { id: f.id, model_name: f.model_name, series: f.series,
          colors: [...new Set(pr.map(p => p.attributes?.wykonczenie).filter(Boolean))], skus: pr.map(p => ({ id: p.id, sku: p.sku })) } }),
        technologies: ctx.techs.filter(t => !t.brand_id || t.brand_id === brandId).map(t => t.name), series: fams.map(f => f.model_name),
        categories: ctx.categories.filter(c => !c.brand || c.brand === brand?.name).map(c => ({ key: c.key, label: c.label })),
      }, { timeoutSec: 240 })
      setResult(res); onDone()
    } catch (e2) { setErr(plError(e2.message)) } finally { setStage('') }
  }

  return (
    <>
      <div className="panel">
        <h2>Wgraj dokument</h2>
        <p className="muted">AI wyciągnie z niego fakty według zasad księgi wiedzy: bez haseł reklamowych, z flagami twierdzeń wymagających źródła. Wszystkie trafią do akceptacji.</p>
        <div className="row-form">
          <label>Marka<select value={brandId || ''} onChange={e => setBrandId(e.target.value)}>
            {ctx.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label>Plik DOCX<input type="file" accept=".docx" onChange={upload} disabled={!!stage} /></label>
        </div>
        {stage && <p className="muted working" role="status">{stage}</p>}
        {err && <p className="error" role="alert">{err}</p>}
        {result && (
          <div className="extract-result">
            <p className="ok">Wyciągnięto {result.inserted} {plural(result.inserted, 'fakt', 'fakty', 'faktów')}{result.needs_source ? `, w tym ${result.needs_source} ${plural(result.needs_source, 'wymagający', 'wymagające', 'wymagających')} źródła` : ''}. Znajdziesz je w zakładce „Do akceptacji”.</p>
            {result.rejected?.length > 0 && (
              <details><summary>Pominięte fragmenty ({result.rejected.length})</summary>
                <ul className="rejected">{result.rejected.map((r, i) => <li key={i}><q>{r.text}</q> <span className="muted">– {r.reason}</span></li>)}</ul>
              </details>
            )}
          </div>
        )}
      </div>
      <div className="panel table-wrap">
        <table className="compact">
          <thead><tr><th>Dokument</th><th>Wgrany</th><th>Status</th><th>Fakty</th><th>Pominięte</th></tr></thead>
          <tbody>
            {docs.length === 0 && <tr><td colSpan={5} className="muted">Brak dokumentów.</td></tr>}
            {docs.map(d => (
              <tr key={d.id}>
                <td>{d.file_name}</td>
                <td>{new Date(d.created_at).toLocaleDateString('pl-PL')}</td>
                <td>{{ wgrany: 'wgrany', przetwarzanie: 'w trakcie', fakty_wyciagniete: 'gotowy', blad: 'błąd' }[d.status]}</td>
                <td>{d.extraction?.facts ?? '—'}</td>
                <td>{d.extraction?.rejected?.length ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

const odm = (n, a, b, c) => `${n} ${n === 1 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? b : c}`
// Technologie marek z hierarchią: fakty o technologii nadrzędnej trafiają też do jej odmian
function Technologies({ data, admin, onChanged }) {
  const [f, setF] = useState({ name: '', parent_id: '', match_category: '', match_series: '' })
  const [msg, setMsg] = useState(null)
  if (!data.techs.length && !admin) return null
  const roots = data.techs.filter(t => !t.parent_id)
  const famCount = name => data.families.filter(fm => (fm.technologies || []).includes(name)).length
  const factCount = name => data.facts.filter(x => x.level === 'technologia' && x.status === 'zatwierdzony' && String(x.technology || '').toLowerCase() === name.toLowerCase()).length
  const brand = id => data.brands.find(b => b.id === id)?.name || ''
  async function assign() {
    try { const n = await autoAssignTechnologies(supabase); setMsg({ type: 'ok', text: n ? `Uzupełniono technologie w ${n} rodzinach.` : 'Wszystkie rodziny mają już przypisane technologie.' }); onChanged() }
    catch (e) { setMsg({ type: 'error', text: plError(e.message) }) }
  }
  async function add() {
    const parent = data.techs.find(t => t.id === f.parent_id)
    const brand_id = parent?.brand_id || data.brands.find(b => b.name === 'Aedler')?.id || data.brands[0]?.id
    const { error } = await supabase.from('kb_technologies').insert({ brand_id, name: f.name.trim(), parent_id: f.parent_id || null, match_category: f.match_category.trim().toLowerCase() || null, match_series: f.match_series.trim().toLowerCase() || null, sort: data.techs.length + 1 })
    setMsg(error ? { type: 'error', text: plError(error.message) } : { type: 'ok', text: `Dodano technologię „${f.name.trim()}”. Kliknij „Przypisz rodzinom”, żeby uzupełnić rodziny.` })
    if (!error) { setF({ name: '', parent_id: '', match_category: '', match_series: '' }); onChanged() }
  }
  const Row = ({ t, child }) => (
    <li className={child ? 'tech child' : 'tech'}>
      <strong>{t.name}</strong> <span className="muted small">{brand(t.brand_id)}{(() => { const cs = [...new Set(data.families.filter(fm => (fm.technologies || []).includes(t.name)).map(fm => fm.category).filter(Boolean))]; return cs.length ? ` · w kategoriach: ${cs.join(', ')}` : '' })()} · {odm(famCount(t.name), 'rodzina', 'rodziny', 'rodzin')} · {odm(factCount(t.name), 'fakt', 'fakty', 'faktów')}{t.match_category ? ` · kategoria „${t.match_category}”` : ''}{t.match_series ? ` · seria „${t.match_series}”` : ''}</span>
      {data.techs.filter(c => c.parent_id === t.id).length > 0 && <ul>{data.techs.filter(c => c.parent_id === t.id).map(c => <Row key={c.id} t={c} child />)}</ul>}
    </li>
  )
  // nazwy technologii użyte w faktach lub rodzinach, których nie ma w słowniku (np. „Antibac” z wyciągniętego dokumentu)
  const known = new Set(data.techs.map(t => t.name.toLowerCase()))
  const orphanNames = [...new Set([...data.facts.filter(x => x.level === 'technologia' && x.technology).map(x => x.technology.trim()), ...data.families.flatMap(fm => fm.technologies || [])])]
    .filter(n => n && !known.has(n.toLowerCase())).sort((a, b) => a.localeCompare(b, 'pl'))
  const orphanFacts = n => data.facts.filter(x => x.level === 'technologia' && String(x.technology || '').trim().toLowerCase() === n.toLowerCase())
  const orphanFams = n => data.families.filter(fm => (fm.technologies || []).some(t => t.toLowerCase() === n.toLowerCase()))
  async function moveOrphan(name, targetId) {
    const target = data.techs.find(t => t.id === targetId); if (!target) return
    const parent = data.techs.find(t => t.id === target.parent_id)
    try {
      const ids = orphanFacts(name).map(x => x.id)
      if (ids.length) { const e = await supabase.from('kb_facts').update({ technology: target.name }).in('id', ids); if (e.error) throw e.error }
      for (const fm of orphanFams(name)) {
        const next = [...new Set([...(fm.technologies || []).filter(t => t.toLowerCase() !== name.toLowerCase()), target.name, ...(parent ? [parent.name] : [])])].sort()
        const e = await supabase.from('product_families').update({ technologies: next }).eq('id', fm.id); if (e.error) throw e.error
      }
      setMsg({ type: 'ok', text: `„${name}” → „${target.name}”: przeniesiono ${odm(ids.length, 'fakt', 'fakty', 'faktów')}, poprawiono ${odm(orphanFams(name).length, 'rodzinę', 'rodziny', 'rodzin')}.` }); onChanged()
    } catch (e) { setMsg({ type: 'error', text: plError(e.message) }) }
  }
  async function adoptOrphan(name, parentId) {
    const parent = data.techs.find(t => t.id === parentId)
    const brand_id = parent?.brand_id || data.brands.find(b => b.name === 'Aedler')?.id || data.brands[0]?.id
    const { error } = await supabase.from('kb_technologies').insert({ brand_id, name, parent_id: parentId || null, sort: data.techs.length + 1 })
    setMsg(error ? { type: 'error', text: plError(error.message) } : { type: 'ok', text: `„${name}” dodano do słownika${parent ? ` jako odmianę „${parent.name}”` : ''}. Fakty trafią do rodzin, które mają tę technologię przypisaną.` })
    if (!error) onChanged()
  }
  const Orphan = ({ name }) => {
    const [target, setTarget] = useState('')
    const nf = orphanFacts(name).length, nr = orphanFams(name).length
    return (
      <li className="orphan">
        <div><strong>{name}</strong> <span className="muted small">{odm(nf, 'fakt', 'fakty', 'faktów')} · {odm(nr, 'rodzina', 'rodziny', 'rodzin')}{nf && !nr ? ' · fakty nie trafiają do żadnego opisu' : ''}</span></div>
        {admin && <div className="row-actions">
          <select value={target} onChange={e => setTarget(e.target.value)} aria-label={`Technologia docelowa dla ${name}`}><option value="">wybierz technologię…</option>{data.techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          <button className="btn ghost small-btn" disabled={!target} onClick={() => moveOrphan(name, target)}>Przenieś do wybranej</button>
          <button className="link-dark small" onClick={() => adoptOrphan(name, target)}>{target ? 'albo dodaj jako jej odmianę' : 'albo dodaj do słownika'}</button>
        </div>}
      </li>
    )
  }
  return (
    <details className="panel tech-panel" open={orphanNames.length > 0 || undefined}>
      <summary><strong>Technologie</strong> <span className="muted small">{roots.map(r => r.name).join(' · ') || 'brak'} – fakty o technologii nadrzędnej trafiają też do jej odmian</span>{orphanNames.length > 0 && <span className="tag warn">{orphanNames.length} spoza słownika</span>}</summary>
      <ul className="tech-tree">{roots.map(t => <Row key={t.id} t={t} />)}</ul>
      {orphanNames.length > 0 && <div className="orphans">
        <strong>Spoza słownika</strong>
        <p className="muted small">Te nazwy są użyte w faktach lub przypisaniach rodzin, ale nie ma ich w słowniku technologii – najczęściej pochodzą z dokumentów wgranych do Księgi wiedzy. Przenieś je do właściwej technologii albo dodaj do słownika.</p>
        <ul>{orphanNames.map(n => <Orphan key={n} name={n} />)}</ul>
      </div>}
      <p className="muted small">Rodziny dostają technologie według mapy kategoria × technologia (Ustawienia → Mapa technologii) – przy imporcie automatycznie. Ręcznie dopisane technologie spoza słownika zostają.</p>
      {admin && <p className="small"><a href="#/ustawienia?tab=technologie">Zarządzaj technologiami i mapą kategoria × technologia → Ustawienia</a></p>}
      {msg && <p className={msg.type}>{msg.text}</p>}
    </details>
  )
}

export default function Knowledge({ profile }) {
  const [tab, setTabRaw] = useState('do_akceptacji')
  const [sel, setSel] = useState(new Set())
  const [flt, setFlt] = useState({ q: '', doc: '', level: '' })
  const [delMsg, setDelMsg] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const setTab = k => { setTabRaw(k); setSel(new Set()); setDelMsg(null) }
  const isAdmin = profile?.role === 'admin'
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const canApprove = ['akceptujacy', 'admin'].includes(profile?.role)

  async function load() {
    const [f, b, fam, d, tq, pr, as, mq] = await Promise.all([
      fetchAll('kb_facts', '*', q => q.order('created_at')).then(data => ({ data }), error => ({ error })),   // wszystkie fakty (pojedyncze zapytanie zwraca maks. 1000)
      supabase.from('brands').select('id, name'),
      supabase.from('product_families').select('id, brand_id, model_name, series, category, technologies').order('model_name'),
      supabase.from('kb_documents').select('*').order('created_at', { ascending: false }),
      supabase.from('kb_technologies').select('*').order('sort'),
      fetchAll('products', 'id, sku, family_id, attributes').catch(() => []),
      fetchAll('assortment', 'brand, category_path').catch(() => []),
      supabase.from('kb_category_tech').select('*'),
    ])
    const err = [f, b, fam, d].find(x => x.error)?.error
    if (err) { setError(plError(err.message)); return }
    setData({ facts: f.data, brands: b.data, families: fam.data, docs: d.data, techs: tq.error ? [] : (tq.data || []), products: pr || [], paths: as || [], techMap: mq.error ? [] : (mq.data || []) })
  }
  useEffect(() => { load() }, [])

  const ctx = useMemo(() => {
    if (!data) return null
    const uniq = arr => [...new Set(arr.filter(Boolean).map(s => s.trim()))].sort()
    // marki tylko z produktami w aplikacji (gdy żadna nie ma – wszystkie)
    const withP = data.brands.filter(b => data.families.some(f => f.brand_id === b.id))
    // kategorie: z drzewa PIM (poziom główny + podkategorie), a gdy drzewa brak – z kategorii rodzin
    const cm = new Map()
    for (const r of data.paths) {
      const path = (r.category_path || []).filter(Boolean); if (!path.length) continue
      const top = path[0].toLowerCase()
      if (!cm.has(top)) cm.set(top, { key: top, label: path[0], brand: r.brand, sub: false })
      if (path.length > 1) { const key = path.join(' ').toLowerCase(); if (!cm.has(key)) cm.set(key, { key, label: path.join(' › '), brand: r.brand, sub: true }) }
    }
    if (!cm.size) data.families.forEach(f => f.category && !cm.has(f.category) && cm.set(f.category, { key: f.category, label: f.category.replace(/^\p{L}/u, m => m.toUpperCase()), brand: null, sub: false }))
    const categories = [...cm.values()].sort((a, b) => a.key.localeCompare(b.key, 'pl'))
    return { categories, techMap: data.techMap, brands: data.brands, brandsWithProducts: withP.length ? withP : data.brands, families: data.families, techs: data.techs, products: data.products,
      technologies: data.techs.length ? uniq(data.techs.map(t => t.name)) : uniq([...data.facts.map(f => f.technology), ...data.families.flatMap(f => f.technologies || [])]),
      series: uniq([...data.facts.map(f => f.series), ...data.families.map(f => f.series)]) }
  }, [data])

  if (error) return <section className="page"><h1>Księga wiedzy</h1><p className="error">{error}</p></section>
  if (!data) return <section className="page"><DrainLoader /></section>

  const count = s => data.facts.filter(f => f.status === s).length
  const ql = flt.q.trim().toLowerCase()
  const shown = data.facts.filter(f => f.status === tab
    && (!flt.doc || (flt.doc === 'reczne' ? !f.document_id : f.document_id === flt.doc))
    && (!flt.level || f.level === flt.level)
    && (!ql || [f.content, f.source, f.source_note, f.technology, f.series, f.category].some(x => String(x || '').toLowerCase().includes(ql))))
  const inTab = data.facts.filter(f => f.status === tab)
  const docsInTab = data.docs.filter(d => inTab.some(f => f.document_id === d.id))
  const selShown = shown.filter(f => sel.has(f.id))
  const allShown = shown.length > 0 && selShown.length === shown.length
  const toggle = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAll = () => setSel(s => { const n = new Set(s); if (allShown) shown.forEach(f => n.delete(f.id)); else shown.forEach(f => n.add(f.id)); return n })
  const faktow = n => `${n} ${n === 1 ? 'fakt' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 'fakty' : 'faktów'}`
  async function removeSelected() {
    const ids = selShown.map(f => f.id); if (!ids.length) return
    if (!confirm(`Usunąć ${faktow(ids.length)} z Księgi wiedzy?\n\nFakty zostaną trwale usunięte z bazy i przestaną trafiać do nowo generowanych opisów. Opisy już wygenerowane się nie zmienią. Tej operacji nie można cofnąć.`)) return
    setDeleting(true); setDelMsg(null)
    let done = 0
    try {
      for (let i = 0; i < ids.length; i += 200) {
        const { error, count } = await supabase.from('kb_facts').delete({ count: 'exact' }).in('id', ids.slice(i, i + 200))
        if (error) throw error
        done += count ?? 0
      }
      setDelMsg(done === ids.length ? { type: 'ok', text: `Usunięto ${faktow(done)}.` } : { type: 'error', text: `Usunięto ${done} z ${ids.length} – pozostałych nie udało się usunąć (sprawdź uprawnienia).` })
      setSel(new Set()); await load()
    } catch (e) { setDelMsg({ type: 'error', text: plError(e.message) }); await load() } finally { setDeleting(false) }
  }

  return (
    <section className="page">
      <h1>Księga wiedzy</h1>
      <Technologies data={data} admin={profile?.role === 'admin'} onChanged={load} />
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k)}>
            {l}{k !== 'dokumenty' && <span className="count">{count(k)}</span>}
          </button>
        ))}
      </div>
      {tab === 'dokumenty' ? <Documents ctx={ctx} docs={data.docs} onDone={load} /> : (
        <>
          {tab === 'do_akceptacji' && !canApprove && <p className="hint">Fakty zatwierdza osoba z rolą Akceptujący. Możesz poprawiać ich treść i dodawać źródła.</p>}
          {tab === 'do_akceptacji' && data.facts.some(f => f.level === 'technologia' && !data.families.some(fam => applies(f, fam, data.families))) &&
            <p className="hint">Fakty o technologii trafiają do rodzin, którym tę technologię przypiszesz na ekranie Produkty. Przypisuj wyłącznie technologie, które rodzina faktycznie ma – inaczej fakty trafią do niewłaściwych opisów.</p>}
          {tab === 'do_akceptacji' && <AddFact ctx={ctx} onAdded={load} />}
          {inTab.length > 0 && <div className="panel fact-tools">
            <div className="filters">
              <input placeholder="Szukaj w treści, źródle, technologii…" value={flt.q} onChange={e => setFlt({ ...flt, q: e.target.value })} />
              <select value={flt.doc} onChange={e => setFlt({ ...flt, doc: e.target.value })} aria-label="Dokument źródłowy">
                <option value="">wszystkie źródła</option>
                <option value="reczne">dodane ręcznie / z nauki</option>
                {docsInTab.map(d => <option key={d.id} value={d.id}>{d.file_name}</option>)}
              </select>
              <select value={flt.level} onChange={e => setFlt({ ...flt, level: e.target.value })} aria-label="Poziom">
                <option value="">wszystkie poziomy</option>
                {Object.entries(LEVEL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              {(flt.q || flt.doc || flt.level) && <button className="link-dark small" onClick={() => setFlt({ q: '', doc: '', level: '' })}>wyczyść filtry</button>}
            </div>
            {isAdmin && <div className="row-actions fact-bulk">
              <label className="check"><input type="checkbox" checked={allShown} ref={el => { if (el) el.indeterminate = !allShown && selShown.length > 0 }} onChange={toggleAll} disabled={!shown.length} /> Zaznacz wszystkie widoczne ({shown.length})</label>
              <span className="muted small">{selShown.length ? `zaznaczono: ${selShown.length}` : 'nic nie zaznaczono'}</span>
              <button className="btn danger-btn small-btn" disabled={!selShown.length || deleting} onClick={removeSelected}>{deleting ? 'Usuwanie…' : `Usuń zaznaczone${selShown.length ? ` (${selShown.length})` : ''}`}</button>
            </div>}
            {!isAdmin && <p className="muted small">Fakty usuwa administrator.</p>}
            {delMsg && <p className={delMsg.type} role="status">{delMsg.text}</p>}
          </div>}
          {shown.length === 0 && <div className="panel empty"><p className="muted">{inTab.length ? 'Brak faktów pasujących do filtrów.' : 'Brak faktów w tej zakładce.'}</p></div>}
          {shown.map(f => <FactCard key={f.id + f.status + (f.source || '') + f.content} fact={f} ctx={ctx} canApprove={canApprove} onChanged={load} selectable={isAdmin} selected={sel.has(f.id)} onToggle={toggle} />)}
        </>
      )}
    </section>
  )
}
