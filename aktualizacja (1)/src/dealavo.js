// Dealavo – dopasowanie nazw sprzedawców do partnerów i liczenie wskaźników.
// Ta sama logika liczenia trafi do n8n (węzeł „DEALAVO: wskaźniki”), więc ekran i pobieranie liczą identycznie.

export const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, ' ').trim()
const compact = s => norm(s).replace(/ /g, '')

// Podpowiedzi: nazwa sprzedawcy z Dealavo pasuje do słowa kluczowego partnera.
// Krótkie słowa (≤ 4 znaki, np. „hab”) muszą być osobnym wyrazem – inaczej „hab” pasowałoby do „habitat”.
export function matchesPartner(retailerName, keywords = []) {
  const n = norm(retailerName), c = n.replace(/ /g, ''), words = n.split(' ')
  return keywords.some(k => {
    const kc = compact(k); if (!kc) return false
    if (kc.length <= 4) return words.includes(kc) || words.some(w => w === kc + 'pl')
    return c.includes(kc)
  })
}
export const suggestions = (partner, retailers, taken = new Set()) =>
  retailers.filter(r => !partner.aliases?.includes(r.name) && !taken.has(r.name) && matchesPartner(r.name, partner.keywords)).sort((a, b) => (b.offers || 0) - (a.offers || 0))

// Kolumny raportu Dealavo (nazwy z dokumentacji; pierwsza znaleziona wygrywa)
export const COLS = {
  retailer: ['Retailer'], retailer_price: ['Retailer price'], availability: ['Availability'], price: ['Suggested price', 'Catalogue Price', 'Price'],
  min_price: ['Minimum Price', 'Minimum price'], product_id: ['Id', 'ID'], article: ['Article'], ean: ['EAN'], source: ['Source'], url: ['Url', 'URL'],
}
const pick = (row, names) => { for (const n of names) if (row[n] !== undefined && row[n] !== null && row[n] !== '') return row[n]; return null }
const num = v => { if (v === null || v === undefined || v === '') return null; const x = Number(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : null }
export const isAvailable = v => {
  if (v === true || v === 1) return true
  if (v === false || v === 0 || v === null || v === undefined) return false
  const s = norm(v)
  if (/niedostep|unavailable|not available|out of stock|brak|wyprzedan|false/.test(s)) return false
  return /dostep|available|in stock|w magazynie|na stanie|true|^tak$|^1$/.test(s)
}
const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const r2 = x => x === null ? null : Math.round(x * 100) / 100

// rows: wiersze raportu Dealavo; partners: [{id, aliases}]. Zwraca oferty śledzonych partnerów, wskaźniki i listę sprzedawców.
export function aggregate(rows, partners, updateTime) {
  const byAlias = new Map()
  for (const p of partners) for (const a of p.aliases || []) byAlias.set(norm(a), p.id)
  const retailers = new Map(), offers = []
  for (const row of rows) {
    const retailer = String(pick(row, COLS.retailer) || '').trim(); if (!retailer) continue
    const source = pick(row, COLS.source)
    const r = retailers.get(retailer) || { name: retailer, source: source || null, offers: 0, update_time: updateTime }
    r.offers++; retailers.set(retailer, r)
    const pid = byAlias.get(norm(retailer)); if (!pid) continue
    const price = num(pick(row, COLS.price)), rp = num(pick(row, COLS.retailer_price)), min = num(pick(row, COLS.min_price))
    const available = isAvailable(pick(row, COLS.availability))
    offers.push({
      update_time: updateTime, partner_id: pid, retailer, product_id: String(pick(row, COLS.product_id) ?? pick(row, COLS.ean) ?? ''), article: pick(row, COLS.article), ean: pick(row, COLS.ean) ? String(pick(row, COLS.ean)) : null,
      source, url: pick(row, COLS.url), price, retailer_price: rp, min_price: min, available,
      gap_pct: available && price > 0 && rp > 0 ? r2((rp - price) / price * 100) : null,
      below_min: available && min > 0 && rp > 0 ? rp < min - 0.005 : false,
    })
  }
  const stats = partners.map(p => {
    const o = offers.filter(x => x.partner_id === p.id), av = o.filter(x => x.available), gaps = av.map(x => x.gap_pct).filter(x => x !== null)
    const prod = new Set(av.map(x => x.product_id))
    return {
      update_time: updateTime, partner_id: p.id, offers: o.length, available_offers: av.length, products: prod.size,
      avg_gap_pct: gaps.length ? r2(gaps.reduce((s, x) => s + x, 0) / gaps.length) : null, median_gap_pct: r2(median(gaps)),
      below_min_products: new Set(av.filter(x => x.below_min).map(x => x.product_id)).size,
      missing_min_products: new Set(av.filter(x => !(x.min_price > 0)).map(x => x.product_id)).size,
    }
  })
  return { offers, stats, retailers: [...retailers.values()] }
}

// Wskaźniki z listy ofert (te same wzory co w n8n) – do podziału na kanały w szczegółach podmiotu
export function summarize(offers) {
  const av = offers.filter(x => x.available), gaps = av.map(x => x.gap_pct).filter(x => x !== null && x !== undefined).map(Number)
  return {
    available_offers: av.length, products: new Set(av.map(x => x.product_id)).size,
    avg_gap_pct: gaps.length ? r2(gaps.reduce((s, x) => s + x, 0) / gaps.length) : null, median_gap_pct: r2(median(gaps)),
    below_min_products: new Set(av.filter(x => x.below_min).map(x => x.product_id)).size,
    missing_min_products: new Set(av.filter(x => !(x.min_price > 0)).map(x => x.product_id)).size,
  }
}

// Domyślna etykieta kanału z nazwy sprzedawcy w Dealavo, np. „sklep_xyz (allegro.pl)” → „Allegro PL”
const DOMAINS = { 'allegro.pl': 'Allegro PL', 'allegro.cz': 'Allegro CZ', 'allegro.sk': 'Allegro SK', 'castorama.pl': 'Castorama', 'leroymerlin.pl': 'Leroy Merlin', 'obi.pl': 'OBI', 'empik.com': 'Empik', 'kaufland.pl': 'Kaufland PL', 'erli.pl': 'Erli', 'amazon.pl': 'Amazon PL', 'mediaexpert.pl': 'Media Expert', 'ceneo.pl': 'Ceneo' }
export function defaultLabel(retailer, source) {
  const m = String(retailer || '').match(/\(([^)]+)\)\s*$/)
  if (m) { const dom = m[1].toLowerCase().trim(); return DOMAINS[dom] || dom }
  if (source && !/^sklep$/i.test(source)) return String(source)
  return 'Sklep internetowy'
}
