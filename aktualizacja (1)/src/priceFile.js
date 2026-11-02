// Import cennika z pliku (XLSX/CSV): wykrycie wiersza nagłówków, podpowiedź mapowania kolumn, walidacja i przeliczenie netto → brutto
import * as XLSX from 'xlsx'

const RX = {
  code: /^(kod|sku|indeks|index|symbol|nr\.? ?kat|numer kat|kod produktu|art|mpn|product code|item code|part number)/i,
  ean: /(ean|kod kreskowy|gtin)/i,
  name: /^(nazwa|opis|produkt|towar|name|product name|description)/i,
  brand: /^(brand|marka)$/i,
  category: /^(kategoria|category|grupa|grupa towarowa)/i,
  promo: /(promo|promotion)/i,
  catalogue: /(katalog|cena kat|detal|sugerowan|cena brutto|cena netto|^cena|price|rrp|msrp)/i,
}
const low = v => String(v ?? '').trim()

export function readSheet(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }).filter(r => r && r.some(c => c !== null && low(c) !== ''))
  // wiersz nagłówków: pierwszy z co najmniej dwoma rozpoznanymi nazwami kolumn (w pierwszych 15 wierszach)
  let hi = grid.slice(0, 15).findIndex(r => r.filter(c => Object.values(RX).some(rx => rx.test(low(c)))).length >= 2)
  if (hi < 0) hi = 0
  const headers = (grid[hi] || []).map((h, i) => low(h) || `Kolumna ${i + 1}`)
  return { headers, rows: grid.slice(hi + 1), sheet: wb.SheetNames[0] }
}

export function guessMapping(headers) {
  const used = new Set(), pick = rx => { const i = headers.findIndex((h, k) => !used.has(k) && rx.test(h)); if (i >= 0) used.add(i); return i }
  // kolejność ma znaczenie: najpierw kolumny jednoznaczne, cena katalogowa na końcu (najszerszy wzorzec)
  const ean = pick(RX.ean), brand = pick(RX.brand), category = pick(RX.category), promo = pick(RX.promo), code = pick(RX.code), name = pick(RX.name), catalogue = pick(RX.catalogue)
  return { code, ean, name, catalogue, promo, brand, category }
}

// Brutto/netto z nazwy kolumny ceny (np. „Sale Price (gross)”, „Cena netto”); null = nie wiadomo
export const guessGross = h => /(gross|brutto)/i.test(h || '') ? true : /(\bnet\b|netto)/i.test(h || '') ? false : null

export const parsePrice = v => {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).replace(/zł|pln|\s/gi, '').replace(/[^\d,.-]/g, '')
  const norm = s.includes(',') && s.includes('.') ? (s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')) : s.replace(',', '.')
  const x = Number(norm); return Number.isFinite(x) && x > 0 ? x : null
}
const asText = v => v === null || v === undefined ? '' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(v)) : low(v)
const eanText = v => { if (v === null || v === undefined || v === '') return null; const s = typeof v === 'number' ? v.toFixed(0) : low(v).replace(/\s/g, ''); return /^\d{8,14}$/.test(s) ? s : (s || null) }
const r2 = x => Math.round(x * 100) / 100

// mapping: indeksy kolumn; opts: { gross, vat %, brand (nazwa marki – gdy plik ma kolumnę marki), minPrice (ceny ≤ progu to zaślepki) }
export function buildItems(rows, m, { gross = true, vat = 23, brand = null, minPrice = 1 } = {}) {
  const items = [], issues = { noKey: 0, noPrice: 0, duplicates: [], promoAbove: 0, badEan: 0, otherBrand: 0, otherBrands: new Map(), placeholder: [] }
  const seen = new Set(), k = (gross ? 1 : 1 + vat / 100)
  for (const r of rows) {
    const code = m.code >= 0 ? asText(r[m.code]) : '', ean = m.ean >= 0 ? eanText(r[m.ean]) : null
    const key = code || ean
    const cat = m.catalogue >= 0 ? parsePrice(r[m.catalogue]) : null, promo = m.promo >= 0 ? parsePrice(r[m.promo]) : null
    if (brand && m.brand >= 0) { const b = asText(r[m.brand]); if (b.toLowerCase() !== String(brand).toLowerCase()) { issues.otherBrand++; issues.otherBrands.set(b || '(puste)', (issues.otherBrands.get(b || '(puste)') || 0) + 1); continue } }
    if (!key) { if (cat) issues.noKey++; continue }
    if (!cat) { issues.noPrice++; continue }
    if (cat <= minPrice) { issues.placeholder.push(`${key}${m.name >= 0 && r[m.name] ? ` (${asText(r[m.name])})` : ''}`); continue }
    if (seen.has(key)) { issues.duplicates.push(key); continue }
    seen.add(key)
    if (ean && !/^\d{8,14}$/.test(ean)) issues.badEan++
    const item = { code: key, ean, category: m.category >= 0 ? asText(r[m.category]) || null : null, name: m.name >= 0 ? asText(r[m.name]) || null : null, catalogue: r2(cat * k), promo: promo ? r2(promo * k) : null }
    if (item.promo && item.promo >= item.catalogue) issues.promoAbove++
    items.push(item)
  }
  return { items, issues }
}
