import { useEffect, useMemo, useState } from 'react'
import { supabase, plError, fetchAll } from '../supabase.js'
import { runJob, PUBLISH_URL } from '../jobs.js'
import { ftpLink, DEFAULT_ASSET_BASE } from '../render.js'
import { skuAttributes } from '../parser.js'
import DrainLoader from '../components/DrainLoader.jsx'

// Pliki z konwencji Oli: {baza}/{model}/{kolor}/{kształt}/{X}.jpg oraz rysunek {baza}/{model}/{X}.jpg
const SLOTS = [
  { key: 'packshot', x: 'auto-packshot', label: 'Packshot' },
  { key: 'ar1', x: '2', label: 'Aranżacja 1' },
  { key: 'ar2', x: '3', label: 'Aranżacja 2' },
  { key: 'info', x: '4', label: 'Infografika' },
  { key: 'rys', x: 'auto-drawing', label: 'Rysunek techniczny' },
]
const PACK = { '1': 'narożnik', '1a': 'środek boku', '1b': 'krótki bok' }
const odm = (n, a, b, c) => `${n} ${n === 1 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? b : c}`
const title = x => String(x || '').trim().toLowerCase().replace(/(^|\s)\p{L}/gu, m => m.toUpperCase())
const CHUNK = 500

function Bar({ ok, total }) {
  return <span className="bar img-bar" title={`${ok} z ${total}`}><span style={{ width: `${total ? (100 * ok) / total : 0}%` }} /></span>
}
function Count({ s }) {
  return <span className="img-count">{s.ok}/{s.total}{s.unknown ? <span className="muted"> · {s.unknown} niespr.</span> : null}</span>
}

export default function Images({ profile }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const [open, setOpen] = useState(new Set())

  async function load() {
    try {
      const [as, pr, fam, rl, br, ck] = await Promise.all([
        fetchAll('assortment', 'sku, name, brand, category_path, category, model, shape, color'),
        fetchAll('products', 'sku, family_id, attributes'),
        fetchAll('product_families', 'id, model_name'),
        supabase.from('import_rules').select('*'),
        supabase.from('brands').select('id, name'),
        fetchAll('img_checks', 'url, ok, http_status, checked_at'),
      ])
      setD({ as, products: Object.fromEntries(pr.map(p => [p.sku, p])), fam: Object.fromEntries(fam.map(f => [f.id, f.model_name])), rules: rl.data || [], brands: br.data || [], checks: Object.fromEntries(ck.map(c => [c.url, c])) })
    } catch (e) { setErr(/img_checks/.test(e.message) ? 'Baza nie ma jeszcze tabeli wyników – uruchom migrację 28_grafiki_ftp.sql.' : plError(e.message)) }
  }
  useEffect(() => { load() }, [])

  // drzewo: kategoria → seria → kolor → kształt → pliki (wspólne dla rozmiarów), z listą SKU korzystających z pliku
  const model = useMemo(() => {
    if (!d) return null
    const tree = new Map(), outside = [], urls = new Map()
    for (const r of d.as) {
      if (String(r.brand || '').toLowerCase() !== 'aedler') continue   // konwencja i serwer: Aedler
      const p = d.products[r.sku]
      const path = (r.category_path?.length ? r.category_path : [r.category || 'Bez kategorii'])
      const catKey = path.join(' › ')
      const brandId = d.brands.find(b => b.name.toLowerCase() === 'aedler')?.id || null
      const a = { ...skuAttributes(r.sku, brandId, d.rules, path.join(' ').toLowerCase(), r.shape), ...(p?.attributes || {}) }
      if (!a.ksztalt && r.shape) a.ksztalt = r.shape
      const famName = (p && d.fam[p.family_id]) || r.model || ''
      const files = SLOTS.map(s => ({ slot: s, ...ftpLink({ ftp_x: s.x }, { family: { model_name: famName }, product: { attributes: a } }, DEFAULT_ASSET_BASE) }))
      const okFiles = files.filter(f => f.url)
      if (!okFiles.length || !files[0].url) { outside.push({ sku: r.sku, cat: catKey, model: famName || '—', why: files[0].why || files.find(f => f.why)?.why || 'poza konwencją' }); continue }
      const seriesName = String(famName).split(' + ')[0] || '—'
      const colorName = String(a.wykonczenie || '').split('(')[0].trim() || '—'
      const node = [catKey, seriesName, colorName, a.ksztalt || '—'].reduce((m, k, i) => { if (!m.has(k)) m.set(k, i < 3 ? new Map() : new Map()); return m.get(k) }, tree)
      for (const f of okFiles) {
        if (!node.has(f.url)) node.set(f.url, { url: f.url, slot: f.slot, x: f.url.split('/').pop().replace('.jpg', ''), skus: [] })
        node.get(f.url).skus.push(r.sku)
        urls.set(f.url, true)
      }
    }
    return { tree, outside, urls: [...urls.keys()] }
  }, [d])

  if (err) return <section className="page"><h1>Grafiki na FTP</h1><p className="error">{err}</p></section>
  if (!d || !model) return <section className="page"><DrainLoader /></section>

  const st = url => { const c = d.checks[url]; return !c ? 'niespr' : c.ok ? 'ok' : 'brak' }
  const stats = files => ({ total: files.length, ok: files.filter(f => st(f.url) === 'ok').length, unknown: files.filter(f => st(f.url) === 'niespr').length })
  const filesOf = node => node instanceof Map ? [...node.values()].flatMap(v => v instanceof Map ? filesOf(v) : [v]) : []
  const uniq = files => [...new Map(files.map(f => [f.url, f])).values()]
  const ql = q.trim().toLowerCase()
  const cats = [...model.tree.keys()].sort((a, b) => a.localeCompare(b, 'pl'))
  const visibleCats = cats.filter(c => !cat || c === cat || c.startsWith(cat + ' › '))
  const lastCheck = Object.values(d.checks).reduce((m, c) => c.checked_at > m ? c.checked_at : m, '')
  const canCheck = ['generujacy', 'akceptujacy', 'admin'].includes(profile?.role)
  const toggle = k => setOpen(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n })
  const keep = node => { const f = uniq(filesOf(node)); return !onlyMissing || f.some(x => st(x.url) !== 'ok') }

  async function check(onlyUnchecked) {
    const list = onlyUnchecked ? model.urls.filter(u => !d.checks[u]) : model.urls
    if (!list.length) { setMsg({ type: 'ok', text: 'Wszystkie pliki były już sprawdzane – użyj „Sprawdź wszystkie ponownie”.' }); return }
    setMsg(null)
    try {
      let ok = 0
      for (let i = 0; i < list.length; i += CHUNK) {
        const part = list.slice(i, i + CHUNK)
        setBusy(`Sprawdzanie plików na serwerze: ${i + 1}–${i + part.length} z ${list.length}…`)
        const r = await runJob('img_check', { urls: part }, { url: PUBLISH_URL, timeoutSec: 90 + Math.ceil(part.length * 0.4) })
        const items = (r.result || r).items || []
        const now = new Date().toISOString()
        const e = await supabase.from('img_checks').upsert(items.map(x => ({ url: x.url, ok: !!x.ok, http_status: x.http_status || null, checked_at: now })))
        if (e.error) throw e.error
        ok += items.filter(x => x.ok).length
      }
      setMsg({ type: 'ok', text: `Sprawdzono ${odm(list.length, 'plik', 'pliki', 'plików')}: jest ${ok}, brakuje ${list.length - ok}.` })
      await load()
    } catch (e) { setMsg({ type: 'error', text: plError(e.message) }) } finally { setBusy('') }
  }
  function exportMissing() {
    const rows = []
    for (const c of visibleCats) for (const [s, colors] of model.tree.get(c)) for (const [col, shapes] of colors) for (const [sh, files] of shapes)
      for (const f of files.values()) if (st(f.url) !== 'ok') rows.push([c, s, col, sh, f.slot.label + (f.slot.key === 'packshot' ? ` (${PACK[f.x] || f.x})` : ''), f.url.replace(DEFAULT_ASSET_BASE, ''), f.url, st(f.url) === 'brak' ? 'brak' : 'niesprawdzony', f.skus.join(' ')])
    const csv = '\uFEFF' + [['Kategoria', 'Seria', 'Kolor', 'Kształt', 'Grafika', 'Ścieżka w folderze AEDLER', 'Pełny adres', 'Status', 'SKU'], ...rows].map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `brakujace-grafiki-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  const all = stats(uniq(model.urls.map(url => ({ url }))))
  return (
    <section className="page wide">
      <h1>Grafiki na FTP</h1>
      <p className="muted lead">Które grafiki z konwencji są już na serwerze, a które trzeba dodać. Pliki są wspólne dla rozmiarów – przy każdym widać, których SKU dotyczy. Serwer: <code>{DEFAULT_ASSET_BASE}</code></p>
      <div className="dash-top img-top">
        <div className="panel">
          <div className="img-summary"><span className="cov-n">{all.ok}</span><span>z {odm(all.total, 'pliku', 'plików', 'plików')} jest na serwerze</span><Bar ok={all.ok} total={all.total} /></div>
          <p className="muted small">{all.unknown ? `${odm(all.unknown, 'plik nie był', 'pliki nie były', 'plików nie było')} jeszcze sprawdzane. ` : ''}{lastCheck ? `Ostatnie sprawdzenie: ${new Date(lastCheck).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}.` : 'Serwer nie był jeszcze sprawdzany.'}</p>
          {canCheck && <div className="row-actions">
            <button className="btn" disabled={!!busy} onClick={() => check(true)}>Sprawdź niesprawdzone</button>
            <button className="btn ghost" disabled={!!busy} onClick={() => check(false)}>Sprawdź wszystkie ponownie</button>
          </div>}
          {busy && <p className="muted working" role="status">{busy}</p>}
          {msg && <p className={msg.type} role="status">{msg.text}</p>}
        </div>
        <div className="panel">
          <h2>Kategorie</h2>
          <ul className="img-cats">{cats.map(c => { const s = stats(uniq(filesOf(model.tree.get(c)))); return <li key={c}><button className="link-dark" onClick={() => setCat(cat === c ? '' : c)}>{c}</button><Count s={s} /><Bar ok={s.ok} total={s.total} /></li> })}</ul>
        </div>
      </div>

      <div className="panel">
        <div className="filters">
          <select value={cat} onChange={e => setCat(e.target.value)}><option value="">wszystkie kategorie</option>{cats.map(c => <option key={c}>{c}</option>)}</select>
          <input placeholder="Szukaj serii…" value={q} onChange={e => setQ(e.target.value)} />
          <label className="check small"><input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} /> tylko z brakami</label>
          <button className="link-dark" onClick={() => setOpen(new Set(visibleCats.flatMap(c => [c, ...[...model.tree.get(c).keys()].map(s => c + '|' + s)])))}>rozwiń serie</button>
          <button className="link-dark" onClick={() => setOpen(new Set())}>zwiń</button>
          <button className="btn ghost small-btn" onClick={exportMissing}>Pobierz listę braków (CSV)</button>
        </div>
        <p className="muted small legend-row"><span className="img-chip ok">jest</span><span className="img-chip brak">brak</span><span className="img-chip niespr">nie sprawdzono</span> · kliknij plik, żeby go otworzyć; przy braku – ścieżka, pod którą trzeba go wgrać</p>
        <div className="img-tree">
          {visibleCats.filter(c => keep(model.tree.get(c))).map(c => {
            const series = [...model.tree.get(c).entries()].filter(([s, v]) => (!ql || s.toLowerCase().includes(ql)) && keep(v)).sort((a, b) => a[0].localeCompare(b[0], 'pl'))
            if (!series.length) return null
            const cs = stats(uniq(filesOf(model.tree.get(c))))
            const isOpen = open.has(c) || !!ql
            return (
              <div key={c} className="img-node lvl-0">
                <button className="tree-head" onClick={() => toggle(c)} aria-expanded={isOpen}><span className="caret">{isOpen ? '▾' : '▸'}</span><span className="tree-label">{c}</span><Count s={cs} /><Bar ok={cs.ok} total={cs.total} /></button>
                {isOpen && series.map(([s, colors]) => {
                  const k = c + '|' + s, ss = stats(uniq(filesOf(colors))), so = open.has(k)
                  return (
                    <div key={k} className="img-node lvl-1">
                      <button className="tree-head" onClick={() => toggle(k)} aria-expanded={so}><span className="caret">{so ? '▾' : '▸'}</span><span className="tree-label">{title(s)}</span><Count s={ss} /><Bar ok={ss.ok} total={ss.total} /></button>
                      {so && [...colors.entries()].filter(([, v]) => keep(v)).map(([col, shapes]) => [...shapes.entries()].filter(([, v]) => keep(v)).map(([sh, files]) => {
                        const list = [...files.values()].sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) || a.x.localeCompare(b.x))
                        const skus = [...new Set(list.flatMap(f => f.skus))]
                        return (
                          <div key={col + sh} className="ftp-row">
                            <div className="ftp-row-head"><strong>{col}</strong> · {sh} <span className="muted small">· {odm(skus.length, 'SKU', 'SKU', 'SKU')}</span></div>
                            <div className="img-chips">{list.map(f => {
                              const s2 = st(f.url), label = f.slot.key === 'packshot' ? `Packshot – ${PACK[f.x] || f.x}` : f.slot.label
                              const path = f.url.replace(DEFAULT_ASSET_BASE, '')
                              return s2 === 'ok'
                                ? <a key={f.url} className="img-chip ok" href={f.url} target="_blank" rel="noreferrer" title={`${path}\nSKU: ${f.skus.join(', ')}`}>{label}</a>
                                : <span key={f.url} className={`img-chip ${s2}`} title={`${s2 === 'brak' ? 'Brak pliku' : 'Nie sprawdzono'} – wgraj jako: ${path}\nPełny adres: ${f.url}\nSKU: ${f.skus.join(', ')}`}>{label}<code>{path}</code></span>
                            })}</div>
                          </div>
                        )
                      }))}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {model.outside.length > 0 && (
        <details className="panel">
          <summary><strong>Poza konwencją</strong> <span className="muted small">{odm(model.outside.length, 'SKU', 'SKU', 'SKU')} – dla tych produktów konwencja nie wyznacza ścieżki (np. brak koloru albo kształtu w danych)</span></summary>
          <div className="table-wrap"><table className="compact"><thead><tr><th>SKU</th><th>Kategoria</th><th>Seria</th><th>Powód</th></tr></thead>
            <tbody>{model.outside.slice(0, 300).map(o => <tr key={o.sku}><td className="mono">{o.sku}</td><td>{o.cat}</td><td>{o.model}</td><td className="muted">{o.why}</td></tr>)}</tbody></table></div>
        </details>
      )}
    </section>
  )
}
