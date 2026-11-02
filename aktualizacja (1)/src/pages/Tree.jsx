import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Papa from 'papaparse'
import { supabase, plError } from '../supabase.js'
import { parseModel, skuAttributes } from '../parser.js'
import TreeDiagram from '../components/TreeDiagram.jsx'
import { decodeBytes, repairTable, isPim, rowsFromPim, RULES } from '../pim.js'
import DrainLoader from '../components/DrainLoader.jsx'

const ST = {
  opublikowany: { label: 'opublikowany', cls: 'st-opublikowany' },
  zaakceptowany: { label: 'zaakceptowany', cls: 'st-zaakceptowany' },
  do_weryfikacji: { label: 'do weryfikacji', cls: 'st-do_weryfikacji' },
  generowanie: { label: 'w trakcie', cls: 'st-do_weryfikacji' },
  poprawki: { label: 'poprawiany', cls: 'st-do_weryfikacji' },
  blad: { label: 'błąd', cls: 'st-blad' },
  brak_opisu: { label: 'brak opisu', cls: 'st-none' },
  poza_aplikacja: { label: 'poza aplikacją', cls: 'st-out' },
}
const pct = (a, b) => b ? Math.round(100 * a / b) : 0
const plural = (n, a, b, c) => n === 1 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? b : c

function rowsFromCsv(data) {
  const get = (r, ...k) => { for (const x of k) if (r[x] != null && String(r[x]).trim() !== '') return String(r[x]).trim(); return '' }
  return data.map(r => {
    const sku = get(r, 'produkt_sku', 'sku', 'SKU'); if (!sku) return null
    const name = get(r, 'produkt_nazwa', 'nazwa', 'name').replace(/\s+/g, ' ')
    const parsed = parseModel(name)
    const idRaw = get(r, 'produkt_id', 'id')
    return { sku, name, ean: get(r, 'produkt_ean', 'ean', 'EAN') || null, brand: get(r, 'producent_nazwa', 'marka', 'brand') || parsed.brand,
      category: get(r, 'kategoria_nazwa', 'kategoria', 'category') || null, model: parsed.model, bl_id: /^\d+$/.test(idRaw) ? Number(idRaw) : null }
  }).filter(Boolean)
}

function Upload({ last, onDone }) {
  const [busy, setBusy] = useState(''); const [msg, setMsg] = useState(null)
  const [isOpen, setIsOpen] = useState(!last)
  async function pick(e) {
    const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
    setMsg(null); setBusy('Odczytywanie pliku…')
    try {
      const buf = await file.arrayBuffer()
      let table, note = ''
      if (/\.xlsx?$/i.test(file.name)) {
        const XLSX = await import('xlsx')
        const wb = XLSX.read(buf, { type: 'array' })
        table = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' })
      } else {
        table = Papa.parse(decodeBytes(buf).text, { header: false, skipEmptyLines: true, delimitersToGuess: ['\t', ';', ','] }).data
      }
      // naprawa polskich znaków komórka po komórce (także XLSX)
      const rep = repairTable(table)
      table = rep.table
      if (rep.exact || rep.approx) note = ` Naprawiono polskie znaki w ${rep.exact + rep.approx} komórkach${rep.approx ? ` (w ${rep.approx} – odtworzone z kontekstu, bo w pliku brakowało części bajtów; sprawdź kilka nazw, a przy okazji wyeksportuj z PIM plik w UTF-8)` : ''}.`
      let rows, kind
      if (isPim(table)) {
        const res = rowsFromPim(table)
        if (res.badLayout) throw new Error('Plik wygląda jak eksport PIM, ale kolumny są przesunięte (np. EAN nie jest w oczekiwanym miejscu). Daj znać – trzeba poprawić mapowanie kolumn.')
        rows = res.rows; kind = 'PIM'
      } else {
        const [head, ...body] = table
        rows = rowsFromCsv(body.map(r => Object.fromEntries(head.map((h, i) => [String(h).trim(), r[i]])))); kind = 'CSV'
      }
      if (!rows.length) throw new Error('Nie znaleziono produktów. Obsługiwane: eksport z PIM albo CSV z kolumną produkt_sku / sku.')
      const dup = rows.length - new Set(rows.map(r => r.sku)).size
      setBusy(`Zapisywanie ${rows.length} SKU…`)
      const { data: { session } } = await supabase.auth.getSession()
      const batch = crypto.randomUUID()
      const uniq = [...new Map(rows.map(r => [r.sku, r])).values()].map(r => ({ category_path: null, technology: null, color: null, shape: null, source: 'csv', issues: [], raw: null, ...r, batch_id: batch, uploaded_by: session.user.id, uploaded_at: new Date().toISOString() }))
      for (let i = 0; i < uniq.length; i += 500) {
        const { error } = await supabase.from('assortment').upsert(uniq.slice(i, i + 500), { onConflict: 'sku' })
        if (error) throw error
      }
      const del = await supabase.from('assortment').delete().neq('batch_id', batch)
      if (del.error) throw del.error
      const withIssues = uniq.filter(r => r.issues?.length).length
      setMsg({ type: 'ok', text: `Zapisano ${uniq.length} SKU z pliku ${kind}${dup ? ` (pominięto ${dup} powtórzeń)` : ''}. Poprzednia lista została zastąpiona.${kind === 'PIM' ? ` Kontrola jakości: ${withIssues ? `${withIssues} SKU z uwagami – zobacz raport poniżej.` : 'bez uwag.'}` : ''}${note}` })
      onDone()
    } catch (err) { setMsg({ type: 'error', text: plError(err.message) }) } finally { setBusy('') }
  }
  return (
    <div className="panel upload-panel">
      <div className="upload-head">
        <div><strong>Lista asortymentu</strong> <span className="muted small">{last ? `wgrana ${new Date(last.at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })} · ${last.count} SKU${last.pim ? ' · z PIM' : ''}` : 'jeszcze nie wgrana'}</span></div>
        <label className="btn upload">{busy ? 'Wgrywanie…' : last ? 'Wgraj nową listę' : 'Wgraj listę'}<input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" onChange={pick} disabled={!!busy} hidden /></label>
      </div>
      <details open={isOpen} onToggle={e => setIsOpen(e.currentTarget.open)}><summary className="muted small">Jaki plik wgrać?</summary>
        <p className="muted small">Eksport z PIM (CSV, TSV albo XLSX) – struktura drzewa powstanie ze ścieżki kategorii PIM. Działa też CSV z Baselinkera. Lista służy tylko do podglądu pokrycia i nie tworzy produktów do generowania opisów. Nowy plik zastępuje poprzednią listę.</p>
      </details>
      {busy && <p className="muted working" role="status">{busy}</p>}
      {msg && <p className={msg.type} role="status">{msg.text}</p>}
    </div>
  )
}

function QualityReport({ rows, rule, setRule }) {
  const withIssues = rows.filter(r => r.issues?.length)
  const counts = {}
  withIssues.forEach(r => new Set(r.issues.map(i => i.code)).forEach(c => { counts[c] = (counts[c] || 0) + 1 }))
  const list = withIssues.flatMap(r => r.issues.filter(i => !rule || i.code === rule).map(i => ({ ...i, sku: r.sku, name: r.name, path: [r.brand, ...(r.category_path || [r.category])].filter(Boolean).join(' › ') })))
  function download() {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const all = withIssues.flatMap(r => r.issues.map(i => [r.sku, r.name, [r.brand, ...(r.category_path || [r.category])].filter(Boolean).join(' > '), RULES[i.code] || i.code, i.msg]))
    const csv = '\uFEFF' + [['SKU', 'Nazwa', 'Kategoria', 'Problem', 'Szczegóły'], ...all].map(r => r.map(esc).join(';')).join('\r\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `jakosc-danych-pim-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }
  if (!rows.some(r => r.source === 'pim')) return null
  return (
    <details className="panel quality" open={withIssues.length > 0 && withIssues.length < 400}>
      <summary><strong>Jakość danych PIM</strong> <span className={withIssues.length ? 'tag warn' : 'tag okt'}>{withIssues.length ? `${withIssues.length} SKU z uwagami` : 'bez uwag'}</span></summary>
      {withIssues.length > 0 && (
        <>
          <div className="q-rules">
            <button className={!rule ? 'q-chip on' : 'q-chip'} onClick={() => setRule('')}>Wszystkie <span>{withIssues.length}</span></button>
            {Object.entries(RULES).filter(([k]) => counts[k]).map(([k, v]) => (
              <button key={k} className={rule === k ? 'q-chip on' : 'q-chip'} onClick={() => setRule(rule === k ? '' : k)}>{v} <span>{counts[k]}</span></button>
            ))}
          </div>
          <div className="table-wrap q-table">
            <table className="compact">
              <thead><tr><th>SKU</th><th>Problem</th><th>Szczegóły</th><th>Kategoria</th></tr></thead>
              <tbody>{list.slice(0, 200).map((i, n) => (
                <tr key={n}><td className="mono">{i.sku}</td><td>{RULES[i.code] || i.code}</td><td className="flags">{i.msg}</td><td className="muted small">{i.path}</td></tr>
              ))}</tbody>
            </table>
            {list.length > 200 && <p className="muted small">Pokazano 200 z {list.length}. Pełna lista jest w raporcie CSV.</p>}
          </div>
          <button className="btn ghost" onClick={download}>Pobierz raport CSV</button>
          <p className="muted small">Raport jest gotowy do przekazania osobie od danych produktowych. Po poprawkach w PIM wgraj nowy eksport – kontrola uruchomi się ponownie.</p>
        </>
      )}
    </details>
  )
}

function Bar({ done, total }) {
  return <span className="tree-bar" title={`${done} / ${total}`}><span style={{ width: `${pct(done, total)}%` }} /></span>
}

export default function Tree() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [channel, setChannel] = useState('')
  const [q, setQ] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [rule, setRule] = useState('')
  const [open, setOpen] = useState(new Set())
  const [view, setView] = useState(() => { try { return localStorage.getItem('drzewo-widok') || 'lista' } catch { return 'lista' } })
  const pickView = v => { setView(v); try { localStorage.setItem('drzewo-widok', v) } catch {} }

  async function load() {
    const fetchAll = async (table, cols) => { let out = [], from = 0; for (;;) { const { data, error } = await supabase.from(table).select(cols).range(from, from + 999); if (error) throw error; out = out.concat(data); if (data.length < 1000) return out; from += 1000 } }
    try {
      const [as, pr, fam, ch, ds, rl, br] = await Promise.all([
        fetchAll('assortment', 'sku, name, brand, category, category_path, model, color, shape, technology, source, issues, uploaded_at'), fetchAll('products', 'id, sku, name, family_id, attributes'),
        fetchAll('product_families', 'id, model_name'), supabase.from('channels').select('id, marketplace, language').eq('active', true),
        fetchAll('descriptions', 'id, channel_id, product_id, version, status'),
        supabase.from('import_rules').select('*'),
        supabase.from('brands').select('id, name'),
      ])
      const order = { ro: 1, hu: 2, bg: 3 }
      const channels = (ch.data || []).sort((a, b) => (order[a.language] || 9) - (order[b.language] || 9))
      const latest = {}
      for (const x of ds.sort((a, b) => b.version - a.version)) { const k = `${x.channel_id}|${x.product_id}`; if (!latest[k]) latest[k] = x }
      const setRules = (rl.data || []).filter(r => r.attribute === 'rodzina' && r.active !== false && r.match_type === 'segment')
      setD({ as, products: Object.fromEntries(pr.map(p => [p.sku, p])), fam: Object.fromEntries(fam.map(f => [f.id, f.model_name])), channels, latest, setRules, rules: rl.data || [], brands: br?.data || [] })
      setChannel(c => c || channels[0]?.id || '')
    } catch (e) { setErr(plError(e.message)) }
  }
  useEffect(() => { load() }, [])

  const tree = useMemo(() => {
    if (!d) return null
    const status = (p, chId) => { if (!p) return 'poza_aplikacja'; const x = d.latest[`${chId}|${p.id}`]; return x ? x.status : 'brak_opisu' }
    const ql = q.trim().toLowerCase()
    const root = { children: {}, items: [] }
    const flatItems = []
    const title = x => String(x || '').trim().toLowerCase().replace(/(^|\s)\p{L}/gu, m => m.toUpperCase())
    let total = 0, inApp = 0
    const perCh = Object.fromEntries(d.channels.map(c => [c.id, 0]))
    const put = (path, item) => { let n = root; for (const k of path) n = (n.children[k] ||= { children: {}, items: [] }); n.items.push(item) }
    const inAssort = new Set(d.as.map(r => r.sku))
    const outside = Object.values(d.products).filter(p => !inAssort.has(p.sku)).map(p => ({ sku: p.sku, name: p.name, model: d.fam[p.family_id], outside: true }))
    for (const r of [...d.as, ...outside]) {
      const p = d.products[r.sku]
      const sts = Object.fromEntries(d.channels.map(c => [c.id, status(p, c.id)]))
      const descId = Object.fromEntries(d.channels.map(c => [c.id, p ? d.latest[`${c.id}|${p.id}`]?.id : null]))
      if (!r.outside) { total++; if (p) inApp++; d.channels.forEach(c => { if (sts[c.id] === 'opublikowany') perCh[c.id]++ }) }
      if (ql && !`${r.sku} ${r.name}`.toLowerCase().includes(ql)) continue
      if (onlyMissing && sts[channel] === 'opublikowany') continue
      if (onlyIssues && !(r.issues || []).some(i => !rule || i.code === rule)) continue
      const cats = r.outside ? [] : (r.category_path?.length ? r.category_path : [r.category || '(bez kategorii)'])
      // ta sama reguła zestawów co przy imporcie (np. /NO → „Antis + nośnik”)
      const segs = String(r.sku).split('/').slice(1).map(x => x.toUpperCase())
      const set = d.setRules.find(x => segs.includes(String(x.pattern).toUpperCase()))
      const pimModel = r.model ? (set ? `${r.model} + ${set.value}` : r.model) : null
      const model = (p && d.fam[p.family_id]) || pimModel || '(bez modelu)'
      put([r.outside ? '—' : (r.brand || '(bez marki)'), ...cats, model], { ...r, p, sts, descId })
      // poziomy diagramu: kategoria, technologia, model, kolor, rozmiar, odpływ
      const brandId = d.brands.find(b => b.name.toLowerCase() === String(r.brand || '').toLowerCase())?.id || null
      const catKey = cats.join(' ').toLowerCase()
      const attrs = { ...skuAttributes(r.sku, brandId, d.rules, catKey, r.shape), ...(p?.attributes || {}) }
      const dims = (attrs.wymiar || (String(r.name || p?.name || '').match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)/) || []).slice(1, 3).join('x')).replace(/\s+/g, '')
      flatItems.push({ ...r, p, sts, descId, levels: [r.outside ? 'Spoza listy PIM' : cats.join(' › '), title(r.technology), model, attrs.wykonczenie || title(r.color), attrs.ksztalt || r.shape || '', dims ? `${dims} cm` : '', attrs.odplyw || ''] })
    }
    const flat = n => [...n.items, ...Object.values(n.children).flatMap(flat)]
    const count = n => { const all = flat(n); return { total: all.length, done: all.filter(x => x.sts[channel] === 'opublikowany').length, issues: all.filter(x => x.issues?.length).length } }
    return { root, total, inApp, perCh, count, outside: outside.length, flatItems }
  }, [d, q, onlyMissing, onlyIssues, rule, channel])

  if (err) return <section className="page"><h1>Drzewo produktów</h1><p className="error">{err}</p>
    {/column|kolumn/i.test(err) && <p className="hint">Wygląda na to, że baza nie ma nowych kolumn. Uruchom w Supabase migracje 10_asortyment_pim.sql i 11_jakosc_pim.sql, potem odśwież stronę.</p>}</section>
  if (!d) return <section className="page"><DrainLoader /></section>
  const toggle = k => { const n = new Set(open); n.has(k) ? n.delete(k) : n.add(k); setOpen(n) }
  const last = d.as.length ? { at: d.as.reduce((m, r) => r.uploaded_at > m ? r.uploaded_at : m, d.as[0].uploaded_at), count: d.as.length, pim: d.as.some(r => r.source === 'pim') } : null
  const sortKeys = o => Object.keys(o).sort((a, b) => (a === '—') - (b === '—') || a.localeCompare(b, 'pl'))
  const Node = ({ k, label, node, level }) => {
    const { total, done, issues } = tree.count(node)
    const isOpen = open.has(k) || !!q.trim()
    const kids = sortKeys(node.children)
    return (
      <div className={`tree-node lvl-${Math.min(level, 3)}`}>
        <button className="tree-head" onClick={() => toggle(k)} aria-expanded={isOpen}>
          <span className="caret">{isOpen ? '▾' : '▸'}</span><span className="tree-label">{label}{issues > 0 && <span className="tag warn q-badge" title="SKU z uwagami jakości danych PIM">⚠ {issues}</span>}</span>
          <span className="tree-count">{done} / {total}</span><Bar done={done} total={total} />
        </button>
        {isOpen && (
          <>
            {kids.length > 0 && <div className="tree-children">{kids.map(x => <Node key={k + '|' + x} k={k + '|' + x} label={x} node={node.children[x]} level={level + 1} />)}</div>}
            {node.items.length > 0 && (
              <table className="compact tree-skus">
                <tbody>{[...node.items].sort((a, b) => a.sku.localeCompare(b.sku)).map(r => (
                  <tr key={r.sku}>
                    <td className="mono">{r.sku}</td>
                    <td className="tree-name">{r.name}{r.color && <span className="muted small"> · {r.color}</span>}
                      {r.issues?.length > 0 && <span className="q-issues">{r.issues.map((i, n) => <span key={n} className="tag warn">{RULES[i.code]}: {i.msg}</span>)}</span>}</td>
                    {d.channels.map(c => (
                      <td key={c.id} className={c.id === channel ? 'sel' : ''}>
                        {r.descId[c.id] ? <Link to={`/weryfikacja/${r.descId[c.id]}`} className={`tag ${ST[r.sts[c.id]]?.cls}`}>{c.language.toUpperCase()}: {ST[r.sts[c.id]]?.label}</Link>
                          : <span className={`tag ${ST[r.sts[c.id]]?.cls}`}>{c.language.toUpperCase()}: {ST[r.sts[c.id]]?.label}</span>}
                      </td>
                    ))}
                  </tr>
                ))}</tbody>
              </table>
            )}
          </>
        )}
      </div>
    )
  }
  const allKeys = () => { const ks = []; const walk = (n, k) => { for (const x of Object.keys(n.children)) { const kk = k ? k + '|' + x : x; ks.push(kk); walk(n.children[x], kk) } }; walk(tree.root, ''); return ks }

  return (
    <section className="page wide">
      <h1>Drzewo produktów</h1>
      <Upload last={last} onDone={load} />
      {d.as.length > 0 && (
        <>
          <div className="tree-summary">
            <div className="panel stat"><span className="big">{tree.total}</span><span className="muted">SKU w asortymencie</span></div>
            <div className="panel stat"><span className="big">{pct(tree.inApp, tree.total)}%</span><span className="muted">w aplikacji ({tree.inApp})</span></div>
            {d.channels.map(c => (
              <div key={c.id} className="panel stat"><span className="big">{pct(tree.perCh[c.id], tree.total)}%</span><span className="muted">opublikowane {c.marketplace} {c.language.toUpperCase()} ({tree.perCh[c.id]})</span></div>
            ))}
          </div>
          <QualityReport rows={d.as} rule={rule} setRule={r => { setRule(r); if (r) setOnlyIssues(true) }} />
          <div className="tree-tools">
            <div className="seg view-seg" role="group" aria-label="Widok"><button className={view === 'lista' ? 'seg-btn on' : 'seg-btn'} onClick={() => pickView('lista')}>Lista</button><button className={view === 'diagram' ? 'seg-btn on' : 'seg-btn'} onClick={() => pickView('diagram')}>Diagram</button></div>
            <div className="seg">{d.channels.map(c => <button key={c.id} className={c.id === channel ? 'seg-btn on' : 'seg-btn'} onClick={() => setChannel(c.id)}>{c.marketplace} {c.language.toUpperCase()}</button>)}</div>
            <input className="tree-search" placeholder="Szukaj SKU albo nazwy…" value={q} onChange={e => setQ(e.target.value)} aria-label="Szukaj" />
            <label className="check small"><input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} /> tylko nieopublikowane</label>
            <label className="check small"><input type="checkbox" checked={onlyIssues} onChange={e => setOnlyIssues(e.target.checked)} /> tylko z uwagami PIM{rule ? ` (${RULES[rule]})` : ''}</label>
            {view === 'lista' && <><button className="link-dark" onClick={() => setOpen(new Set(allKeys()))}>Rozwiń wszystko</button>
            <button className="link-dark" onClick={() => setOpen(new Set())}>Zwiń</button></>}
          </div>
          <p className="muted small">Pasek i licznik przy każdej gałęzi: opublikowane w wybranym kanale / wszystkie SKU. Kliknij status przy SKU, żeby otworzyć opis.</p>
          {tree.outside > 0 && <p className="hint">{tree.outside} SKU jest w aplikacji, ale nie ma ich na liście asortymentu – znajdziesz je w gałęzi „Produkty w aplikacji spoza listy”. Sprawdź, czy lista z PIM jest kompletna.</p>}
          {view === 'diagram' ? (tree.flatItems.length ? <TreeDiagram items={tree.flatItems} channel={channel} channelLabel={(c => c ? `${c.marketplace} ${c.language.toUpperCase()}` : '')(d.channels.find(c => c.id === channel))} /> : <div className="panel"><p className="muted">Nic nie pasuje do filtrów.</p></div>) : (
          <div className="panel tree">
            {Object.keys(tree.root.children).length === 0 ? <p className="muted">Nic nie pasuje do filtrów.</p>
              : sortKeys(tree.root.children).map(b => <Node key={b} k={b} label={b === '—' ? 'Produkty w aplikacji spoza listy' : b} node={tree.root.children[b]} level={0} />)}
          </div>)}
        </>
      )}
    </section>
  )
}
