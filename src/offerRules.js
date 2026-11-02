// Reguły pól oferty kanału: skąd wartość (PIM, pole produktu, atrybut, wymiar, treść, zdjęcie, rodzina, stała) + przekształcenia,
// słownik wartości PL → wartość kanału i sprawdzenie z listą dozwolonych wartości (pola „restrictiv” eMAG).
export const SOURCES = {
  tytul: 'tytuł zaakceptowany (Tytuły)', pole: 'pole produktu', pim: 'kolumna PIM', atrybut: 'atrybut produktu', wymiar: 'wymiar z produktu', tresc: 'Generator Treści',
  zdjecie: 'zdjęcie', rodzina: 'rodzina wariantów', stala: 'stała wartość', cena: 'cena z Baselinkera', stan: 'stan z Baselinkera', ai: 'dobór AI z listy', pomin: 'pomiń',
}
export const PRODUCT_FIELDS = { sku: 'SKU', ean: 'EAN', name: 'nazwa (PIM)', baselinker_product_id: 'ID produktu w Baselinkerze', color: 'kolor (PIM)', shape: 'kształt (PIM)', category: 'kategoria (PIM)', model: 'model (PIM)' }
export const ATTR_KEYS = ['wykonczenie', 'ksztalt', 'odplyw', 'powloka', 'w_zestawie', 'wymiar', 'wysokosc_cm', 'material']
export const PENDING = ['cena', 'stan', 'ai']   // uzupełniane w kolejnym kroku (n8n: Baselinker, AI)

const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/\s+/g, ' ').trim()
export const parseMap = text => String(text || '').split(/;|\n/).map(x => x.split('=')).filter(x => x.length >= 2 && x[0].trim()).map(([a, ...b]) => [norm(a), b.join('=').trim()])
// stabilny numer rodziny dla kanału (eMAG wymaga liczby): z identyfikatora rodziny w Studio
export const familyNumber = uuid => uuid ? parseInt(String(uuid).replace(/-/g, '').slice(0, 7), 16) : null
const images = p => { const a = Array.isArray(p?.images) ? p.images.map(x => typeof x === 'string' ? x : x?.url).filter(Boolean) : []; return a.length ? a : (p?.image_url ? [p.image_url] : []) }
const dims = s => (String(s || '').match(/\d+(?:[.,]\d+)?/g) || []).map(x => Number(x.replace(',', '.')))

function raw(rule, field, ctx) {
  const c = rule.config || {}, p = ctx.product || {}, pim = ctx.pim || {}
  switch (rule.source) {
    case 'pole': return ['color', 'shape', 'category', 'model'].includes(c.key) ? pim[c.key] : (p[c.key] ?? pim[c.key])
    case 'pim': return Array.isArray(pim.raw) && c.col ? pim.raw[Number(c.col) - 1] : ''
    case 'atrybut': return p.attributes?.[c.key] ?? ''
    case 'wymiar': {
      if (c.part === 'h') return p.attributes?.wysokosc_cm ?? dims(p.attributes?.wymiar || p.name)[2] ?? ''
      const d = dims(p.attributes?.wymiar || (String(p.name || '').match(/\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)?/) || [''])[0])
      return d[Number(c.part || 1) - 1] ?? ''
    }
    case 'tresc': { const d = ctx.desc; if (!d) return ''; return c.field === 'HTML' ? d.html || '' : (d.fields?.[c.field] ?? '') }
    case 'zdjecie': return images(p)[Number(c.index || 1) - 1] || ''
    case 'rodzina': return c.key === 'name' ? ctx.family?.model_name || '' : familyNumber(p.family_id)
    case 'stala': return c.value ?? ''
    default: return ''
  }
}

// Wartość pola dla produktu: { value, status, note }
export function computeField(rule, field, ctx) {
  if (!rule || rule.source === 'pomin') return { value: '', status: field.mandatory ? 'brak' : 'ok', note: field.mandatory ? 'pole obowiązkowe bez reguły' : null, skip: !field.mandatory }
  if (rule.source === 'tytul') {
    const t = ctx.title
    if (t?.status === 'zaakceptowany') return computeField({ source: 'stala', config: { value: t.title } }, field, ctx)
    return { value: '', status: field.mandatory ? 'brak' : 'ok', note: t ? 'tytuł czeka na akceptację (Tytuły)' : 'brak tytułu – wygeneruj go w zakładce Tytuły' }
  }
  if (PENDING.includes(rule.source)) return { value: '', status: 'brak', note: rule.source === 'ai' ? 'dobór AI – kolejny krok' : 'z Baselinkera – kolejny krok' }
  const c = rule.config || {}
  let v = raw(rule, field, ctx); v = v === null || v === undefined ? '' : String(v).trim()
  if (v === '' && c.fallback) v = String(c.fallback)
  // liczba: przelicznik jednostek i zaokrąglenie
  if (v !== '' && (c.factor || c.decimals !== undefined && c.decimals !== '')) {
    const n = Number(String(v).replace(',', '.').match(/-?\d+(?:\.\d+)?/)?.[0])
    if (Number.isFinite(n)) { const x = n * (Number(c.factor) || 1); const d = c.decimals === '' || c.decimals === undefined ? 2 : Number(c.decimals); v = String(Number(x.toFixed(d))) }
  }
  // słownik PL → kanał (dokładnie albo „zawiera”)
  if (v !== '' && c.map) {
    const m = parseMap(c.map), nv = norm(v)
    const hit = m.find(([k]) => k === nv) || (c.contains ? m.find(([k]) => nv.includes(k)) : null)
    if (hit) v = hit[1]; else if (c.contains && c.fallback) v = String(c.fallback)
  }
  if (v !== '' && c.suffix) v = `${v}${c.suffix}`
  if (field.code === 'description' && v) v = v.trim()
  if (v === '') return { value: '', status: field.mandatory ? 'brak' : 'ok', note: field.mandatory ? 'brak wartości' : null, skip: !field.mandatory }
  // zgodność z listą eMAG
  if (field.values?.length) {
    const hit = field.values.find(x => norm(x) === norm(v))
    if (hit) return { value: hit, status: 'ok', note: null }
    if (field.restrictive) return { value: v, status: 'do_sprawdzenia', note: 'wartość spoza listy eMAG – wybierz z listy' }
    return { value: v, status: 'ok', note: 'nowa wartość (lista tylko podpowiada)' }
  }
  return { value: v, status: 'ok', note: null }
}

// Domyślne reguły dla szablonu eMAG (wanny) – punkt wyjścia do zmiany w Studio
const name = code => String(code).replace(/:\s*\[\d+\]$/, '').trim().toLowerCase()
export function defaultRules(fields, s = {}) {
  const D = {
    part_number: ['pole', { key: 'sku' }], vendor_ext_id: ['pole', { key: 'baselinker_product_id' }], ean: ['pole', { key: 'ean' }],
    sale_price: ['cena', {}], original_sale_price: ['pomin', {}], vat_rate: ['stala', { value: s.vat ?? '0.23' }], status: ['stala', { value: '1' }],
    offer_currency: ['stala', { value: s.currency || 'HUF' }], stock: ['stan', {}], handling_time: ['stala', { value: '3' }], lead_time: ['pomin', {}],
    warranty: ['stala', { value: '24' }], offer_properties: ['pomin', {}], min_sale_price: ['cena', { kind: 'min' }], max_sale_price: ['cena', { kind: 'max' }],
    name: ['tytul', {}], brand: ['stala', { value: s.brand || 'Aedler' }], description: ['tresc', { field: 'HTML' }], url: ['pomin', {}],
    source_language: ['stala', { value: s.language || 'Maghiara (hu_HU)' }],
    main_image_url: ['zdjecie', { index: 1 }], other_image_url1: ['zdjecie', { index: 2 }], other_image_url2: ['zdjecie', { index: 3 }], other_image_url3: ['zdjecie', { index: 4 }], other_image_url4: ['zdjecie', { index: 5 }], other_image_url5: ['zdjecie', { index: 6 }],
    family_id: ['rodzina', { key: 'id' }], family_name: ['rodzina', { key: 'name' }], family_type: ['stala', { value: 'Lungime (hidden) - Latime (hidden) [1721]' }],
    culoare: ['pole', { key: 'color', map: 'biały=Alb;bialy=Alb;white=Alb;biały połysk=Alb lucios;white glossy=Alb lucios;biały mat=Alb mat;white matt=Alb mat;czarny=Negru;black=Negru;czarny mat=Negru mat;black matt=Negru mat;szary=Gri;grey=Gri;antracyt=Gri antracit;anthracite=Gri antracit;beżowy=Bej;beige=Bej;kremowy=Crem', contains: false }],
    tip: ['pole', { key: 'name', map: 'wolnostoj=Freestanding;freestanding=Freestanding;hydromasa=Cu hidromasaj', contains: true, fallback: 'Standard' }],
    material: ['atrybut', { key: 'material', map: 'akryl=Acril;akrylowa=Acril;akrylowy=Acril;kompozyt=Compozit mineral;konglomerat=Compozit mineral;kompozyt mineralny=Compozit mineral;stal=Otel;stal emaliowana=Otel', contains: true }],
    'continut pachet': ['pomin', {}],
    inaltime: ['wymiar', { part: 'h', suffix: ' cm' }], latime: ['wymiar', { part: 2, suffix: ' cm' }], lungime: ['wymiar', { part: 1, suffix: ' cm' }],
    greutate: ['pim', { col: '', suffix: ' Kg' }], 'caracteristici cheie': ['pomin', {}], volum: ['pim', { col: '', suffix: ' l' }],
    forma: ['atrybut', { key: 'ksztalt', map: 'prostokatny=Dreptunghi;prostokątny=Dreptunghi;kwadratowy=Patrat;owalny=Oval;okragly=Rotund;okrągły=Rotund;polokragly=Semirotund;półokrągły=Semirotund;asymetryczny=Asimetric;pieciokatny=Pentagon;pięciokątny=Pentagon' }],
    'pozitionare scurgere': ['ai', {}], 'pozitie montare': ['ai', {}],
    safety_information: ['stala', { value: s.safety || '' }], manufacturer_name: ['stala', { value: s.manufacturer_name || 'Schedpol Sp. z o.o.' }],
    manufacturer_address: ['stala', { value: s.manufacturer_address || '' }], manufacturer_email: ['stala', { value: s.manufacturer_email || '' }],
    responsible_name: ['stala', { value: s.manufacturer_name || 'Schedpol Sp. z o.o.' }], responsible_address: ['stala', { value: s.manufacturer_address || '' }], responsible_email: ['stala', { value: s.manufacturer_email || '' }],
  }
  return fields.filter(f => !['rejected', 'warning', 'info'].includes(f.code)).map(f => { const d = D[f.code] || D[name(f.code)] || ['pomin', {}]; return { code: f.code, source: d[0], config: d[1] } })
}
