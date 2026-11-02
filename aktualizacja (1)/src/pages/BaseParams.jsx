import { useEffect, useMemo, useState } from 'react'
import { supabase, plError } from '../supabase.js'
import { runJob, PUBLISH_URL } from '../jobs.js'
import { PARAM_LANGS as LANGS } from '../languages.js'
import { computeParams, categoryKey } from '../params.js'
import { skuAttributes } from '../parser.js'
import DrainLoader from '../components/DrainLoader.jsx'

const SOURCES = { pim: 'kolumna PIM', atrybut: 'atrybut produktu', nazwa: 'z nazwy (wyrażenie)', stala: 'stała wartość', frazy: 'bank fraz', pomin: 'nie wysyłaj' }
const TRANSFORMS = { tekst: 'bez zmian', etykieta: 'etykieta PIM → tekst', liczba: 'liczba (kropka)', liczba_pl: 'liczba (przecinek)' }
const ATTRS = ['wykonczenie', 'ksztalt', 'odplyw', 'powloka', 'w_zestawie', 'wymiar', 'wysokosc_cm', 'material']
const CHUNK = 150
const fetchAll = async (table, cols) => { let out = [], from = 0; for (;;) { const { data, error } = await supabase.from(table).select(cols).range(from, from + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) return out; from += 1000 } }
const plN = (n, a, b, c) => `${n} ${n === 1 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? b : c}`

function Mapping({ mapping, admin, sampleRaw, onSaved }) {
  const [rows, setRows] = useState(mapping)
  const [dirty, setDirty] = useState(new Set())
  const [msg, setMsg] = useState(null)
  useEffect(() => { setRows(mapping); setDirty(new Set()) }, [mapping])
  const set = (id, patch) => { setRows(r => r.map(x => x.id === id ? { ...x, ...patch } : x)); setDirty(d => new Set(d).add(id)) }
  async function save() {
    const changed = rows.filter(r => dirty.has(r.id)).map(({ id, name, sort, source, pim_col, attr_key, regex, const_value, fallback_col, transform, value_map, suffix, note, default_value, kw_lang, kw_count, only_categories }) =>
      ({ id, name: name.trim(), sort, source, pim_col: pim_col ? Number(pim_col) : null, attr_key: attr_key || null, regex: regex || null, const_value: const_value || null,
         fallback_col: fallback_col ? Number(fallback_col) : null, transform, value_map: value_map || null, suffix: suffix || null, note: note || null, default_value: default_value || null, kw_lang: kw_lang || null, kw_count: kw_count ? Number(kw_count) : null, only_categories: only_categories || null, updated_at: new Date().toISOString() }))
    const { error } = await supabase.from('bl_param_map').upsert(changed)
    setMsg(error ? { type: 'error', text: plError(error.message) } : { type: 'ok', text: `Zapisano ${plN(changed.length, 'parametr', 'parametry', 'parametrów')}.` })
    if (!error) onSaved()
  }
  async function add() {
    const name = (prompt('Nazwa parametru dokładnie jak w Base:') || '').trim(); if (!name) return
    const { error } = await supabase.from('bl_param_map').insert({ name, sort: rows.length + 1, source: 'pomin' })
    setMsg(error ? { type: 'error', text: plError(error.message) } : null); if (!error) onSaved()
  }
  async function remove(r) {
    if (!confirm(`Usunąć parametr „${r.name}” z mapowania? W Base nic się nie zmieni.`)) return
    const { error } = await supabase.from('bl_param_map').delete().eq('id', r.id)
    setMsg(error ? { type: 'error', text: plError(error.message) } : null); if (!error) onSaved()
  }
  const sample = n => sampleRaw && n ? String(sampleRaw[Number(n) - 1] ?? '').slice(0, 40) : ''
  return (
    <details className="panel">
      <summary><strong>Mapowanie parametrów</strong> <span className="muted small">skąd brać wartość każdego parametru · {mapping.filter(m => m.source !== 'pomin').length} z {mapping.length} wysyłanych</span></summary>
      <div className="table-wrap"><table className="compact map-table">
        <thead><tr><th>Parametr w Base</th><th>Źródło</th><th>Szczegół</th><th>Zapas: kol. PIM</th><th>Przekształcenie</th><th>Zamiany (stara=nowa; …)</th><th>Dopisek</th>{admin && <th />}</tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.id} className={r.source === 'pomin' ? 'inactive-row' : ''}>
            <td><strong>{r.name}</strong>{r.note && <div className="muted small">{r.note}</div>}</td>
            <td><select value={r.source} disabled={!admin} onChange={e => set(r.id, { source: e.target.value })}>{Object.entries(SOURCES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
            <td>
              {r.source === 'pim' && <><input type="number" min="1" className="num" value={r.pim_col || ''} disabled={!admin} onChange={e => set(r.id, { pim_col: e.target.value })} />{sample(r.pim_col) && <span className="muted small"> np. „{sample(r.pim_col)}”</span>}</>}
              {r.source === 'atrybut' && <input list="attr-list" value={r.attr_key || ''} disabled={!admin} onChange={e => set(r.id, { attr_key: e.target.value })} />}
              {r.source === 'nazwa' && <input className="mono" value={r.regex || ''} disabled={!admin} onChange={e => set(r.id, { regex: e.target.value })} />}
              {r.source === 'stala' && <input value={r.const_value || ''} disabled={!admin} onChange={e => set(r.id, { const_value: e.target.value })} />}
              {r.source === 'frazy' && <span className="kw-cfg">język <input className="num" value={r.kw_lang || 'pl'} disabled={!admin} onChange={e => set(r.id, { kw_lang: e.target.value.trim().toLowerCase() })} /> liczba <input type="number" min="1" max="50" className="num" value={r.kw_count || 10} disabled={!admin} onChange={e => set(r.id, { kw_count: e.target.value })} /></span>}
              {r.source !== 'pomin' && <div className="small muted">tylko kategorie: <input className="inline-input" value={r.only_categories || ''} placeholder="wszystkie" disabled={!admin} onChange={e => set(r.id, { only_categories: e.target.value })} /></div>}
              {r.source !== 'pomin' && r.source !== 'stala' && <div className="small muted">gdy puste: <input className="inline-input" value={r.default_value || ''} placeholder="nic nie wysyłaj" disabled={!admin} onChange={e => set(r.id, { default_value: e.target.value })} /></div>}
            </td>
            <td><input type="number" min="1" className="num" value={r.fallback_col || ''} disabled={!admin || r.source === 'pomin'} onChange={e => set(r.id, { fallback_col: e.target.value })} /></td>
            <td><select value={r.transform} disabled={!admin || r.source === 'pomin'} onChange={e => set(r.id, { transform: e.target.value })}>{Object.entries(TRANSFORMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
            <td><input value={r.value_map || ''} disabled={!admin || r.source === 'pomin'} onChange={e => set(r.id, { value_map: e.target.value })} /></td>
            <td><input className="num" value={r.suffix || ''} disabled={!admin || r.source === 'pomin'} onChange={e => set(r.id, { suffix: e.target.value })} /></td>
            {admin && <td className="actions"><button className="link-dark danger-link" onClick={() => remove(r)}>Usuń</button></td>}
          </tr>
        ))}</tbody>
      </table></div>
      <datalist id="attr-list">{ATTRS.map(a => <option key={a} value={a} />)}</datalist>
      <p className="muted small">Kolumny PIM liczone od 1, jak w Excelu (1 = SKU). „Etykieta PIM → tekst” zamienia np. <code>ksztalt__polokragly</code> na „półokrągły”. Puste wartości nie są wysyłane – w Base zostaje to, co tam jest.</p>
      {admin && <div className="row-actions"><button className="btn" disabled={!dirty.size} onClick={save}>Zapisz mapowanie</button><button className="link-dark" onClick={add}>+ dodaj parametr</button></div>}
      {msg && <p className={msg.type} role="status">{msg.text}</p>}
    </details>
  )
}

function Translations({ lang, mapping, names, values, canEdit, onSaved }) {
  const [edit, setEdit] = useState({})
  const [msg, setMsg] = useState(null)
  const [onlyProp, setOnlyProp] = useState(true)
  const nm = mapping.filter(m => m.source !== 'pomin').map(m => ({ key: 'n:' + m.id, kind: 'name', pl: m.name, map_id: m.id, rec: names[`${m.id}|${lang}`] }))
  const vals = Object.values(values).filter(v => v.lang === lang).map(v => ({ key: 'v:' + v.source, kind: 'value', pl: v.source, rec: v }))
  const rows = [...nm.filter(x => x.rec), ...vals].filter(x => !onlyProp || x.rec?.status === 'propozycja').sort((a, b) => (a.kind === b.kind ? a.pl.localeCompare(b.pl, 'pl') : a.kind === 'name' ? -1 : 1))
  const proposals = [...nm, ...vals].filter(x => x.rec?.status === 'propozycja')
  async function save(list, status) {
    const { data: { session } } = await supabase.auth.getSession()
    const nRows = list.filter(x => x.kind === 'name').map(x => ({ map_id: x.map_id, lang, name: (edit[x.key] ?? x.rec.name).trim(), status, updated_by: session.user.id, updated_at: new Date().toISOString() }))
    const vRows = list.filter(x => x.kind === 'value').map(x => ({ lang, source: x.pl, target: (edit[x.key] ?? x.rec.target).trim(), status, updated_by: session.user.id, updated_at: new Date().toISOString() }))
    const r1 = nRows.length ? await supabase.from('bl_param_names').upsert(nRows, { onConflict: 'map_id,lang' }) : {}
    const r2 = vRows.length ? await supabase.from('bl_value_translations').upsert(vRows, { onConflict: 'lang,source' }) : {}
    const e = r1.error || r2.error
    setMsg(e ? { type: 'error', text: plError(e.message) } : { type: 'ok', text: `Zapisano: ${list.length}${status === 'zatwierdzone' ? ' (zatwierdzone)' : ''}.` })
    if (!e) { setEdit({}); onSaved() }
  }
  return (
    <details className="panel" open={proposals.length > 0}>
      <summary><strong>Tłumaczenia – {LANGS[lang]?.name || lang.toUpperCase()}</strong> <span className="muted small">{proposals.length ? `${proposals.length} do zatwierdzenia` : 'wszystkie zatwierdzone'} · do Base trafiają tylko zatwierdzone</span></summary>
      <p className="muted small">Nazwy parametrów muszą być <strong>identyczne jak w Base</strong> (co do znaku) – inna pisownia utworzy w Base nowy parametr. Zmieniaj je tylko po zmianie w Base.</p>
      <div className="row-actions">
        <label className="check small"><input type="checkbox" checked={onlyProp} onChange={e => setOnlyProp(e.target.checked)} /> tylko do zatwierdzenia</label>
        {canEdit && proposals.length > 0 && <button className="btn" onClick={() => save(proposals, 'zatwierdzone')}>Zatwierdź wszystkie ({proposals.length})</button>}
      </div>
      {rows.length === 0 ? <p className="muted">Brak pozycji.</p> : (
        <div className="table-wrap tr-wrap"><table className="compact tr-table">
          <thead><tr><th>Rodzaj</th><th>Po polsku</th><th>{LANGS[lang]?.name || lang}</th><th>Status</th>{canEdit && <th />}</tr></thead>
          <tbody>{rows.map(x => {
            const cur = x.kind === 'name' ? x.rec.name : x.rec.target
            return (
              <tr key={x.key}>
                <td className="muted small">{x.kind === 'name' ? 'nazwa parametru' : 'wartość'}</td>
                <td>{x.pl}</td>
                <td>{canEdit ? <input value={edit[x.key] ?? cur} onChange={e => setEdit(v => ({ ...v, [x.key]: e.target.value }))} /> : cur}</td>
                <td><span className={x.rec.status === 'zatwierdzone' ? 'tag okt' : 'tag warn'}>{x.rec.status}</span></td>
                {canEdit && <td className="actions nowrap">
                  {(edit[x.key] !== undefined && edit[x.key] !== cur) && <button className="link-dark" onClick={() => save([x], x.rec.status)}>Zapisz</button>}
                  {x.rec.status !== 'zatwierdzone' && <button className="link-dark" onClick={() => save([x], 'zatwierdzone')}>Zatwierdź</button>}
                </td>}
              </tr>
            )
          })}</tbody>
        </table></div>
      )}
      {msg && <p className={msg.type} role="status">{msg.text}</p>}
    </details>
  )
}

function Result({ res }) {
  if (!res) return null
  if (res.error) return <p className="error">{res.error}</p>
  if (res.info) return <p className="ok">{res.info}</p>
  const r = res.result, changed = (r.items || []).filter(x => x.found && x.changes.length)
  return (
    <div className="panel">
      <h2>{r.mode === 'compare' ? 'Porównanie z Base' : r.dry_run ? 'Tryb próbny – nic nie zapisano' : 'Zapis w Base'}{r.lang && r.lang !== 'pl' ? ` · ${r.lang.toUpperCase()}` : ''}</h2>
      <p>
        {plN(changed.length, 'produkt wymaga', 'produkty wymagają', 'produktów wymaga')} zmian · {plN((r.items || []).filter(x => x.found && !x.changes.length).length, 'produkt jest', 'produkty są', 'produktów jest')} aktualnych
        {r.not_found ? ` · ${r.not_found} nie znaleziono w Base` : ''}
        {r.skipped ? ` · ${r.skipped} pominięto (brak parametrów do wysłania${r.lang && r.lang !== 'pl' ? ' – brak zatwierdzonych tłumaczeń' : ''})` : ''}
        {r.updated !== undefined && <> · <strong>zapisano: {r.updated}</strong></>}
        {r.dry_run && r.mode === 'write' && <> · w trybie próbnym zapisanoby {r.would_update}. Ustaw DRY_RUN = false w n8n (workflow publikacji), żeby zapisywać.</>}
      </p>
      {(r.failed || []).length > 0 && <p className="error">Błędy: {r.failed.map(f => `${f.sku}: ${f.error}`).join('; ')}</p>}
      {(r.warnings || []).length > 0 && <p className="hint">Ostrzeżenia Base: {r.warnings.map(w => `${w.sku}: ${w.warnings.join(', ')}`).join('; ')}</p>}
      <div className="table-wrap"><table className="compact">
        <thead><tr><th>SKU</th><th>Zmiany (obecnie w Base → nowa wartość)</th><th>Inne parametry w Base</th></tr></thead>
        <tbody>
          {changed.map(x => <tr key={x.sku}><td className="mono">{x.sku}</td><td>{x.changes.map(c => <div key={c.name} className="small"><strong>{c.name}:</strong> <span className="muted">{c.old || '(brak)'}</span> → {c.new}</div>)}</td><td className="muted small">{x.other_params} (zostaną bez zmian)</td></tr>)}
          {(r.items || []).filter(x => !x.found).map(x => <tr key={x.sku} className="inactive-row"><td className="mono">{x.sku}</td><td colSpan={2} className="error small">{x.error}</td></tr>)}
        </tbody>
      </table></div>
    </div>
  )
}

export default function BaseParams({ profile }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [f, setF] = useState({ brand: '', cat: '', model: '', q: '' })
  const [sel, setSel] = useState(new Set())
  const [busy, setBusy] = useState('')
  const [res, setRes] = useState(null)
  const [lang, setLang] = useState('pl')
  const admin = profile?.role === 'admin'
  const canTranslate = ['akceptujacy', 'admin'].includes(profile?.role)
  async function load() {
    try {
      const [{ data: mapping, error }, as, pr, kb, br, ir, tn, tv] = await Promise.all([
        supabase.from('bl_param_map').select('*').order('sort'),
        fetchAll('assortment', 'sku, name, brand, category_path, category, model, raw'),
        fetchAll('products', 'sku, attributes'),
        supabase.from('keyword_banks').select('category, language, keywords, excluded'),
        supabase.from('brands').select('id, name'),
        supabase.from('import_rules').select('*'),
        supabase.from('bl_param_names').select('*'),
        fetchAll('bl_value_translations', '*'),
      ])
      if (error) throw error
      const banks = Object.fromEntries((kb.data || []).map(b => [`${b.category}|${b.language}`, b]))
      setD({ mapping: mapping || [], rows: as, products: Object.fromEntries(pr.map(p => [p.sku, p])), banks, brands: br.data || [], rules: ir.data || [],
        names: Object.fromEntries((tn.data || []).map(x => [`${x.map_id}|${x.lang}`, x])), values: Object.fromEntries(tv.map(x => [`${x.lang}|${x.source}`, x])) })
    } catch (e) { setErr(/bl_param_names|bl_value_translations/.test(e.message) ? 'Baza nie ma jeszcze tabel tłumaczeń – uruchom migrację 20_tlumaczenia_parametrow.sql.' : /raw|bl_param_map/.test(e.message) ? 'Baza nie ma jeszcze tabel parametrów – uruchom migrację 18_parametry_base.sql.' : plError(e.message)) }
  }
  useEffect(() => { load() }, [])
  const catOf = r => (r.category_path?.length ? r.category_path.join(' › ') : r.category) || '—'
  const computed = useMemo(() => {
    if (!d) return []
    return d.rows.map(r => {
      // atrybuty: z aplikacji, a brakujące (wykończenie, powłoka) wyliczone z SKU wg Słownika importu
      const brandId = d.brands.find(b => b.name.toLowerCase() === String(r.brand || '').toLowerCase())?.id || null
      const fromSku = skuAttributes(r.sku, brandId, d.rules, categoryKey(r))
      const attrs = { ...fromSku, ...((d.products[r.sku] || {}).attributes || {}) }
      // słowa kluczowe zawsze z banku fraz w języku docelowym (nie tłumaczymy fraz)
      const mappingL = lang === 'pl' ? d.mapping : d.mapping.map(m => m.source === 'frazy' ? { ...m, kw_lang: lang } : m)
      const base = computeParams(mappingL, r, { attributes: attrs }, { banks: d.banks })
      if (lang === 'pl') return { ...r, cat: catOf(r), ...base, send: base.values, inApp: !!d.products[r.sku] }
      // tłumaczenie: nazwy i wartości tylko zatwierdzone; liczby, kody i wartości oznaczone „bez tłumaczenia” bez zmian
      const send = {}, shown = {}, miss = {}
      for (const m of mappingL) {
        const v = base.values[m.name]; if (!v) continue
        const nm = d.names[`${m.id}|${lang}`]
        const plain = !m.translate || ['liczba', 'liczba_pl'].includes(m.transform) || m.source === 'frazy'
        const tv = d.values[`${lang}|${v}`]
        const val = plain ? v : (tv?.status === 'zatwierdzone' ? tv.target : null)
        if (nm?.status === 'zatwierdzone' && val) { send[nm.name] = val; shown[m.name] = val }
        else miss[m.name] = !nm || nm.status !== 'zatwierdzone' ? 'brak zatwierdzonej nazwy parametru' : (tv ? 'tłumaczenie czeka na zatwierdzenie' : 'brak tłumaczenia wartości')
      }
      return { ...r, cat: catOf(r), values: shown, origin: base.origin, plValues: base.values, miss, send, inApp: !!d.products[r.sku] }
    })
  }, [d, lang])
  if (err) return <section className="page"><h1>Parametry w Base</h1><p className="error">{err}</p></section>
  if (!d) return <section className="page"><DrainLoader /></section>

  const active = d.mapping.filter(m => m.source !== 'pomin')
  const noRaw = d.rows.length > 0 && !d.rows.some(r => Array.isArray(r.raw))
  const opts = key => [...new Set(computed.filter(r => (!f.brand || r.brand === f.brand) && (key === 'cat' || !f.cat || r.cat === f.cat)).map(r => r[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'pl'))
  const ql = f.q.trim().toLowerCase()
  const list = computed.filter(r => (!f.brand || r.brand === f.brand) && (!f.cat || r.cat === f.cat) && (!f.model || r.model === f.model) && (!ql || `${r.sku} ${r.name}`.toLowerCase().includes(ql)))
  const allSel = list.length > 0 && list.every(r => sel.has(r.sku))
  const toggleAll = () => setSel(s => { const n = new Set(s); list.forEach(r => allSel ? n.delete(r.sku) : n.add(r.sku)); return n })
  const chosen = computed.filter(r => sel.has(r.sku))
  const emptyCount = chosen.reduce((a, r) => a + active.filter(m => !r.values[m.name]).length, 0)
  // co trzeba przetłumaczyć (dla całej listy, żeby słownik uzupełnić za jednym razem)
  const need = (() => {
    if (lang === 'pl') return { names: [], values: [] }
    const names = active.filter(m => !d.names[`${m.id}|${lang}`]).map(m => m.name)
    const vals = new Set()
    for (const r of computed) for (const m of active) {
      const v = r.plValues?.[m.name]; if (!v || !m.translate || ['liczba', 'liczba_pl'].includes(m.transform) || m.source === 'frazy') continue
      if (!d.values[`${lang}|${v}`]) vals.add(v)
    }
    return { names, values: [...vals] }
  })()
  async function translate() {
    setRes(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      let done = 0
      const all = need.values
      for (let i = 0; i === 0 || i < all.length; i += 250) {
        const part = all.slice(i, i + 250)
        setBusy(`Tłumaczenie (AI): ${Math.min(i + part.length, all.length)} z ${all.length} wartości…`)
        const r = await runJob('params_translate', { lang, names: i === 0 ? need.names : [], values: part }, { timeoutSec: 240 })
        const x = r.result || r
        const nRows = Object.entries(x.names || {}).map(([pl, t]) => ({ map_id: active.find(m => m.name === pl)?.id, lang, name: t, status: 'propozycja', updated_by: session.user.id })).filter(z => z.map_id)
        const vRows = Object.entries(x.values || {}).map(([pl, t]) => ({ lang, source: pl, target: t, status: 'propozycja', updated_by: session.user.id }))
        if (nRows.length) { const e = await supabase.from('bl_param_names').upsert(nRows, { onConflict: 'map_id,lang', ignoreDuplicates: true }); if (e.error) throw e.error }
        if (vRows.length) { const e = await supabase.from('bl_value_translations').upsert(vRows, { onConflict: 'lang,source', ignoreDuplicates: true }); if (e.error) throw e.error }
        done += nRows.length + vRows.length
        if (!all.length) break
      }
      setRes({ info: `Dodano ${done} propozycji tłumaczeń. Przejrzyj je i zatwierdź w panelu „Tłumaczenia” – dopiero zatwierdzone trafiają do Base.` })
      await load()
    } catch (e) { setRes({ error: plError(e.message) }) } finally { setBusy('') }
  }

  async function run(mode) {
    if (!chosen.length) return
    if (mode === 'write' && !confirm(`Zapisać parametry ${plN(chosen.length, 'produktu', 'produktów', 'produktów')} w Base${lang !== 'pl' ? ` (język: ${lang.toUpperCase()})` : ''}?\n\nZmienione zostaną tylko parametry z mapowania; pozostałe parametry produktów zostaną bez zmian. Puste wartości nie są wysyłane.`)) return
    setRes(null)
    // produkty bez żadnego parametru do wysłania (np. brak zatwierdzonych tłumaczeń) – nie wysyłamy pustego zadania do n8n
    const ready = chosen.filter(x => Object.keys(x.send || {}).length), empty = chosen.length - ready.length
    if (!ready.length) {
      setRes({ error: lang !== 'pl'
        ? `Żaden z zaznaczonych produktów nie ma parametrów do wysłania w języku ${lang.toUpperCase()}: brakuje zatwierdzonych nazw parametrów albo tłumaczeń wartości. Kliknij „Przetłumacz brakujące (AI)”, a potem zatwierdź propozycje w panelu „Tłumaczenia”.`
        : 'Żaden z zaznaczonych produktów nie ma wyliczonych wartości parametrów. Sprawdź mapowanie parametrów i czy lista z PIM jest wgrana (Drzewo produktów).' })
      return
    }
    const all = { mode, lang, items: [], not_found: 0, to_change: 0, updated: mode === 'write' ? 0 : undefined, failed: [], warnings: [], dry_run: false, would_update: 0 }
    try {
      for (let i = 0; i < chosen.length; i += CHUNK) {
        const part = chosen.slice(i, i + CHUNK)
        setBusy(`${mode === 'write' ? 'Zapisywanie' : 'Porównywanie'}: ${i + 1}–${i + part.length} z ${chosen.length}…`)
        const items = part.map(x => ({ sku: x.sku, features: x.send })).filter(x => Object.keys(x.features).length)
        if (!items.length) continue
        const r = await runJob('params_sync', { mode, lang, items }, { url: PUBLISH_URL, timeoutSec: 60 + part.length * 3 })
        const x = r.result || r
        all.items.push(...(x.items || [])); all.not_found += x.not_found || 0; all.to_change += x.to_change || 0
        if (x.updated !== undefined) all.updated += x.updated
        all.failed.push(...(x.failed || [])); all.warnings.push(...(x.warnings || [])); all.dry_run = all.dry_run || !!x.dry_run; all.would_update += x.would_update || 0
      }
      setRes({ result: { ...all, skipped: empty } })
    } catch (e) { setRes({ error: plError(e.message) }) } finally { setBusy('') }
  }

  return (
    <section className="page wide">
      <h1>Parametry w Base</h1>
      <p className="muted lead">Wartości parametrów wyliczane z listy PIM (Drzewo produktów) i atrybutów produktów w aplikacji. Najpierw porównaj z Base, potem zapisz.</p>
      {d.mapping.some(m => m.source === 'frazy') && (() => {
        const langs = lang === 'pl' ? [...new Set(d.mapping.filter(m => m.source === 'frazy').map(m => m.kw_lang || 'pl'))] : [lang]
        const missing = [...new Set(computed.map(r => categoryKey(r)).filter(Boolean))].flatMap(c => langs.filter(l => !d.banks[`${c}|${l}`] || !(d.banks[`${c}|${l}`].keywords || []).length).map(l => `${c} (${l.toUpperCase()})`))
        return missing.length ? <p className="hint">Słowa kluczowe: brak odświeżonego banku fraz dla: {missing.join(', ')}. Dodaj je w zakładce Frazy kluczowe – do tego czasu parametr nie będzie wysyłany dla tych kategorii.</p> : null
      })()}
      {noRaw && <p className="hint">Lista asortymentu nie ma jeszcze pełnych wierszy PIM – wgraj ponownie eksport z PIM w zakładce Drzewo produktów. Do tego czasu parametry z kolumn PIM będą puste.</p>}
      <Mapping mapping={d.mapping} admin={admin} sampleRaw={(chosen[0] || list[0])?.raw} onSaved={load} />
      <div className="panel lang-bar">
        <label>Język parametrów<select value={lang} onChange={e => { setLang(e.target.value); setRes(null) }}>
          <option value="pl">polski – domyślny język katalogu</option>
          {Object.entries(LANGS).sort((a, b) => a[1].name.localeCompare(b[1].name, 'pl')).map(([k, v]) => <option key={k} value={k}>{v.name} ({k.toUpperCase()})</option>)}
        </select></label>
        {lang !== 'pl' && <>
          <span className="muted small">{need.names.length || need.values.length ? `Do przetłumaczenia: ${need.names.length} nazw parametrów, ${need.values.length} wartości.` : 'Słownik kompletny dla tej listy.'} Zapis do Base pod kluczem <code>features|{lang}</code>.</span>
          {canTranslate && (need.names.length > 0 || need.values.length > 0) && <button className="btn ghost" disabled={!!busy} onClick={translate}>Przetłumacz brakujące (AI)</button>}
        </>}
      </div>
      {lang !== 'pl' && <Translations lang={lang} mapping={d.mapping} names={d.names} values={d.values} canEdit={canTranslate} onSaved={load} />}

      <div className="panel">
        <div className="filters">
          <select value={f.brand} onChange={e => setF({ brand: e.target.value, cat: '', model: '', q: f.q })}><option value="">wszystkie marki</option>{opts('brand').map(x => <option key={x}>{x}</option>)}</select>
          <select value={f.cat} onChange={e => setF({ ...f, cat: e.target.value, model: '' })}><option value="">wszystkie kategorie</option>{opts('cat').map(x => <option key={x}>{x}</option>)}</select>
          <select value={f.model} onChange={e => setF({ ...f, model: e.target.value })}><option value="">wszystkie modele</option>{opts('model').map(x => <option key={x}>{x}</option>)}</select>
          <input placeholder="Szukaj SKU albo nazwy…" value={f.q} onChange={e => setF({ ...f, q: e.target.value })} />
        </div>
        <div className="row-actions">
          <span className="muted">{plN(list.length, 'produkt', 'produkty', 'produktów')} na liście · zaznaczono {chosen.length}{chosen.length > 0 && emptyCount > 0 ? ` · ${emptyCount} pustych wartości (nie zostaną wysłane)` : ''}</span>
          <button className="btn ghost" disabled={!chosen.length || !!busy} onClick={() => run('compare')}>Porównaj z Base</button>
          {admin && <button className="btn" disabled={!chosen.length || !!busy} onClick={() => run('write')}>Zapisz w Base</button>}
          {chosen.length > 0 && <button className="link-dark" onClick={() => setSel(new Set())}>odznacz</button>}
        </div>
        {busy && <p className="muted working" role="status">{busy}</p>}
        <div className="table-wrap params-wrap"><table className="compact params-table">
          <thead><tr><th><input type="checkbox" checked={allSel} onChange={toggleAll} aria-label="Zaznacz wszystkie na liście" /></th><th>SKU</th>{active.map(m => { const n = lang !== 'pl' ? d.names[`${m.id}|${lang}`] : null; return <th key={m.id} title={lang !== 'pl' ? m.name : ''}>{lang === 'pl' ? m.name : (n?.status === 'zatwierdzone' ? n.name : <span className="tr-miss">{m.name} ⟂</span>)}</th> })}</tr></thead>
          <tbody>{list.slice(0, 300).map(r => (
            <tr key={r.sku}>
              <td><input type="checkbox" checked={sel.has(r.sku)} onChange={() => setSel(s => { const n = new Set(s); n.has(r.sku) ? n.delete(r.sku) : n.add(r.sku); return n })} /></td>
              <td className="mono" title={r.name}>{r.sku}{!r.inApp && <span className="muted small" title="Produktu nie ma w aplikacji – atrybuty z aplikacji (np. wykończenie) są puste"> ·PIM</span>}</td>
              {active.map(m => <td key={m.id} title={r.miss?.[m.name] || r.origin[m.name] || 'brak wartości'} className={r.values[m.name] ? '' : r.miss?.[m.name] ? 'tr-cell' : 'empty-cell'}>{r.values[m.name] || (r.miss?.[m.name] ? (r.plValues?.[m.name] + ' ⟂') : '—')}</td>)}
            </tr>
          ))}</tbody>
        </table></div>
        {list.length > 300 && <p className="muted small">Pokazano 300 z {list.length}. Zaznaczanie „wszystkich” obejmuje całą przefiltrowaną listę.</p>}
      </div>
      <Result res={res} />
    </section>
  )
}
