// Import danych produktowych: szablon Studio (nagłówki po nazwach) albo bezpośrednio eksport kartoteki z ERP.
// Reguły przekształcenia ERP → szablon są te same co w zaakceptowanym pliku Szablon_danych_produktowych_Studio.xlsx.
// Produkty marki dedykowanej (z odbiorcą marki) są zawsze pomijane.
import { TEMPLATE_FIELDS } from './productDataSpec.js'

const T = v => (v === null || v === undefined ? '' : String(v)).trim()
const nz = v => { const t = T(v); return t === '' ? null : t }
export const toNum = v => { const s = T(v).replace(/\s/g, '').replace(',', '.'); return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null }
const NUMERIC = new Set(TEMPLATE_FIELDS.filter(f => f.type === 'liczba').map(f => f.name))

export function detectFormat(header) {
  const h = new Set(header.map(x => T(x)))
  if (h.has('SKU') && h.has('Kategoria') && h.has('Długość [cm]')) return 'szablon'
  if (h.has('Kod') && h.has('Kod paskowy') && h.has('Kategoria produktu')) return 'erp'
  return null
}

const isDedicated = r => !!nz(r['Odbiorca marki dedykowanej']) || !!nz(r['Właściciel/odbiorca marki']) && /dedykow/i.test(T(r['Rodzaj marki'])) || /dedykow/i.test(T(r['Rodzaj marki'])) || /dedykowan/i.test(T(r['Marka']))

// Gwarancja (reguły od Mateusza): brodziki standardowe i na nośniku EPS 7, zintegrowane 10, podpłytkowe 10, kompozytowe niskie 15;
// wanny 7, nośniki 31, odpływy liniowe 15, panele 7, pozostałe 2
export function warrantyRule(cat, typ, height, name) {
  cat = T(cat); typ = nz(typ); const nm = T(name).toLowerCase()
  if (cat === 'brodzik podpłytkowy' || typ === 'podpłytkowy') return 10
  if (cat === 'brodzik') {
    if (typ === 'standardowy' || typ === 'standardowy na nośniku') return 7
    if (typ === 'zintegrowany') return 10
    if ((typ === 'kompozytowy' || (!typ && nm.includes('kompozytowy'))) && T(height) === 'niskie') return 15
    return null
  }
  if (cat === 'wanna') return 7
  if (cat === 'nośnik') return 31
  if (cat === 'odpływ liniowy') return 15
  if (cat === 'panel') return 7
  return 2
}
function material(name, cat, znacznik) {
  const n = T(name).toLowerCase()
  if (n.includes('akryl')) return 'akryl'
  if (n.includes('kompozyt')) return 'kompozyt mineralny'
  if (cat === 'nośnik' || T(znacznik).toLowerCase().startsWith('nośniki')) return 'styropian (EPS)'
  return null
}
function producer(addr) {
  const a = T(addr)
  if (a.includes('Międzychód')) return ['Schedpol Sp. z o.o.', 'ul. Przemysłowa 2, 64-400 Międzychód-Bielsko, Polska', 'kontakt@safetybath.eu', 'Polska']
  const m = a.match(/Zakład produkcyjny:\s*(.+)/)
  if (m) { const adr = m[1].trim(); return [null, adr, null, adr.includes('Niemcy') ? 'Niemcy' : adr.includes('Czechy') ? 'Czechy' : adr.includes('Scotland') ? 'Wielka Brytania' : null] }
  return [null, null, null, null]
}
const n2 = v => toNum(v)

function erpRow(r) {
  const kod = T(r['Kod']), name = T(r['Nazwa'])
  const nm = name.startsWith(kod) ? name.slice(kod.length).trim() : name
  const sk = nm.match(/\[(.*?)\]/), nmClean = nm.replace(/\s*\[.*?\]/g, '').trim()
  const model = T(r['Model']), wm = model.match(/\((s\d)\)/)
  const ke = T(r['Kolor etykiety'])
  const gl = nz(r['Głębokość netto']), sp = T(gl).match(/spad do\s*(\d+(?:[.,]\d+)?)\s*%/)
  const prz = T(r['Nazwa2 Etykiety']).match(/Przepływ:\s*(\d+(?:[.,]\d+)?)/)
  const dek = T(r['Deklaracja'])
  const dnr = dek.match(/([A-Z]{2,5}\d+-\d+\/R\d+\/\d{4}|\d+\/\d{4} z dnia [\d.]+|PS\/\d+\/\d{4})/), norma = dek.match(/((?:PN-)?EN [\d\-:+A.]+)/)
  const p = producer(r['Adres producent'])
  return {
    'SKU': kod, 'EAN': nz(r['Kod paskowy']), 'Nazwa': nmClean, 'Numer katalogowy': nz(r['Numer Katalogowy na etykiecie']) || kod,
    'Typ towaru': nz(T(r['Typ Towaru']).toLowerCase()), 'Skład kompletu': sk ? sk[1].split('+').map(x => `${x.trim()}×1`).join('; ') : null,
    'Aktywny': ['TRUE', 'TAK', '1', 'PRAWDA'].includes(T(r['Aktywność']).toUpperCase()) ? 'TAK' : 'NIE', 'Rok wdrożenia': n2(r['Rok wdrożenia']),
    'Marka': nz(T(r['Marka']).replace(' dedykowany', '')), 'Kategoria': nz(r['Kategoria produktu']), 'Typ konstrukcji': nz(r['Typ technologii']),
    'Model': nz(model.replace(/\s*\(s\d\)/, '')), 'Wariant modelu': wm ? wm[1] : null,
    'Technologia': nz(r['Technologia']), 'Materiał': material(name, T(r['Kategoria produktu']), r['Znacznik']),
    'Antypoślizg': T(r['Antypoślizg']) === 'TAK' ? 'TAK' : null, 'Typ antypoślizgu': nz(r['Typ antypoślizgu']),
    'Kolor': nz(r['Kolor powierzchni']), 'Wykończenie': nz(r['Struktura powierzchni']),
    'Nazwa handlowa koloru': ke && !ke.startsWith('+') ? ke.replace('BIEGE', 'BEIGE') : null,
    'Dekor': ke.startsWith('+') ? ke.slice(1).toLowerCase().replace(/^\w/, c => c.toUpperCase()) : null,
    'Kształt': nz(r['Kształt']), 'Strona': null,
    'Długość [cm]': n2(r['Długość netto']), 'Szerokość [cm]': n2(r['Szerokość netto']), 'Wysokość [cm]': n2(r['Wysokość netto']),
    'Głębokość [cm]': n2(gl), 'Spadek [%]': sp ? n2(sp[1]) : null,
    'Sposób montażu': nz(r['Sposób montażu']), 'Klasa wysokości': nz(r['Wg wysokości']), 'Średnica odpływu [mm]': n2(r['Rozmiar odpływu']),
    'Przepływ [l/min]': prz ? n2(prz[1]) : null, 'Pojemność [l]': null, 'Zawartość zestawu': nz(r['Set']),
    'Waga netto [kg]': n2(r['waga netto (kg)']), 'Waga brutto [kg]': n2(r['waga brutto (kg)']), 'Objętość [m3]': n2(r['m3']),
    'Liczba paczek': n2(r['Liczba paczek']), 'Długość paczki [cm]': n2(r['Długość brutto']), 'Szerokość paczki [cm]': n2(r['Szerokość brutto']), 'Wysokość paczki [cm]': n2(r['Wysokość brutto']),
    'Ilość na palecie': n2(r['Ilość na palecie']), 'Dostępność magazynowa': nz(r['Oznaczenie dostępności magazynowej']),
    'Producent': p[0], 'Adres producenta': p[1], 'E-mail producenta': p[2], 'Kraj produkcji': p[3],
    'Deklaracja właściwości (nr)': dnr ? dnr[1] : null, 'Norma': norma ? norma[1].trim() : null,
    'Gwarancja [lata]': warrantyRule(r['Kategoria produktu'], r['Typ technologii'], r['Wg wysokości'], name), 'Link do instrukcji / karty technicznej': null,
  }
}
function templateRow(r) {
  const o = {}
  for (const f of TEMPLATE_FIELDS) { const v = r[f.name]; o[f.name] = NUMERIC.has(f.name) ? toNum(v) : nz(v) }
  // gwarancja pusta w szablonie → reguła
  if (o['Gwarancja [lata]'] === null) o['Gwarancja [lata]'] = warrantyRule(o['Kategoria'], o['Typ konstrukcji'], o['Klasa wysokości'], o['Nazwa'])
  return o
}

const eanOk = e => { if (!/^\d{13}$/.test(e)) return false; const d = [...e].map(Number); return (10 - (d.slice(0, 12).reduce((s, x, i) => s + x * (i % 2 ? 3 : 1), 0) % 10)) % 10 === d[12] }
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s

// Wiersze tabeli (pierwszy = nagłówki) → wiersze listy asortymentu Studio
export function rowsFromProductData(table, format) {
  const head = table[0].map(h => T(h))
  const objs = table.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]]))).filter(o => T(o[format === 'erp' ? 'Kod' : 'SKU']))
  const excluded = objs.filter(isDedicated).length
  const data = objs.filter(o => !isDedicated(o)).map(format === 'erp' ? erpRow : templateRow)
  const eanCount = {}; for (const d of data) if (d['EAN']) eanCount[d['EAN']] = (eanCount[d['EAN']] || 0) + 1
  const MAND = TEMPLATE_FIELDS.filter(f => f.req === 'Obowiązkowe').map(f => f.name)
  const rows = data.map(d => {
    const issues = []
    const miss = MAND.filter(k => d[k] === null || d[k] === '')
    if (miss.length) issues.push({ code: 'missing', msg: `Brak: ${miss.join(', ')}` })
    if (d['EAN'] && !eanOk(d['EAN'])) issues.push({ code: 'ean_checksum', msg: `EAN ${d['EAN']} – błędna suma kontrolna lub format` })
    if (d['EAN'] && eanCount[d['EAN']] > 1) issues.push({ code: 'ean_duplicate', msg: `EAN ${d['EAN']} ma ${eanCount[d['EAN']]} SKU` })
    const color = [d['Kolor'], d['Wykończenie']].filter(Boolean).join(' ')
    return { sku: d['SKU'], name: d['Nazwa'], ean: d['EAN'], brand: d['Marka'], category: cap(d['Kategoria']), category_path: [cap(d['Kategoria']), d['Typ konstrukcji']].filter(Boolean),
      model: d['Model'], color: color || null, shape: d['Kształt'], technology: d['Technologia'], source: format, bl_id: null, raw: null, issues, data: d }
  })
  return { rows, excluded, total: objs.length }
}
