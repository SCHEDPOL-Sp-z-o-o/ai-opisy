import { useEffect, useMemo, useState } from 'react'
import { supabase, plError, fetchAll } from '../supabase.js'
import { parseTemplate, fillTemplate } from '../offerTemplate.js'
import { SOURCES, PRODUCT_FIELDS, ATTR_KEYS, PENDING, computeField, defaultRules } from '../offerRules.js'
import DrainLoader from '../components/DrainLoader.jsx'

// Oferta i kanały: szablon kanału (eMAG) → reguły pól → automatyczne uzupełnienie → weryfikacja człowieka → eksport do oryginalnego pliku
const ST = { ok: 'OK', do_sprawdzenia: 'do sprawdzenia', brak: 'brak', zatwierdzone: 'zatwierdzone' }
const BUCKET = 'channel-templates'
const short = (s, n = 28) => { const t = String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }
const fname = code => String(code).replace(/:\s*\[\d+\]$/, '')
const plN = (n, a, b, c) => `${n} ${n === 1 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? b : c}`

function Templates({ templates, channels, brands, admin, onChanged, setMsg }) {
  const [f, setF] = useState({ name: 'eMAG HU – Wanny (Cazi)', market: 'HU', channel_id: '', brand_id: '', currency: 'HUF', vat: '0.23', language: 'Maghiara (hu_HU)' })
  const [file, setFile] = useState(null), [parsed, setParsed] = useState(null), [busy, setBusy] = useState(false)
  async function pick(fl) { setMsg(null); try { const buf = await fl.arrayBuffer(); setParsed(await parseTemplate(buf)); setFile(fl) } catch (e) { setParsed(null); setMsg({ type: 'error', text: e.message }) } }
  async function save() {
    setBusy(true)
    try {
      const brand = brands.find(b => b.id === f.brand_id)?.name
      const settings = { currency: f.currency, vat: f.vat, language: f.language, brand }
      const { data: { session } } = await supabase.auth.getSession()
      const ins = await supabase.from('channel_templates').insert({ name: f.name.trim(), marketplace: 'eMAG', market: f.market, channel_id: f.channel_id || null, brand_id: f.brand_id || null, settings, fields: parsed.fields, start_row: parsed.startRow, file_name: file.name, created_by: session.user.id }).select('id').single()
      if (ins.error) throw ins.error
      const path = `${ins.data.id}/${file.name.replace(/[^\w.-]+/g, '_')}`
      const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true }); if (up.error) throw up.error
      await supabase.from('channel_templates').update({ file_path: path }).eq('id', ins.data.id)
      const r = await supabase.from('offer_rules').insert(defaultRules(parsed.fields, settings).map(x => ({ template_id: ins.data.id, ...x }))); if (r.error) throw r.error
      setMsg({ type: 'ok', text: `Wczytano szablon „${f.name}”: ${parsed.fields.length} pól, reguły domyślne gotowe do sprawdzenia.` }); setParsed(null); setFile(null); onChanged(ins.data.id)
    } catch (e) { setMsg({ type: 'error', text: /channel_templates|offer_rules/.test(e.message) ? 'Brak tabel modułu – uruchom migrację 43_oferta_kanaly.sql.' : /bucket|Bucket/.test(e.message) ? 'Brak miejsca na pliki szablonów – uruchom migrację 43 (tworzy bucket „channel-templates”).' : plError(e.message) }) } finally { setBusy(false) }
  }
  async function remove(t) {
    if (!confirm(`Usunąć szablon „${t.name}” razem z regułami i wartościami ofert?`)) return
    if (t.file_path) await supabase.storage.from(BUCKET).remove([t.file_path])
    const { error } = await supabase.from('channel_templates').delete().eq('id', t.id)
    setMsg(error ? { type: 'error', text: plError(error.message) } : { type: 'ok', text: 'Szablon usunięty.' }); onChanged()
  }
  return (
    <>
      {templates.length > 0 && <div className="table-wrap"><table className="compact">
        <thead><tr><th>Szablon</th><th>Rynek</th><th>Kanał treści</th><th>Pola</th><th>Plik</th>{admin && <th />}</tr></thead>
        <tbody>{templates.map(t => <tr key={t.id}><td><strong>{t.name}</strong></td><td>{t.marketplace} {t.market}</td><td>{channels.find(c => c.id === t.channel_id)?.label || <span className="warn-text">nie wybrano</span>}</td>
          <td>{t.fields.length} · obowiązkowych {t.fields.filter(x => x.mandatory).length}</td><td className="small muted">{t.file_name}</td>{admin && <td><button className="link-dark danger-link small" onClick={() => remove(t)}>usuń</button></td>}</tr>)}</tbody>
      </table></div>}
      {admin && <div className="tpl-add">
        <h3>Wczytaj szablon kanału</h3>
        <p className="muted small">Plik „create product” z panelu eMAG dla kategorii (np. Wanny). Studio zapamięta pola, wymagania i listy dozwolonych wartości; eksport wpisze dane do kopii tego pliku.</p>
        <input type="file" accept=".xlsx" onChange={e => e.target.files[0] && pick(e.target.files[0])} />
        {parsed && <>
          <p className="small">Pól: <strong>{parsed.fields.length}</strong> · obowiązkowych: {parsed.fields.filter(x => x.mandatory).length} · z listą wartości: {parsed.fields.filter(x => x.values).length} (zamkniętych: {parsed.fields.filter(x => x.restrictive).length})</p>
          <div className="grid-form price-form">
            <label>Nazwa<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
            <label>Rynek<select value={f.market} onChange={e => setF({ ...f, market: e.target.value, currency: { HU: 'HUF', RO: 'RON', BG: 'EUR' }[e.target.value], language: { HU: 'Maghiara (hu_HU)', RO: 'Romana (ro_RO)', BG: 'Bulgara (bg_BG)' }[e.target.value] })}><option>HU</option><option>RO</option><option>BG</option></select></label>
            <label>Kanał treści (tytuł, opis)<select value={f.channel_id} onChange={e => setF({ ...f, channel_id: e.target.value })}><option value="">— wybierz —</option>{channels.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
            <label>Marka<select value={f.brand_id} onChange={e => setF({ ...f, brand_id: e.target.value })}><option value="">— wybierz —</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
            <label>Waluta<input value={f.currency} onChange={e => setF({ ...f, currency: e.target.value })} /></label>
            <label>VAT (ułamek)<select value={f.vat} onChange={e => setF({ ...f, vat: e.target.value })}>{['0.23', '0.08', '0.05', '0'].map(v => <option key={v}>{v}</option>)}</select></label>
          </div>
          <div className="row-actions"><button className="btn" disabled={busy || !f.name.trim() || !f.brand_id} onClick={save}>{busy ? 'Zapisywanie…' : 'Zapisz szablon'}</button></div>
        </>}
      </div>}
    </>
  )
}

function Rules({ tpl, rules, sampleCtx, onSaved, setMsg }) {
  // wymagalność pola można poprawić ręcznie (szablony eMAG bywają niespójne) – zapis w polach szablonu
  async function setReq(f, level) {
    const fields = tpl.fields.map(x => x.code !== f.code ? x : { ...x, mandatory: level === 'obowiazkowe', conditional: level === 'warunkowe', override: (x.override ?? x.req) })
    const { error } = await supabase.from('channel_templates').update({ fields, updated_at: new Date().toISOString() }).eq('id', tpl.id)
    setMsg(error ? { type: 'error', text: plError(error.message) } : { type: 'ok', text: `„${fname(f.label)}” – teraz ${level === 'obowiazkowe' ? 'obowiązkowe' : level === 'warunkowe' ? 'warunkowe' : 'opcjonalne'}.` })
    if (!error) onSaved()
  }
  const [rows, setRows] = useState(rules), [dirty, setDirty] = useState(new Set())
  useEffect(() => { setRows(rules); setDirty(new Set()) }, [rules])
  const set = (code, patch) => { setRows(r => r.map(x => x.code === code ? { ...x, ...patch, config: { ...x.config, ...(patch.config || {}) } } : x)); setDirty(d => new Set(d).add(code)) }
  async function save() {
    const ch = rows.filter(r => dirty.has(r.code)).map(r => ({ template_id: tpl.id, code: r.code, source: r.source, config: r.config, updated_at: new Date().toISOString() }))
    const { error } = await supabase.from('offer_rules').upsert(ch)
    setMsg(error ? { type: 'error', text: plError(error.message) } : { type: 'ok', text: `Zapisano reguły: ${ch.length}. Uruchom „Uzupełnij automatycznie”, żeby przeliczyć wartości.` }); if (!error) onSaved()
  }
  const R = Object.fromEntries(rows.map(r => [r.code, r]))
  const inp = (r, k, ph, w = 90) => <input className="inline-input" style={{ width: w }} placeholder={ph} value={r.config?.[k] ?? ''} onChange={e => set(r.code, { config: { [k]: e.target.value } })} />
  return (
    <>
      <p className="muted small">Dla każdego pola: skąd brać wartość i jak ją przekształcić. „Słownik” zamienia wartości z Waszych danych na wartości z listy eMAG (np. <code>biały połysk=Alb lucios</code>; kolejne pary po średniku). Przykład liczony dla: <strong>{sampleCtx?.product?.sku || '—'}</strong>.</p>
      <div className="table-wrap"><table className="compact rules-table">
        <thead><tr><th>Pole eMAG</th><th>Wymagane</th><th>Źródło</th><th>Ustawienia</th><th>Przykład</th></tr></thead>
        <tbody>{tpl.fields.filter(f => R[f.code]).map(f => { const r = R[f.code], c = r.config || {}, ex = sampleCtx ? computeField(r, f, sampleCtx) : null
          return (
            <tr key={f.code} className={dirty.has(f.code) ? 'row-dirty' : ''}>
              <td><strong>{f.label}</strong><div className="muted small mono">{fname(f.code)}{f.values ? ` · lista ${f.values.length}${f.restrictive ? ' (zamknięta)' : ''}` : ''}</div></td>
              <td className="small"><select className={f.mandatory ? 'req-must' : ''} value={f.mandatory ? 'obowiazkowe' : f.conditional ? 'warunkowe' : 'opcjonalne'} onChange={e => setReq(f, e.target.value)} aria-label="Wymagalność pola">
                <option value="obowiazkowe">obowiązkowe</option><option value="warunkowe">warunkowe</option><option value="opcjonalne">opcjonalne</option></select>
                {f.override && <div className="muted small" title="Zmieniono ręcznie">w szablonie eMAG: {f.override}</div>}</td>
              <td><select value={r.source} onChange={e => set(f.code, { source: e.target.value })}>{Object.entries(SOURCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
              <td className="rule-cfg">
                {r.source === 'pole' && <select value={c.key || ''} onChange={e => set(f.code, { config: { key: e.target.value } })}>{Object.entries(PRODUCT_FIELDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
                {r.source === 'pim' && inp(r, 'col', 'nr kolumny', 80)}
                {r.source === 'atrybut' && <select value={c.key || ''} onChange={e => set(f.code, { config: { key: e.target.value } })}><option value="">—</option>{ATTR_KEYS.map(k => <option key={k}>{k}</option>)}</select>}
                {r.source === 'wymiar' && <select value={c.part || 1} onChange={e => set(f.code, { config: { part: e.target.value } })}><option value="1">1. wymiar (długość)</option><option value="2">2. wymiar (szerokość)</option><option value="3">3. wymiar</option><option value="h">wysokość</option></select>}
                {r.source === 'tresc' && <select value={c.field || 'TITLE'} onChange={e => set(f.code, { config: { field: e.target.value } })}><option value="TITLE">tytuł</option><option value="HTML">opis HTML</option><option value="HERO_LEAD">lead</option></select>}
                {r.source === 'zdjecie' && inp(r, 'index', 'nr zdjęcia', 70)}
                {r.source === 'rodzina' && <select value={c.key || 'id'} onChange={e => set(f.code, { config: { key: e.target.value } })}><option value="id">numer rodziny</option><option value="name">nazwa modelu</option></select>}
                {r.source === 'stala' && (f.values ? <select value={c.value ?? ''} onChange={e => set(f.code, { config: { value: e.target.value } })}><option value="">—</option>{f.values.map(v => <option key={v}>{v}</option>)}</select> : inp(r, 'value', 'wartość', 200))}
                {['pole', 'pim', 'atrybut', 'wymiar'].includes(r.source) && <>{inp(r, 'factor', '× przelicznik', 90)}{inp(r, 'suffix', 'dopisek, np. " cm"', 110)}</>}
                {['pole', 'pim', 'atrybut'].includes(r.source) && <><input className="inline-input map-input" placeholder="słownik: wartość=wartość eMAG; …" value={c.map ?? ''} onChange={e => set(f.code, { config: { map: e.target.value } })} />
                  <label className="check small"><input type="checkbox" checked={!!c.contains} onChange={e => set(f.code, { config: { contains: e.target.checked } })} /> zawiera</label>{inp(r, 'fallback', 'gdy brak', 100)}</>}
                {PENDING.includes(r.source) && <span className="muted small">uzupełniane w kolejnym kroku</span>}
              </td>
              <td className={`small st-cell st-${ex?.status || 'ok'}`}>{ex && !ex.skip ? short(ex.value, 34) || '—' : ''}{ex?.note && <div className="muted small">{ex.note}</div>}</td>
            </tr>) })}</tbody>
      </table></div>
      <div className="row-actions sticky-save"><button className="btn" disabled={!dirty.size} onClick={save}>Zapisz reguły ({dirty.size})</button></div>
    </>
  )
}

export default function Offer({ profile }) {
  const admin = profile?.role === 'admin'
  const [d, setD] = useState(null), [err, setErr] = useState(''), [msg, setMsg] = useState(null)
  const [tplId, setTplId] = useState(''), [tab, setTab] = useState('weryfikacja')
  const [q, setQ] = useState(''), [sel, setSel] = useState(new Set()), [onlyIssues, setOnlyIssues] = useState(true)
  const [cell, setCell] = useState(null), [busy, setBusy] = useState('')

  async function load(selectId) {
    try {
      const [t, ch, br] = await Promise.all([supabase.from('channel_templates').select('*').order('created_at'), supabase.from('channels').select('id, marketplace, language'), supabase.from('brands').select('id, name').order('name')])
      if (t.error) throw t.error
      const templates = t.data, id = selectId || tplId || templates[0]?.id || ''
      setTplId(id)
      const base = { templates, channels: (ch.data || []).map(c => ({ ...c, label: `${c.marketplace} ${c.language.toUpperCase()}` })), brands: br.data || [] }
      const tpl = templates.find(x => x.id === id)
      if (!tpl) { setD({ ...base, tpl: null }); return }
      const [rules, vals, fams, prods, pim, descs, titles] = await Promise.all([
        supabase.from('offer_rules').select('code, source, config').eq('template_id', id),
        fetchAll('offer_values', 'product_id, code, value, origin, status, note', x => x.eq('template_id', id)),
        supabase.from('product_families').select('id, model_name, category, brand_id, series'),
        fetchAll('products', 'id, sku, ean, name, family_id, attributes, images, image_url, baselinker_product_id'),
        fetchAll('assortment', 'sku, raw, color, shape, category, model, category_path'),
        tpl.channel_id ? fetchAll('descriptions', 'product_id, family_id, fields, html, version, status', x => x.eq('channel_id', tpl.channel_id).order('version', { ascending: false })) : Promise.resolve([]),
        tpl.channel_id ? fetchAll('product_titles', 'product_id, title, status', x => x.eq('channel_id', tpl.channel_id)).catch(() => []) : Promise.resolve([]),
      ])
      const famById = Object.fromEntries((fams.data || []).map(f => [f.id, f]))
      const products = prods.filter(p => !tpl.brand_id || famById[p.family_id]?.brand_id === tpl.brand_id).sort((a, b) => a.sku.localeCompare(b.sku))
      const pimBySku = Object.fromEntries(pim.map(r => [r.sku, r])), descBy = {}
      for (const x of descs) if (x.product_id && !descBy[x.product_id]) descBy[x.product_id] = x
      const values = {}; for (const v of vals) (values[v.product_id] = values[v.product_id] || {})[v.code] = v
      setD({ ...base, tpl, rules: rules.data || [], products, famById, pimBySku, descBy, values, titleBy: Object.fromEntries(titles.map(t => [t.product_id, t])) })
    } catch (e) { setErr(/channel_templates/.test(e.message) ? 'Brak tabel modułu – uruchom migrację 43_oferta_kanaly.sql.' : plError(e.message)) }
  }
  useEffect(() => { load() }, [])
  const ctxOf = p => ({ product: p, pim: d.pimBySku[p.sku] || {}, family: d.famById[p.family_id], desc: d.descBy[p.id], title: d.titleBy?.[p.id] })
  const R = useMemo(() => d?.rules ? Object.fromEntries(d.rules.map(r => [r.code, r])) : {}, [d])

  if (err) return <section className="page"><h1>Oferta i kanały</h1><p className="error">{err}</p></section>
  if (!d) return <section className="page"><DrainLoader /></section>
  const tpl = d.tpl
  const fields = tpl ? tpl.fields.filter(f => R[f.code] && !['rejected', 'warning', 'info'].includes(f.code)) : []
  const ql = q.trim().toLowerCase()
  const shown = tpl ? d.products.filter(p => !ql || p.sku.toLowerCase().includes(ql) || (p.name || '').toLowerCase().includes(ql) || (d.famById[p.family_id]?.model_name || '').toLowerCase().includes(ql) || (d.famById[p.family_id]?.category || '').toLowerCase().includes(ql)) : []
  const selShown = shown.filter(p => sel.has(p.id)), allShown = shown.length > 0 && selShown.length === shown.length
  const val = (p, f) => d.values[p.id]?.[f.code]
  const issueCols = fields.filter(f => selShown.some(p => { const v = val(p, f); return v && ['brak', 'do_sprawdzenia'].includes(v.status) && (f.mandatory || v.value || v.status === 'do_sprawdzenia') }))
  const cols = onlyIssues && selShown.some(p => d.values[p.id]) ? issueCols : fields
  const counts = { ok: 0, do_sprawdzenia: 0, brak: 0, zatwierdzone: 0 }
  for (const p of selShown) for (const f of fields) { const v = val(p, f); if (v && (f.mandatory || v.value || v.status !== 'ok')) counts[v.status]++ }
  const missingMandatory = selShown.reduce((n, p) => n + fields.filter(f => f.mandatory && (!val(p, f)?.value)).length, 0)

  async function autofill() {
    setBusy('Uzupełnianie…'); setMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession(), rows = []
      for (const p of selShown) for (const f of fields) {
        const cur = val(p, f); if (cur && (cur.status === 'zatwierdzone' || cur.origin === 'recznie')) continue   // decyzji człowieka nie nadpisujemy
        const r = computeField(R[f.code], f, ctxOf(p)); if (r.skip && !cur) continue
        rows.push({ template_id: tpl.id, product_id: p.id, code: f.code, value: r.value || null, origin: 'regula', status: r.status, note: r.note, updated_by: session.user.id, updated_at: new Date().toISOString() })
      }
      for (let i = 0; i < rows.length; i += 500) { const { error } = await supabase.from('offer_values').upsert(rows.slice(i, i + 500)); if (error) throw error }
      setMsg({ type: 'ok', text: `Uzupełniono ${plN(selShown.length, 'produkt', 'produkty', 'produktów')} (${rows.length} wartości). Wartości zatwierdzone i zmienione ręcznie zostały bez zmian.` }); await load(tpl.id)
    } catch (e) { setMsg({ type: 'error', text: plError(e.message) }) } finally { setBusy('') }
  }
  async function approveOk() {
    const keys = []; for (const p of selShown) for (const f of fields) { const v = val(p, f); if (v?.status === 'ok' && v.value) keys.push([p.id, f.code]) }
    if (!keys.length) return
    setBusy('Zatwierdzanie…')
    const { data: { session } } = await supabase.auth.getSession()
    const rows = keys.map(([pid, code]) => ({ ...d.values[pid][code], template_id: tpl.id, product_id: pid, code, status: 'zatwierdzone', updated_by: session.user.id, updated_at: new Date().toISOString() }))
    for (let i = 0; i < rows.length; i += 500) { const { error } = await supabase.from('offer_values').upsert(rows.slice(i, i + 500)); if (error) { setMsg({ type: 'error', text: plError(error.message) }); break } }
    setBusy(''); setMsg({ type: 'ok', text: `Zatwierdzono ${rows.length} wartości OK.` }); load(tpl.id)
  }
  async function saveCell(value, approve = true) {
    const f = cell.field, p = cell.product
    const restricted = f.restrictive && f.values?.length && value && !f.values.includes(value)
    const { data: { session } } = await supabase.auth.getSession()
    const { error } = await supabase.from('offer_values').upsert({ template_id: tpl.id, product_id: p.id, code: f.code, value: value || null, origin: 'recznie', status: restricted ? 'do_sprawdzenia' : !value ? (f.mandatory ? 'brak' : 'zatwierdzone') : approve ? 'zatwierdzone' : 'ok', note: restricted ? 'wartość spoza listy eMAG – eMAG może ją odrzucić' : null, updated_by: session.user.id, updated_at: new Date().toISOString() })
    if (error) setMsg({ type: 'error', text: plError(error.message) }); else { setCell(null); load(tpl.id) }
  }
  async function exportFile() {
    if (missingMandatory && !confirm(`Brakuje ${missingMandatory} wartości w polach obowiązkowych – eMAG odrzuci te produkty. Eksportować mimo to?`)) return
    setBusy('Przygotowanie pliku…')
    try {
      const dl = await supabase.storage.from(BUCKET).download(tpl.file_path); if (dl.error) throw dl.error
      const rows = selShown.map(p => Object.fromEntries(fields.map(f => [f.col, val(p, f)?.value ?? ''])))
      const numeric = tpl.fields.filter(f => ['vendor_ext_id', 'sale_price', 'original_sale_price', 'vat_rate', 'status', 'stock', 'handling_time', 'lead_time', 'warranty', 'offer_properties', 'min_sale_price', 'max_sale_price', 'family_id'].includes(f.code)).map(f => f.col)
      const blob = await fillTemplate(await dl.data.arrayBuffer(), rows, { startRow: tpl.start_row, numeric })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${tpl.name.replace(/[^\w.-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`; a.click()
      setMsg({ type: 'ok', text: `Plik gotowy: ${plN(rows.length, 'produkt', 'produkty', 'produktów')}. Wgraj go w panelu eMAG (Produkty → Dodaj z pliku).` })
    } catch (e) { setMsg({ type: 'error', text: plError(e.message) }) } finally { setBusy('') }
  }

  return (
    <section className="page wide">
      <h1>Oferta i kanały</h1>
      <p className="muted lead">Szablon kanału (np. eMAG) → reguły pól → automatyczne uzupełnienie z danych Studio → Twoja weryfikacja → plik gotowy do wgrania w panelu kanału.</p>
      <div className="panel">
        <div className="prices-head">
          {d.templates.length > 0 && <label className="inline-label">Szablon<select value={tplId} onChange={e => { setSel(new Set()); setCell(null); load(e.target.value) }}>{d.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
        </div>
        <div className="tabs" role="tablist">{[['weryfikacja', 'Weryfikacja i eksport'], ['reguly', 'Reguły pól'], ['szablony', 'Szablony']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k)} disabled={k !== 'szablony' && !tpl}>{l}</button>)}</div>
        {msg && <p className={msg.type} role="status">{msg.text}</p>}
        {!tpl && tab !== 'szablony' && <p className="muted">Najpierw wczytaj szablon kanału w zakładce „Szablony”.</p>}
        {tab === 'szablony' && <Templates templates={d.templates} channels={d.channels} brands={d.brands} admin={admin} onChanged={id => load(id)} setMsg={setMsg} />}
        {tab === 'reguly' && tpl && <Rules tpl={tpl} rules={d.rules} sampleCtx={(selShown[0] || shown[0]) ? ctxOf(selShown[0] || shown[0]) : null} onSaved={() => load(tpl.id)} setMsg={setMsg} />}
        {tab === 'weryfikacja' && tpl && <>
          {!tpl.channel_id && <p className="hint small">Szablon nie ma przypisanego kanału treści – nazwa i opis nie zostaną pobrane z Generatora Treści.</p>}
          <div className="filters">
            <input placeholder="Szukaj: SKU, nazwa, model, kategoria (np. wanna)…" value={q} onChange={e => setQ(e.target.value)} />
            <label className="check"><input type="checkbox" checked={allShown} ref={el => { if (el) el.indeterminate = !allShown && selShown.length > 0 }} onChange={() => setSel(s => { const n = new Set(s); allShown ? shown.forEach(p => n.delete(p.id)) : shown.forEach(p => n.add(p.id)); return n })} /> zaznacz wszystkie widoczne ({shown.length})</label>
          </div>
          <div className="row-actions">
            <button className="btn" disabled={!selShown.length || !!busy} onClick={autofill}>Uzupełnij automatycznie ({selShown.length})</button>
            <button className="btn ghost" disabled={!selShown.length || !!busy || !counts.ok} onClick={approveOk}>Zatwierdź zielone ({counts.ok})</button>
            <button className="btn ghost" disabled={!selShown.length || !!busy} onClick={exportFile}>Eksportuj plik eMAG</button>
            <label className="check small"><input type="checkbox" checked={onlyIssues} onChange={e => setOnlyIssues(e.target.checked)} /> pokaż tylko pola wymagające uwagi</label>
            {busy && <span className="muted working small">{busy}</span>}
          </div>
          {selShown.length > 0 && <p className="small offer-legend"><span className="lg st-ok">OK {counts.ok}</span><span className="lg st-zatwierdzone">zatwierdzone {counts.zatwierdzone}</span><span className="lg st-do_sprawdzenia">do sprawdzenia {counts.do_sprawdzenia}</span><span className="lg st-brak">brak {counts.brak}</span>{missingMandatory > 0 && <strong className="crit-text"> · braki w polach obowiązkowych: {missingMandatory}</strong>}</p>}
          <div className="table-wrap offer-grid-wrap"><table className="compact offer-grid">
            <thead><tr><th className="sticky-col">Produkt</th>{selShown.length > 0 && cols.map(f => <th key={f.code} title={`${f.code} · ${f.req}`}>{fname(f.label)}{f.mandatory && <span className="crit-text">*</span>}</th>)}</tr></thead>
            <tbody>{shown.map(p => <tr key={p.id} className={sel.has(p.id) ? 'row-selected' : ''}>
              <td className="sticky-col"><label className="check small"><input type="checkbox" checked={sel.has(p.id)} onChange={() => setSel(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })} /> <span className="mono">{p.sku}</span></label><div className="muted small">{short(d.famById[p.family_id]?.model_name || p.name, 30)}</div></td>
              {sel.has(p.id) && cols.map(f => { const v = val(p, f); return <td key={f.code} className={`st-cell st-${v?.status || 'none'}`} title={v?.note || ''} onClick={() => setCell({ product: p, field: f, value: v?.value || '' })}>{v ? short(v.value, 22) || '—' : '·'}</td> })}
              {!sel.has(p.id) && selShown.length > 0 && <td colSpan={cols.length} className="muted small">zaznacz, żeby uzupełnić i zweryfikować</td>}
            </tr>)}</tbody>
          </table></div>
          {cell && <div className="panel cell-editor">
            <div className="prices-head"><h3>{cell.product.sku} · {fname(cell.field.label)}</h3><button className="link-dark" onClick={() => setCell(null)}>zamknij</button></div>
            <p className="muted small">{cell.field.mandatory ? 'Pole obowiązkowe' : cell.field.conditional ? 'Pole warunkowe' : 'Pole opcjonalne'}{cell.field.values ? ` · lista eMAG: ${cell.field.values.length} wartości${cell.field.restrictive ? ' (tylko z listy)' : ' (podpowiedzi)'}` : ''}{val(cell.product, cell.field)?.note ? ` · ${val(cell.product, cell.field).note}` : ''}</p>
            {cell.field.code === 'description' ? <textarea rows={6} value={cell.value} onChange={e => setCell({ ...cell, value: e.target.value })} /> : <>
              <input className="cell-input" list={cell.field.values ? 'offer-list' : undefined} value={cell.value} onChange={e => setCell({ ...cell, value: e.target.value })} autoFocus />
              {cell.field.values && <datalist id="offer-list">{cell.field.values.map(v => <option key={v} value={v} />)}</datalist>}
            </>}
            {cell.field.restrictive && cell.value && !cell.field.values?.includes(cell.value) && <p className="hint small">Tej wartości nie ma na liście eMAG – wybierz z podpowiedzi, inaczej eMAG może odrzucić produkt.</p>}
            <div className="row-actions"><button className="btn small-btn" onClick={() => saveCell(cell.value, true)}>Zapisz i zatwierdź</button><button className="link-dark small" onClick={() => saveCell(cell.value, false)}>zapisz bez zatwierdzania</button></div>
          </div>}
        </>}
      </div>
    </section>
  )
}
