import { useEffect, useMemo, useState } from 'react'
import { supabase, plError, fetchAll } from '../supabase.js'
import { readSheet, guessMapping, buildItems, guessGross } from '../priceFile.js'
import DrainLoader from '../components/DrainLoader.jsx'

const zl = v => v === null || v === undefined ? '—' : `${Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`
const dpl = d => d ? d.split('-').reverse().join('.') : '—'
const today = () => new Date().toISOString().slice(0, 10)
const FIELDS = [['code', 'Kod produktu (SKU / MPN)'], ['ean', 'EAN'], ['name', 'Nazwa'], ['catalogue', 'Cena katalogowa'], ['promo', 'Cena promocyjna (opcjonalnie)'], ['brand', 'Marka (opcjonalnie – do kontroli)'], ['category', 'Kategoria (opcjonalnie)']]

// Ceny obowiązujące danego dnia dla wszystkich produktów marki (cennik, który zaczął obowiązywać najpóźniej, wygrywa)
async function pricesOn(lists, day) {
  const act = lists.filter(l => l.valid_from <= day && day <= l.valid_to).sort((a, b) => b.valid_from.localeCompare(a.valid_from) || b.created_at.localeCompare(a.created_at))
  const out = new Map()
  for (const l of act) {
    const items = await fetchAll('pr_price_items', 'product_id, catalogue_price, promo_price', q => q.eq('price_list_id', l.id))
    for (const i of items) if (!out.has(i.product_id)) out.set(i.product_id, { ...i, list: l.name, min: i.promo_price ?? i.catalogue_price })
  }
  return out
}

function Importer({ brand, lists, onDone }) {
  const [file, setFile] = useState(null)
  const [map, setMap] = useState(null)
  const [f, setF] = useState({ name: '', from: '', to: '', gross: true, vat: 23, minPrice: 1 })
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  async function pick(fl) {
    setErr('')
    try {
      const s = readSheet(new Uint8Array(await fl.arrayBuffer())), m = guessMapping(s.headers), g = m.catalogue >= 0 ? guessGross(s.headers[m.catalogue]) : null
      setFile({ ...s, fileName: fl.name }); setMap(m); setF(x => ({ ...x, name: x.name || fl.name.replace(/\.[^.]+$/, ''), gross: g === null ? x.gross : g }))
    }
    catch (e) { setErr(`Nie udało się odczytać pliku: ${e.message}`) }
  }
  const built = useMemo(() => file && map ? buildItems(file.rows, map, { gross: f.gross, vat: Number(f.vat) || 0, brand: brand.name, minPrice: Number(f.minPrice) || 0 }) : null, [file, map, f.gross, f.vat, f.minPrice, brand.name])
  const overlap = f.from && f.to ? lists.filter(l => l.valid_from <= f.to && f.from <= l.valid_to) : []
  const ready = built && built.items.length && f.name.trim() && f.from && f.to && f.to >= f.from && map.catalogue >= 0 && (map.code >= 0 || map.ean >= 0)
  async function run() {
    setErr('')
    try {
      const items = built.items
      // 1) produkty (dodanie nowych, aktualizacja EAN i nazwy istniejących)
      const ids = new Map()
      for (let i = 0; i < items.length; i += 500) {
        setBusy(`Produkty: ${Math.min(i + 500, items.length)} / ${items.length}`)
        const { data, error } = await supabase.from('pr_products').upsert(items.slice(i, i + 500).map(x => ({ brand_id: brand.id, code: x.code, ean: x.ean, name: x.name, ...(x.category ? { category: x.category, category_source: 'plik' } : {}) })), { onConflict: 'brand_id,code' }).select('id, code')
        if (error) throw error
        for (const p of data) ids.set(p.code, p.id)
      }
      // 2) cennik i pozycje
      setBusy('Zapisywanie cennika…')
      const { data: { session } } = await supabase.auth.getSession()
      const { data: pl, error: e2 } = await supabase.from('pr_price_lists').insert({ brand_id: brand.id, name: f.name.trim(), valid_from: f.from, valid_to: f.to, source_gross: f.gross, vat_rate: Number(f.vat) || 0, file_name: file.fileName, created_by: session.user.id }).select('id').single()
      if (e2) throw e2
      const rows = items.map(x => ({ price_list_id: pl.id, product_id: ids.get(x.code), catalogue_price: x.catalogue, promo_price: x.promo })).filter(x => x.product_id)
      for (let i = 0; i < rows.length; i += 1000) {
        setBusy(`Pozycje cennika: ${Math.min(i + 1000, rows.length)} / ${rows.length}`)
        const { error } = await supabase.from('pr_price_items').insert(rows.slice(i, i + 1000)); if (error) throw error
      }
      await supabase.rpc('pr_apply_categories', { p_brand: brand.id })   // nowe produkty dostają kategorie z reguł
      setBusy(''); setFile(null); setMap(null); setF({ name: '', from: '', to: '', gross: true, vat: 23, minPrice: 1 }); onDone(`Zaimportowano „${f.name.trim()}”: ${rows.length} pozycji (${dpl(f.from)} – ${dpl(f.to)}).`)
    } catch (e) { setBusy(''); setErr(/pr_products|pr_price/.test(e.message) ? 'Brak tabel bazy cenników – uruchom migrację 36_baza_cennikow.sql.' : plError(e.message)) }
  }
  return (
    <div className="panel">
      <h2>Nowy cennik z pliku</h2>
      <p className="muted small">Plik Excel lub CSV w Waszym formacie. Studio samo rozpozna kolumny – sprawdź mapowanie przed importem. Jeden plik = jeden cennik z okresem obowiązywania; cena promocyjna obowiązuje przez cały okres cennika.</p>
      <input type="file" accept=".xlsx,.xls,.csv" onChange={e => e.target.files[0] && pick(e.target.files[0])} disabled={!!busy} />
      {err && <p className="error">{err}</p>}
      {file && map && <>
        <div className="grid-form price-form">
          <label>Nazwa cennika<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
          <label>Obowiązuje od<input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></label>
          <label>Obowiązuje do<input type="date" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></label>
          <label>Ceny w pliku<select value={f.gross ? 'brutto' : 'netto'} onChange={e => setF({ ...f, gross: e.target.value === 'brutto' })}><option value="brutto">brutto</option><option value="netto">netto – dolicz VAT</option></select></label>
          {!f.gross && <label>VAT %<input type="number" value={f.vat} onChange={e => setF({ ...f, vat: e.target.value })} /></label>}
          <label>Pomiń ceny do (zaślepki)<input type="number" min="0" step="0.01" value={f.minPrice} onChange={e => setF({ ...f, minPrice: e.target.value })} /></label>
        </div>
        <h3>Kolumny pliku <span className="muted small">(arkusz „{file.sheet}”, {file.rows.length} wierszy)</span></h3>
        <div className="grid-form price-map">
          {FIELDS.map(([k, label]) => <label key={k}>{label}<select value={map[k]} onChange={e => setMap({ ...map, [k]: Number(e.target.value) })}><option value={-1}>— brak —</option>{file.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}</select></label>)}
        </div>
        {built && <>
          <p className="small">Gotowe do importu: <strong>{built.items.length} pozycji</strong>{built.items.filter(x => x.promo).length ? `, w tym ${built.items.filter(x => x.promo).length} z ceną promocyjną` : ''}.
            {built.issues.noPrice ? ` Pominięte bez ceny: ${built.issues.noPrice}.` : ''}{built.issues.noKey ? ` Bez kodu i EAN: ${built.issues.noKey}.` : ''}{built.issues.duplicates.length ? ` Powtórzone kody (liczy się pierwszy): ${built.issues.duplicates.slice(0, 5).join(', ')}${built.issues.duplicates.length > 5 ? '…' : ''}.` : ''}</p>
          {built.issues.placeholder.length > 0 && <details className="small"><summary className="warn-text">Pominięto {built.issues.placeholder.length} pozycji z ceną ≤ {f.minPrice} zł (zaślepki, nie ceny) – rozwiń listę</summary><p className="muted">{built.issues.placeholder.slice(0, 40).join(' · ')}{built.issues.placeholder.length > 40 ? ' …' : ''}</p></details>}
          {built.issues.otherBrand > 0 && <p className="hint small">Pominięto {built.issues.otherBrand} pozycji innej marki niż {brand.name}: {[...built.issues.otherBrands.entries()].map(([k, v]) => `${k} (${v})`).join(', ')}.</p>}
          {built.issues.promoAbove > 0 && <p className="hint small">{built.issues.promoAbove} pozycji ma cenę promocyjną równą lub wyższą od katalogowej – sprawdź, czy kolumny nie są zamienione.</p>}
          {map.ean < 0 && <p className="hint small">Bez kolumny EAN dopasowanie ofert z Dealavo będzie możliwe tylko po kodzie produktu.</p>}
          <div className="table-wrap"><table className="compact">
            <thead><tr><th>Kod</th><th>EAN</th><th>Nazwa</th><th className="num-cell">Katalogowa (brutto)</th><th className="num-cell">Promocyjna (brutto)</th></tr></thead>
            <tbody>{built.items.slice(0, 6).map(x => <tr key={x.code}><td className="mono">{x.code}</td><td className="mono small">{x.ean || '—'}</td><td>{x.name || '—'}</td><td className="num-cell">{zl(x.catalogue)}</td><td className="num-cell">{zl(x.promo)}</td></tr>)}</tbody>
          </table></div>
        </>}
        {overlap.length > 0 && <p className="hint small">Okres nakłada się z: {overlap.map(l => `„${l.name}” (${dpl(l.valid_from)} – ${dpl(l.valid_to)})`).join(', ')}. Na wspólne dni obowiązywać będzie cennik, który zaczyna się później.</p>}
        <div className="row-actions"><button className="btn" disabled={!ready || !!busy} onClick={run}>Importuj cennik</button>{busy && <span className="muted working small">{busy}</span>}</div>
      </>}
    </div>
  )
}

function Categories({ brand, products, onChanged, setMsg }) {
  const [rules, setRules] = useState(null)
  const [nr, setNr] = useState({ pattern: '', category: '' })
  const load = () => supabase.from('pr_category_rules').select('*').eq('brand_id', brand.id).order('pattern').then(({ data, error }) => error ? setMsg({ type: 'error', text: /pr_category_rules/.test(error.message) ? 'Brak tabeli reguł – uruchom migrację 38_kategorie_produktow.sql.' : plError(error.message) }) : setRules(data))
  useEffect(() => { load() }, [brand.id])
  if (!rules) return <DrainLoader />
  const ruleOf = code => rules.filter(r => code.toUpperCase().startsWith(r.pattern.toUpperCase())).sort((a, b) => b.pattern.length - a.pattern.length)[0]
  const hits = Object.fromEntries(rules.map(r => [r.id, 0])); for (const p of products) { const r = ruleOf(p.code); if (r) hits[r.id]++ }
  const cats = [...new Set([...rules.map(r => r.category), ...products.map(p => p.category).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'pl'))
  const byCat = cats.map(c => [c, products.filter(p => p.category === c).length]).filter(([, n]) => n)
  const none = products.filter(p => !p.category)
  const manual = products.filter(p => p.category_source === 'ręcznie').length
  async function apply() { const { data, error } = await supabase.rpc('pr_apply_categories', { p_brand: brand.id }); if (error) setMsg({ type: 'error', text: plError(error.message) }); else { setMsg({ type: 'ok', text: `Przypisano kategorie z reguł: zmieniono ${data} produktów.` }); onChanged() } }
  const save = async (q, ok) => { const { error } = await q; if (error) setMsg({ type: 'error', text: /duplicate/.test(error.message) ? 'Taki prefiks już istnieje.' : plError(error.message) }); else { setMsg(ok ? { type: 'ok', text: ok } : null); load() } }
  return (
    <div className="cat-grid">
      <div>
        <h3>Reguły: prefiks kodu → kategoria</h3>
        <p className="muted small">Kod produktu zaczynający się od prefiksu dostaje kategorię; dłuższy prefiks wygrywa (np. „SCP200” przed „SCP”). Po zmianach kliknij „Przypisz kategorie z reguł”. Kategorie ustawione ręcznie lub wczytane z pliku nie są nadpisywane{manual ? ` (ręcznie: ${manual})` : ''}.</p>
        <datalist id="pr-cats">{cats.map(c => <option key={c} value={c} />)}</datalist>
        <div className="table-wrap"><table className="compact">
          <thead><tr><th>Prefiks</th><th>Kategoria</th><th className="num-cell">Produktów</th><th /></tr></thead>
          <tbody>{rules.map(r => <tr key={r.id}><td className="mono">{r.pattern}</td>
            <td><input className="inline-input" list="pr-cats" defaultValue={r.category} onBlur={e => e.target.value.trim() && e.target.value.trim() !== r.category && save(supabase.from('pr_category_rules').update({ category: e.target.value.trim() }).eq('id', r.id))} /></td>
            <td className="num-cell">{hits[r.id]}</td><td><button className="link-dark danger-link small" onClick={() => save(supabase.from('pr_category_rules').delete().eq('id', r.id))}>usuń</button></td></tr>)}
            <tr className="add-row"><td><input className="inline-input mono" value={nr.pattern} onChange={e => setNr({ ...nr, pattern: e.target.value })} placeholder="np. SDB" /></td>
              <td><input className="inline-input" list="pr-cats" value={nr.category} onChange={e => setNr({ ...nr, category: e.target.value })} placeholder="Kategoria" /></td><td />
              <td><button className="btn ghost small-btn" disabled={!nr.pattern.trim() || !nr.category.trim()} onClick={() => { save(supabase.from('pr_category_rules').insert({ brand_id: brand.id, pattern: nr.pattern.trim(), category: nr.category.trim() })); setNr({ pattern: '', category: '' }) }}>Dodaj</button></td></tr>
          </tbody>
        </table></div>
        <div className="row-actions"><button className="btn" onClick={apply}>Przypisz kategorie z reguł</button></div>
      </div>
      <div>
        <h3>Kategorie w bazie</h3>
        <ul className="cat-list">{byCat.map(([c, n]) => <li key={c}><span>{c}</span><span className="muted">{n}</span></li>)}</ul>
        {none.length > 0 && <><h3 className="warn-text">Bez kategorii: {none.length}</h3><p className="muted small">{none.slice(0, 30).map(p => p.code).join(', ')}{none.length > 30 ? ' …' : ''}</p></>}
      </div>
    </div>
  )
}

export default function PriceBase({ profile }) {
  const admin = profile?.role === 'admin'
  const [brands, setBrands] = useState(null)
  const [brandId, setBrandId] = useState('')
  const [lists, setLists] = useState([])
  const [counts, setCounts] = useState({})
  const [products, setProducts] = useState([])
  const [tab, setTab] = useState('cenniki')
  const [day, setDay] = useState(today())
  const [onDay, setOnDay] = useState(null)
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState('')
  const [newBrand, setNewBrand] = useState('')

  useEffect(() => { supabase.from('brands').select('id, name').order('name').then(({ data, error }) => { if (error) setErr(plError(error.message)); else { setBrands(data); setBrandId((data.find(b => b.name.toLowerCase() === 'schedline') || data[0])?.id || '') } }) }, [])
  async function load() {
    if (!brandId) return
    try {
      const [l, p] = await Promise.all([
        supabase.from('pr_price_lists').select('*').eq('brand_id', brandId).order('valid_from', { ascending: false }),
        fetchAll('pr_products', 'id, code, ean, name, active, category, category_source', x => x.eq('brand_id', brandId)),
      ])
      if (l.error) throw l.error
      setLists(l.data); setProducts(p.sort((a, b) => a.code.localeCompare(b.code, 'pl')))
      const c = {}
      for (const x of l.data) {
        const [a, b] = await Promise.all([
          supabase.from('pr_price_items').select('*', { count: 'exact', head: true }).eq('price_list_id', x.id),
          supabase.from('pr_price_items').select('*', { count: 'exact', head: true }).eq('price_list_id', x.id).not('promo_price', 'is', null),
        ])
        c[x.id] = { items: a.count || 0, promo: b.count || 0 }
      }
      setCounts(c)
    } catch (e) { setErr(/pr_products|pr_price/.test(e.message) ? 'Brak tabel bazy cenników – uruchom migrację 36_baza_cennikow.sql.' : plError(e.message)) }
  }
  useEffect(() => { load() }, [brandId])
  useEffect(() => { if (lists.length || tab === 'dzien') pricesOn(lists, day).then(setOnDay) }, [lists, day])

  if (err) return <section className="page"><h1>Produkty i cenniki</h1><p className="error">{err}</p></section>
  if (!brands) return <section className="page"><DrainLoader /></section>
  const brand = brands.find(b => b.id === brandId)
  const ql = q.trim().toLowerCase()
  const shown = products.filter(p => !ql || p.code.toLowerCase().includes(ql) || (p.ean || '').includes(ql) || (p.name || '').toLowerCase().includes(ql) || (p.category || '').toLowerCase().includes(ql))
  const active = lists.filter(l => l.valid_from <= day && day <= l.valid_to)

  async function addBrand() {
    const { data, error } = await supabase.from('brands').insert({ name: newBrand.trim() }).select('id, name').single()
    if (error) setMsg({ type: 'error', text: plError(error.message) }); else { setBrands([...brands, data].sort((a, b) => a.name.localeCompare(b.name))); setBrandId(data.id); setNewBrand('') }
  }
  async function removeList(l) {
    if (!confirm(`Usunąć cennik „${l.name}” (${dpl(l.valid_from)} – ${dpl(l.valid_to)})? Produkty zostają w bazie.`)) return
    const { error } = await supabase.from('pr_price_lists').delete().eq('id', l.id)
    if (error) setMsg({ type: 'error', text: plError(error.message) }); else { setMsg({ type: 'ok', text: `Usunięto „${l.name}”.` }); load() }
  }

  return (
    <section className="page wide">
      <h1>Produkty i cenniki</h1>
      <p className="muted lead">Wasze produkty i cenniki z okresami obowiązywania. Weryfikacja cen u partnerów porównuje oferty z ceną obowiązującą danego dnia: promocyjną, jeśli jest, w przeciwnym razie katalogową.</p>
      <div className="panel">
        <div className="prices-head">
          <label className="inline-label">Marka<select value={brandId} onChange={e => setBrandId(e.target.value)}>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          {admin && <span className="row-actions"><input value={newBrand} onChange={e => setNewBrand(e.target.value)} placeholder="Nowa marka…" /><button className="btn ghost small-btn" disabled={!newBrand.trim()} onClick={addBrand}>Dodaj markę</button></span>}
        </div>
        <p className="small">{brand?.name}: <strong>{products.length}</strong> produktów · <strong>{lists.length}</strong> {lists.length === 1 ? 'cennik' : 'cenników'}</p>
        {msg && <p className={msg.type} role="status">{msg.text}</p>}
        <div className="tabs" role="tablist">
          {[['cenniki', 'Cenniki'], ['produkty', 'Produkty'], ['kategorie', 'Kategorie'], ['dzien', 'Cena na dzień']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k)}>{l}</button>)}
        </div>

        {tab === 'cenniki' && (lists.length === 0 ? <p className="muted">Brak cenników – zaimportuj pierwszy poniżej.</p> : (
          <div className="table-wrap"><table className="compact">
            <thead><tr><th>Cennik</th><th>Obowiązuje</th><th className="num-cell">Pozycji</th><th className="num-cell">Z promocją</th><th>Ceny w pliku</th><th>Plik</th>{admin && <th />}</tr></thead>
            <tbody>{lists.map(l => (
              <tr key={l.id} className={l.valid_from <= today() && today() <= l.valid_to ? 'current-list' : ''}>
                <td><strong>{l.name}</strong>{l.valid_from <= today() && today() <= l.valid_to && <span className="tag okt">obowiązuje</span>}</td>
                <td>{dpl(l.valid_from)} – {dpl(l.valid_to)}</td>
                <td className="num-cell">{counts[l.id]?.items ?? '…'}</td>
                <td className="num-cell">{counts[l.id]?.promo ?? '…'}</td>
                <td className="small">{l.source_gross ? 'brutto' : `netto + VAT ${l.vat_rate}%`}</td>
                <td className="small muted">{l.file_name || '—'}</td>
                {admin && <td><button className="link-dark danger-link small" onClick={() => removeList(l)}>usuń</button></td>}
              </tr>
            ))}</tbody>
          </table></div>
        ))}

        {tab === 'produkty' && <>
          <div className="filters"><input placeholder="Szukaj: kod, EAN, nazwa, kategoria…" value={q} onChange={e => setQ(e.target.value)} /><span className="muted small">Cena z dnia {dpl(day)} · ✎ = kategoria ustawiona ręcznie (reguły jej nie nadpisują)</span></div>
          <datalist id="pr-cats-all">{[...new Set(products.map(p => p.category).filter(Boolean))].sort().map(c => <option key={c} value={c} />)}</datalist>
          <div className="table-wrap"><table className="compact">
            <thead><tr><th>Kod</th><th>EAN</th><th>Nazwa</th><th>Kategoria</th><th className="num-cell">Katalogowa</th><th className="num-cell">Promocyjna</th><th className="num-cell">Minimalna</th></tr></thead>
            <tbody>{shown.slice(0, 300).map(p => { const pr = onDay?.get(p.id); return (
              <tr key={p.id}><td className="mono">{p.code}</td><td className="mono small">{p.ean || <span className="warn-text">brak</span>}</td><td>{p.name || '—'}</td>
                <td>{admin ? <input className="inline-input" list="pr-cats-all" defaultValue={p.category || ''} title={p.category_source ? `źródło: ${p.category_source}` : ''} onBlur={e => { const v = e.target.value.trim(); if (v !== (p.category || '')) supabase.from('pr_products').update({ category: v || null, category_source: v ? 'ręcznie' : null }).eq('id', p.id).then(({ error }) => error ? setMsg({ type: 'error', text: plError(error.message) }) : load()) }} /> : (p.category || '—')}{p.category_source === 'ręcznie' && <span className="muted small"> ✎</span>}</td>
                <td className="num-cell">{zl(pr?.catalogue_price)}</td><td className="num-cell">{zl(pr?.promo_price)}</td><td className="num-cell"><strong>{zl(pr?.min)}</strong></td></tr>) })}</tbody>
          </table></div>
          {shown.length > 300 && <p className="muted small">Pokazano 300 z {shown.length} – zawęź wyszukiwanie.</p>}
        </>}

        {tab === 'kategorie' && brand && <Categories brand={brand} products={products} onChanged={load} setMsg={setMsg} />}

        {tab === 'dzien' && <>
          <div className="filters">
            <label className="inline-label">Dzień<input type="date" value={day} onChange={e => setDay(e.target.value)} /></label>
            <input placeholder="Szukaj: kod, EAN, nazwa…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <p className="small">{active.length ? <>Obowiązuje: {active.map(l => <strong key={l.id}>{l.name} </strong>)}({dpl(active[0].valid_from)} – {dpl(active[0].valid_to)}). Produktów z ceną: {onDay?.size ?? '…'} z {products.length}.</> : <span className="warn-text">Tego dnia nie obowiązuje żaden cennik {brand?.name}.</span>}</p>
          {active.length > 0 && <div className="table-wrap"><table className="compact">
            <thead><tr><th>Kod</th><th>Nazwa</th><th className="num-cell">Katalogowa</th><th className="num-cell">Promocyjna</th><th className="num-cell">Minimalna (do weryfikacji)</th><th>Cennik</th></tr></thead>
            <tbody>{shown.filter(p => onDay?.has(p.id)).slice(0, 300).map(p => { const pr = onDay.get(p.id); return (
              <tr key={p.id}><td className="mono">{p.code}</td><td>{p.name || '—'}</td><td className="num-cell">{zl(pr.catalogue_price)}</td><td className="num-cell">{zl(pr.promo_price)}</td><td className="num-cell"><strong>{zl(pr.min)}</strong></td><td className="small muted">{pr.list}</td></tr>) })}</tbody>
          </table></div>}
        </>}
      </div>
      {admin && brand && <Importer brand={brand} lists={lists} onDone={text => { setMsg({ type: 'ok', text }); setTab('cenniki'); load() }} />}
    </section>
  )
}
