// Tytuły produktów: katalog składników, dane produktu do tytułu (po polsku), dopasowanie szablonu kanału do kategorii
export const COMPONENTS = [
  { key: 'typ', label: 'Typ produktu', hint: 'np. wanna wolnostojąca, brodzik' },
  { key: 'marka', label: 'Marka' },
  { key: 'model', label: 'Model / seria' },
  { key: 'wymiary', label: 'Wymiary', hint: 'np. 170x75 cm' },
  { key: 'kolor', label: 'Kolor' },
  { key: 'material', label: 'Materiał' },
  { key: 'strona', label: 'Strona (lewa/prawa)', hint: 'tylko produkty asymetryczne' },
  { key: 'cecha', label: 'Kluczowa cecha', hint: 'AI wybiera jedną z cech produktu' },
]
export const DEFAULT_COMPONENTS = COMPONENTS.map(c => ({ key: c.key, on: true, note: '' }))
export const LANG_LABEL = { pl: 'polski', en: 'angielski', de: 'niemiecki', fr: 'francuski', ro: 'rumuński', hu: 'węgierski', bg: 'bułgarski', cs: 'czeski', sk: 'słowacki', it: 'włoski', es: 'hiszpański' }

const dimsOf = s => { const m = String(s || '').match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?))?/i); return m ? m.slice(1).filter(Boolean).join('x') : '' }
const sideOf = s => { const t = String(s || '').toLowerCase(); return /\blew[aey]\b|\bleft\b|\(l\)|[-_ ]l$/.test(t) ? 'lewa' : /\bpraw[aey]\b|\bright\b|\(p\)|[-_ ]p$/.test(t) ? 'prawa' : '' }

// Dane produktu do tytułu – po polsku; AI zapisuje je w języku kanału
export function titleFacts({ product = {}, family = {}, pim = {}, brand = '' }) {
  const a = product.attributes || {}
  const wym = dimsOf(a.wymiar) || dimsOf(product.name) || dimsOf(pim.model)
  const h = a.wysokosc_cm && wym && wym.split('x').length < 3 ? `x${String(a.wysokosc_cm).replace(/\D+$/, '')}` : ''
  const cechy = [pim.technology, a.powloka, a.odplyw, a.wykonczenie, a.w_zestawie].filter(Boolean).map(String)
  return {
    typ: family.category || '', marka: brand || '', model: [family.model_name, family.series && family.series !== family.model_name ? family.series : ''].filter(Boolean).join(' '),
    wymiary: wym ? `${wym}${h} cm` : '', kolor: pim.color || a.kolor || '', material: a.material || '', strona: sideOf(product.name) || sideOf(product.sku),
    cechy, nazwa_pl: product.name || '',
  }
}

// Szablon dla produktu: kanał + najdłuższe dopasowanie kategorii rodziny (pusta kategoria = wszystkie)
export function templateFor(templates, channelId, category) {
  const cat = String(category || '').toLowerCase()
  return templates.filter(t => t.channel_id === channelId && (!t.category || cat.startsWith(t.category.toLowerCase()))).sort((a, b) => (b.category || '').length - (a.category || '').length)[0] || null
}

// Podgląd struktury tytułu z danych po polsku (bez AI) – do edycji szablonu
export const previewTitle = (tpl, facts) => tpl.components.filter(c => c.on).map(c => c.key === 'cecha' ? facts.cechy?.[0] : facts[c.key]).filter(Boolean).join(tpl.separator ?? ' ')
