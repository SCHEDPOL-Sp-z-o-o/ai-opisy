// Wyliczanie wartości parametrów Base z wiersza PIM (raw) i atrybutów produktu w aplikacji
const PL_WORDS = {
  kwadratowy: 'kwadratowy', prostokatny: 'prostokątny', polokragly: 'półokrągły', pieciokatny: 'pięciokątny', asymetryczny: 'asymetryczny',
  gladki: 'gładki', strukturalny: 'strukturalny', polysk: 'połysk', brodzik: 'brodzik', wanna: 'wanna', nosnik: 'nośnik',
  odplyw_liniowy: 'odpływ liniowy', obudowa: 'obudowa', panel: 'panel', maskownica: 'maskownica',
  niskie: 'niskie', srednie: 'średnie', wysokie: 'wysokie', z_panelem: 'z panelem', do_zabudowy: 'do zabudowy',
}
const clean = v => String(v ?? '').replace(/\s+/g, ' ').trim()
export function parseValueMap(text) {
  return Object.fromEntries(String(text || '').split(/;|\n/).map(x => x.split('=')).filter(x => x.length >= 2 && x[0].trim())
    .map(([a, ...b]) => [a.trim().toLowerCase(), b.join('=').trim()]))
}
function transform(v, m) {
  let s = clean(v)
  if (!s) return ''
  if (m.transform === 'etykieta') { s = s.includes('__') ? s.split('__').pop() : s; s = PL_WORDS[s.toLowerCase()] || s.replace(/_/g, ' ') }
  if (m.transform === 'liczba' || m.transform === 'liczba_pl') {
    const n = s.replace(',', '.').match(/-?\d+(?:\.\d+)?/)
    if (!n) return ''
    s = String(Number(n[0])); if (m.transform === 'liczba_pl') s = s.replace('.', ',')
  }
  const map = parseValueMap(m.value_map)
  if (map[s.toLowerCase()] !== undefined) s = map[s.toLowerCase()]
  return s ? s + (m.suffix || '') : ''
}
const col = (raw, n) => (Array.isArray(raw) && n >= 1) ? raw[n - 1] : ''

// row: { sku, name, raw }, product: { attributes } | null → { [nazwa]: wartość } (puste pomijane) + źródło każdej wartości
export const categoryKey = row => row?.category_path?.length ? row.category_path.join(' ').toLowerCase() : (row?.category ? String(row.category).toLowerCase() : '')

export function computeParams(mapping, row, product, ctx = {}) {
  const values = {}, origin = {}
  const cat = categoryKey(row)
  for (const m of mapping) {
    if (m.source === 'pomin') continue
    // parametr tylko dla wybranych kategorii (np. antypoślizg: brodziki, wanny)
    const only = String(m.only_categories || '').split(/[,;]/).map(x => x.trim().toLowerCase()).filter(Boolean)
    if (only.length && !only.some(c => cat.startsWith(c))) continue
    let v = '', from = ''
    if (m.source === 'pim') { v = col(row.raw, m.pim_col); from = `PIM kol. ${m.pim_col}` }
    else if (m.source === 'atrybut') { v = product?.attributes?.[m.attr_key] || ''; from = `atrybut ${m.attr_key}` }
    else if (m.source === 'nazwa') {
      try { const hit = String(row.raw ? col(row.raw, 24) || row.name : row.name).match(new RegExp(m.regex, 'i')); v = hit ? (hit[1] ?? hit[0]) : '' } catch { v = '' }
      from = 'nazwa'
    }
    else if (m.source === 'stala') { v = m.const_value || ''; from = 'stała' }
    else if (m.source === 'frazy') {
      const bank = (ctx.banks || {})[`${categoryKey(row)}|${m.kw_lang || 'pl'}`]
      if (bank) {
        const ex = new Set((bank.excluded || []).map(x => String(x).toLowerCase()))
        v = (bank.keywords || []).filter(k => k && k.kw && !ex.has(String(k.kw).toLowerCase())).sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, m.kw_count || 10).map(k => k.kw).join(', ')
        from = `bank fraz „${categoryKey(row)}” (${(m.kw_lang || 'pl').toUpperCase()})`
      }
    }
    if (!clean(v) && m.fallback_col) {
      v = col(row.raw, m.fallback_col); from = `PIM kol. ${m.fallback_col} (zapas)`
      // PIM często trzyma etykiety wersalikami („BLACK SCALE”) – ujednolicamy do zapisu „Black Scale”
      if (/[A-ZĄĆĘŁŃÓŚŹŻ]/.test(v) && v === v.toUpperCase()) v = v.toLowerCase().replace(/(^|\s)\p{L}/gu, x => x.toUpperCase())
    }
    let out = m.source === 'frazy' ? clean(v) : transform(v, m)
    if (!out && m.default_value) { out = m.default_value; from = 'wartość domyślna' }
    if (out) { values[m.name] = out; origin[m.name] = from }
  }
  return { values, origin }
}
