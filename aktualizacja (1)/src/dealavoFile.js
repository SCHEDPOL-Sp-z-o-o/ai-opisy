// Import historii z raportu cenowego Dealavo (plik XLSX z panelu): wiersz = produkt × sprzedawca, kolumny = dni z ceną.
// Liczy wskaźniki tymi samymi wzorami co pobieranie z API (n8n „DL: pobierz i policz”).
import * as XLSX from 'xlsx'
import { norm } from './dealavo.js'

const DATE = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/          // MM/DD/YYYY HH:MM
const toUpd = h => { const m = String(h || '').trim().match(DATE); return m ? `${m[3]}_${m[1]}_${m[2]}_${m[4]}_${m[5]}` : null }
const num = v => { if (v === null || v === undefined || v === '') return null; const x = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : null }
const r2 = x => x === null ? null : Math.round(x * 100) / 100
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

export function parseReport(buffer, fileName = '') {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
  const hi = grid.findIndex(r => r && r.includes('Id') && r.includes('Retailer'))
  if (hi < 0) throw new Error(`${fileName}: nie znaleziono nagłówków raportu Dealavo (kolumny „Id” i „Retailer”)`)
  const head = grid[hi].map(h => (h === null ? '' : String(h).trim()))
  const col = n => head.indexOf(n)
  const need = ['Id', 'Retailer', 'Suggested price']
  for (const n of need) if (col(n) < 0) throw new Error(`${fileName}: brak kolumny „${n}” w raporcie`)
  const days = head.map((h, i) => ({ i, upd: toUpd(h) })).filter(x => x.upd)
  if (!days.length) throw new Error(`${fileName}: brak kolumn z datami (format MM/DD/YYYY HH:MM)`)
  const rows = []
  for (const r of grid.slice(hi + 1)) {
    if (!r || r[col('Id')] === null || r[col('Retailer')] === null) continue
    rows.push({
      product_id: String(r[col('Id')]).trim(), article: col('Article') >= 0 ? r[col('Article')] : null, retailer: String(r[col('Retailer')]).trim(),
      suggested: num(r[col('Suggested price')]), source: col('Source') >= 0 ? r[col('Source')] : null, url: col('Url') >= 0 ? r[col('Url')] : null,
      ean: col('EAN') >= 0 && r[col('EAN')] !== null ? String(r[col('EAN')]) : null,
      prices: Object.fromEntries(days.map(d => [d.upd, num(r[d.i])]).filter(([, v]) => v !== null && v > 0)),
    })
  }
  return { fileName, days: days.map(d => d.upd).sort(), rows }
}

// files: wynik parseReport; channels: [{partner_id, retailer}]; partners: [{id}]
// skip: zbiór update_time już obecnych w historii (pomijamy, żeby nie dublować)
export function computeHistory(files, channels, partners, skip = new Set()) {
  const byRetailer = new Map(channels.map(c => [norm(c.retailer), c.partner_id]))
  const days = [...new Set(files.flatMap(f => f.days))].sort()
  const out = { days: [], skipped: [], stats: [], violations: [], matchedRows: 0, totalRows: 0, unmatched: new Map() }
  // ta sama oferta (produkt × sprzedawca × źródło × link) może być w dwóch plikach – łączymy dni
  const rowsByKey = new Map()
  for (const f of files) for (const r of f.rows) {
    out.totalRows++
    const k = `${r.product_id}|${r.retailer}|${r.source || ''}|${r.url || ''}`, prev = rowsByKey.get(k)
    if (!prev) rowsByKey.set(k, { ...r, prices: { ...r.prices } }); else Object.assign(prev.prices, r.prices)
  }
  const tracked = []
  for (const r of rowsByKey.values()) {
    const pid = byRetailer.get(norm(r.retailer))
    if (pid) { tracked.push({ ...r, partner_id: pid }); out.matchedRows++ } else out.unmatched.set(r.retailer, (out.unmatched.get(r.retailer) || 0) + 1)
  }
  for (const day of days) {
    if (skip.has(day)) { out.skipped.push(day); continue }
    out.days.push(day)
    const offers = tracked.filter(r => r.prices[day] !== undefined).map(r => {
      const rp = r.prices[day], cat = r.suggested
      return { ...r, retailer_price: rp, gap_pct: cat > 0 ? r2((rp - cat) / cat * 100) : null, below_min: cat > 0 ? rp < cat - 0.005 : false }
    })
    for (const p of partners) {
      const o = offers.filter(x => x.partner_id === p.id), gaps = o.map(x => x.gap_pct).filter(x => x !== null)
      if (!o.length) { out.stats.push({ update_time: day, partner_id: p.id, offers: 0, available_offers: 0, products: 0, avg_gap_pct: null, median_gap_pct: null, below_min_products: 0, missing_min_products: 0 }); continue }
      out.stats.push({ update_time: day, partner_id: p.id, offers: o.length, available_offers: o.length, products: new Set(o.map(x => x.product_id)).size,
        avg_gap_pct: gaps.length ? r2(gaps.reduce((s, x) => s + x, 0) / gaps.length) : null, median_gap_pct: r2(median(gaps)),
        below_min_products: new Set(o.filter(x => x.below_min).map(x => x.product_id)).size,
        missing_min_products: new Set(o.filter(x => !(x.suggested > 0)).map(x => x.product_id)).size })
    }
    for (const x of offers.filter(x => x.below_min)) out.violations.push({ partner_id: x.partner_id, product_id: x.product_id, article: x.article, ean: x.ean, url: x.url, retailer: x.retailer, catalogue_price: x.suggested, retailer_price: x.retailer_price, update_time: day })
  }
  return out
}
