// Import listy asortymentu z eksportu PIM (kolumny mapowane po POZYCJI – nagłówki w eksporcie są błędne).
// Jeśli układ eksportu się zmieni, popraw indeksy w PIM_COLUMNS (liczone od zera).
export const PIM_COLUMNS = { sku: 0, type: 1, locale: 2, path: 10, ean: 17, shape: 20, brand: 21, model: 22, name: 23, color: 31, series_label: 32, dims_label: 36, technology: 44, weight: 46 }

// --- kodowanie: UTF-8, Windows-1250, albo „podwójne” UTF-8 (tekst otwarty jako ISO-8859-2) ---
// Wariant stratny: znaki sterujące 0x80–0x9F zginęły po drodze → litery odtwarzamy z kontekstu.
let L2 = null
function latin2() {
  if (L2) return L2
  const dec = new TextDecoder('iso-8859-2'), toByte = new Map(), cont = new Set()
  for (let b = 0; b < 256; b++) { const ch = dec.decode(new Uint8Array([b])); toByte.set(ch, b); if (b >= 0x80 && b <= 0xBF) cont.add(ch) }
  return (L2 = { toByte, cont })
}
const LEADS = new Set(['Ă', 'Ä', 'Ĺ', 'Â'])
const HINT = /[ĂÄĹÂ]/
// rdzenie typowe dla asortymentu: „Ä”/„Ĺ” bez drugiego bajtu → właściwa litera
const STEMS = [['kÄtn', 'kątn'], ['krÄg', 'krąg'], ['piÄc', 'pięc'], ['miÄdzy', 'między'], ['ciÄci', 'cięci'], ['ciÄg', 'ciąg'], ['niÄt', 'nięt'], ['wÄsk', 'wąsk'],
  ['ujÄc', 'ując'], ['wiÄk', 'więk'], ['rÄcz', 'ręcz'], ['siÄ', 'się'], ['bÄd', 'będ'], ['pÄk', 'pęk'], ['dĹug', 'dług'], ['noĹnik', 'nośnik'], ['oĹci', 'ości'],
  ['Ĺcian', 'ścian'], ['Ĺciek', 'ściek'], ['Ĺwi', 'świ'], ['koĹc', 'końc'], ['ĹrodkĂł', 'środkó'], ['Ĺrod', 'środ'], ['moĹc', 'mość'], ['naroĹn', 'narożn']]
const isUpperCtx = (str, i) => { const near = (str.slice(Math.max(0, i - 3), i) + str.slice(i + 1, i + 4)).replace(/[^\p{L}]/gu, ''); return near.length > 0 && near === near.toUpperCase() }
function repairCell(str) {
  if (!HINT.test(str)) return { text: str, mode: 0 }
  const { toByte, cont } = latin2()
  // 1) próba bezstratna
  const bytes = []; for (const ch of str) { const b = toByte.get(ch); if (b === undefined) bytes.push(...new TextEncoder().encode(ch)); else bytes.push(b) }
  const exact = new TextDecoder('utf-8').decode(new Uint8Array(bytes))
  if (!exact.includes('\uFFFD')) return { text: exact, mode: exact !== str ? 1 : 0 }
  // 2) wariant stratny: pary „wiodący + kontynuacja” dekodujemy, samotne wiodące odtwarzamy z kontekstu
  let t = str
  // rdzenie mają tę samą długość co błędny zapis → wielkość liter przenosimy znak po znaku
  for (const [bad, good] of STEMS) t = t.replace(new RegExp(bad, 'gi'), m => {
    const allUp = /[A-Z]/.test(m) && m.replace(/[ĂÄĹ]/g, '') === m.replace(/[ĂÄĹ]/g, '').toUpperCase()
    return [...good].map((g, i) => (allUp || (m[i] && m[i] !== m[i].toLowerCase() && !'ĂÄĹ'.includes(m[i]))) ? g.toUpperCase() : g).join('')
  })
  let out = ''
  const chars = [...t]
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i], nx = chars[i + 1]
    if (LEADS.has(ch) && nx && cont.has(nx)) { out += new TextDecoder('utf-8').decode(new Uint8Array([toByte.get(ch), toByte.get(nx)])); i++; continue }
    if (ch === 'Ä' || ch === 'Ĺ' || ch === 'Ă') {
      const up = isUpperCtx(chars.join(''), i)
      const endOfWord = !nx || !/\p{L}/u.test(nx)
      const pick = ch === 'Ä' ? 'ą' : ch === 'Ă' ? 'ó' : (endOfWord ? 'ł' : 'ł')
      out += up ? pick.toUpperCase() : pick
      continue
    }
    if (ch === 'Â' && nx === '®') continue
    out += ch
  }
  return { text: out.replace(/\uFFFD/g, ''), mode: 2 }
}
export function repairTable(table) {
  let exact = 0, approx = 0
  const fixed = table.map(row => row.map(cell => {
    if (typeof cell !== 'string') return cell
    const r = repairCell(cell); if (r.mode === 1) exact++; if (r.mode === 2) approx++
    return r.text
  }))
  return { table: fixed, exact, approx }
}
export function fixMojibake(text) { const r = repairCell(text); return { text: r.text, fixed: r.mode > 0, lossy: r.mode === 2 } }
export function decodeBytes(buf) {
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^\uFEFF/, ''), cp1250: false } }
  catch { return { text: new TextDecoder('windows-1250').decode(buf), cp1250: true } }
}

const SHAPES = { kwadratowy: 'kwadratowy', prostokatny: 'prostokątny', polokragly: 'półokrągły', pieciokatny: 'pięciokątny', asymetryczny: 'asymetryczny' }
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s
const titleCase = s => String(s || '').toLowerCase().replace(/(^|\s)\p{L}/gu, m => m.toUpperCase())

// Czy wiersze wyglądają jak eksport PIM (tabela bez sensownych nagłówków)
export function isPim(rows) {
  const sample = rows.slice(1, 21).filter(r => r.length > 40)
  if (sample.length < 1) return false
  const ok = sample.filter(r => /PRODUCT/i.test(r[PIM_COLUMNS.type] || '') || /^[a-z]{2}_[A-Z]{2}$/.test(r[PIM_COLUMNS.locale] || '')).length
  return ok / sample.length > 0.7
}

export function rowsFromPim(rows) {
  const C = PIM_COLUMNS
  const out = [], problems = []
  const body = /PRODUCT/i.test(rows[0]?.[C.type] || '') ? rows : rows.slice(1)
  body.forEach((r, i) => {
    const sku = String(r[C.sku] || '').trim()
    if (!sku) return
    const ean = String(r[C.ean] || '').trim()
    if (ean && !/^\d{8,14}$/.test(ean)) problems.push(i)
    const path = String(r[C.path] || '').split('\\').map(s => s.trim()).filter(Boolean).map(cap)
    const rawName = String(r[C.name] || '').replace(/\s+/g, ' ').trim()
    const name = rawName.startsWith(sku) ? rawName.slice(sku.length).trim() : rawName
    const shapeKey = String(r[C.shape] || '').replace(/^ksztalt__/, '')
    out.push({
      sku, name, ean: ean || null, brand: String(r[C.brand] || '').trim() || null,
      model: String(r[C.model] || '').trim() || null,
      category: path[0] || null, category_path: path.length ? path : null,
      technology: String(r[C.technology] || '').trim() || null,
      color: r[C.color] ? titleCase(r[C.color].trim()) : null,
      shape: SHAPES[shapeKey] || (shapeKey || null), source: 'pim', bl_id: null, raw: r.map(x => String(x ?? '')),
      _raw: { name: rawName, series: String(r[C.series_label] || '').trim(), dims: String(r[C.dims_label] || '').trim(), weight: String(r[C.weight] || '').trim(), path: String(r[C.path] || '') },
    })
  })
  checkQuality(out)
  out.forEach(o => { delete o._raw })
  return { rows: out, badLayout: out.length > 0 && problems.length / out.length > 0.2 }
}

// ===== Kontrola jakości danych PIM =====
export const RULES = {
  shape_name: 'Kształt w nazwie ≠ pole kształtu',
  square_dims: 'Kwadrat z różnymi bokami',
  radius: 'Promień R przy kształcie bez łuku',
  variant_shape: 'Wariant kolorystyczny ma inny kształt niż wersja bazowa',
  color: 'Kolor w nazwie ≠ pole koloru',
  model: 'Model ≠ seria / nazwa w cudzysłowie',
  dims_label: 'Wymiar w nazwie ≠ wymiar etykiety',
  ean_checksum: 'Błędna suma kontrolna EAN',
  ean_duplicate: 'Ten sam EAN na kilku SKU',
  missing: 'Brak kluczowych pól',
  name_format: 'Formatowanie nazwy',
}
const SHAPE_WORDS = [['pięciokąt', 'pięciokątny'], ['półokrągł', 'półokrągły'], ['asymetryczn', 'asymetryczny'], ['kwadratow', 'kwadratowy'], ['prostokątn', 'prostokątny']]
const COLORS = ['black scale', 'cement scale', 'anthracite scale', 'grey scale', 'gray scale', 'white scale', 'beige scale', 'biege scale', 'smooth white']
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').trim()
const dimsOf = s => { const m = String(s || '').match(/(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)(?:\s*x\s*(\d+(?:[.,]\d+)?))?/i); return m ? m.slice(1).map(x => x == null ? null : Number(x.replace(',', '.'))) : null }
const eanOk = e => { if (!/^\d{13}$/.test(e)) return /^\d{8}$/.test(e); const d = e.split('').map(Number); const sum = d.slice(0, 12).reduce((a, x, i) => a + x * (i % 2 ? 3 : 1), 0); return (10 - sum % 10) % 10 === d[12] }
const NEEDS_SHAPE = /brodzik|wann|panel|nośnik|nosnik|obudow/i

export function checkQuality(rows) {
  const byEan = {}, bySku = Object.fromEntries(rows.map(r => [r.sku, r]))
  rows.forEach(r => { if (r.ean) (byEan[r.ean] ||= []).push(r.sku) })
  for (const r of rows) {
    const iss = [], add = (code, msg) => iss.push({ code, msg })
    const raw = r._raw || {}, name = raw.name || r.name || ''
    // kształt z nazwy
    // „do wanien półokrągłych” opisuje produkt docelowy, nie ten produkt – pomijamy frazy „do …” aż do wymiaru/przecinka
    const ownName = name.replace(/\bdo\s+[^\d,]*?(?=\d|,|$)/gi, ' ')
    const nameShape = SHAPE_WORDS.find(([w]) => ownName.toLowerCase().includes(w))?.[1]
    if (nameShape && r.shape && nameShape !== r.shape) add('shape_name', `w nazwie „${nameShape}”, w polu „${r.shape}”`)
    // kwadrat z różnymi bokami
    const nd = dimsOf(name)
    if (nd && nd[0] !== nd[1] && (nameShape === 'kwadratowy' || (!nameShape && r.shape === 'kwadratowy'))) add('square_dims', `„kwadratowy”, a wymiar ${nd[0]}x${nd[1]}`)
    // promień
    const rm = name.match(/\bR(\d{2})\b/)
    if (rm && r.shape && !['półokrągły', 'asymetryczny'].includes(r.shape)) add('radius', `R${rm[1]} w nazwie, kształt „${r.shape}”`)
    // wariant vs baza
    const base = r.sku.split('/')[0]
    if (base !== r.sku && bySku[base] && bySku[base].shape && r.shape && bySku[base].shape !== r.shape) add('variant_shape', `${base}: „${bySku[base].shape}”, ten wariant: „${r.shape}”`)
    // kolor
    const nameColor = COLORS.find(c => norm(name).includes(c))
    if (r.color && nameColor && norm(r.color) !== nameColor) add('color', `w nazwie „${nameColor.replace(/\b\w/g, m => m.toUpperCase())}”, w polu „${r.color}”`)
    if (r.color && /biege/i.test(r.color)) add('color', `literówka w kolorze: „${r.color}” (Beige?)`)
    // model
    const quoted = (name.match(/"\s*([^"]+?)\s*"/) || [])[1]
    const qModel = quoted ? quoted.replace(/\s+(SET|Plus)$/i, '').trim() : null
    const series = raw.series && raw.series.length <= 25 && !/accessor|für|for |passt/i.test(raw.series) ? raw.series : null
    if (r.model && qModel && !norm(qModel).startsWith(norm(r.model)) && !norm(r.model).startsWith(norm(qModel)) && !/de luxe/i.test(qModel)) add('model', `pole modelu „${r.model}”, w nazwie „${quoted}”`)
    else if (r.model && series && !norm(series).startsWith(norm(r.model))) add('model', `pole modelu „${r.model}”, seria „${series}”`)
    // wymiary nazwa vs etykieta
    const ld = dimsOf(raw.dims)
    if (nd && ld && nd[2] != null && ld[2] != null) {
      const same = (a, b) => Math.abs(a - b) < 0.01
      const sameWD = (same(nd[0], ld[0]) && same(nd[1], ld[1])) || (same(nd[0], ld[1]) && same(nd[1], ld[0]))
      if (!sameWD || !same(nd[2], ld[2])) add('dims_label', `nazwa ${nd.map(n => String(n).replace('.', ',')).join('x')}, etykieta ${raw.dims}`)
    }
    // EAN
    if (r.ean && !eanOk(r.ean)) add('ean_checksum', `EAN ${r.ean}`)
    if (r.ean && byEan[r.ean].length > 1) add('ean_duplicate', `ten sam EAN co ${byEan[r.ean].filter(x => x !== r.sku).join(', ')}`)
    // braki
    const miss = []
    if (!r.ean) miss.push('EAN')
    if (!r.shape && NEEDS_SHAPE.test(raw.path + ' ' + name)) miss.push('kształt')
    if (!r.model && /^\\?(brodziki|wanny)/i.test(raw.path)) miss.push('model')
    if (!(Number(String(raw.weight).replace(',', '.')) > 0)) miss.push('waga')
    if (miss.length) add('missing', `brak: ${miss.join(', ')}`)
    // formatowanie nazwy
    if (raw.name && raw.name.startsWith(r.sku) && /^\S/.test(raw.name.slice(r.sku.length))) add('name_format', 'brak spacji po SKU na początku nazwy')
    if (/\s{2,}/.test(raw.name || '')) add('name_format', 'podwójne spacje w nazwie')
    r.issues = iss
  }
  return rows
}
