// Tytuły produktów: katalog składników, dane produktu do tytułu (po polsku), dopasowanie szablonu kanału do kategorii.
// Tytuł składa program w kolejności z szablonu (AI podaje tylko treść składników) – kolejność i limit znaków są gwarantowane.
import { applies } from './knowledge.js'

export const COMPONENTS = [
  { key: 'typ', label: 'Typ produktu', hint: 'sam rodzaj produktu, np. brodzik, wanna – bez materiału i technologii' },
  { key: 'marka', label: 'Marka' },
  { key: 'model', label: 'Model / seria' },
  { key: 'wymiary', label: 'Wymiary', hint: 'np. 90x120 cm' },
  { key: 'kolor', label: 'Kolor' },
  { key: 'material', label: 'Materiał' },
  { key: 'technologia', label: 'Technologia', hint: 'nazwa technologii, np. STABILDENSE®', off: true },
  { key: 'strona', label: 'Strona (lewa/prawa)', hint: 'tylko produkty asymetryczne' },
  { key: 'cecha', label: 'Kluczowa cecha', hint: 'korzyść dla klienta z Księgi wiedzy, np. wyjątkowo wytrzymały' },
]
export const DEFAULT_COMPONENTS = COMPONENTS.map(c => ({ key: c.key, on: !c.off, note: '' }))
// szablon zapisany przed dodaniem składnika – uzupełnij brakujące (wyłączone) na końcu
export const withAllComponents = comps => [...comps, ...COMPONENTS.filter(c => !comps.some(x => x.key === c.key)).map(c => ({ key: c.key, on: false, note: '' }))]
export const LANG_LABEL = { pl: 'polski', en: 'angielski', de: 'niemiecki', fr: 'francuski', ro: 'rumuński', hu: 'węgierski', bg: 'bułgarski', cs: 'czeski', sk: 'słowacki', it: 'włoski', es: 'hiszpański' }

const dimsOf = s => { const m = String(s || '').match(/(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)(?:\s*[x×]\s*(\d+(?:[.,]\d+)?))?/i); return m ? m.slice(1).filter(Boolean).join('x') : '' }
const sideOf = s => { const t = String(s || '').toLowerCase(); return /\blew[aey]\b|\bleft\b|\(l\)|[-_ ]l$/.test(t) ? 'lewa' : /\bpraw[aey]\b|\bright\b|\(p\)|[-_ ]p$/.test(t) ? 'prawa' : '' }
const LEVEL_PRIO = { technologia: 0, wariant: 1, model: 2, seria: 3, kategoria: 4, marka: 5 }

// Dane produktu do tytułu – po polsku; AI zapisuje składniki w języku kanału
export function titleFacts({ product = {}, family = {}, families = [], pim = {}, brand = '', kb = [] }) {
  const a = product.attributes || {}
  const wym = dimsOf(a.wymiar) || dimsOf(product.name) || dimsOf(pim.model)
  const h = a.wysokosc_cm && wym && wym.split('x').length < 3 ? `x${String(a.wysokosc_cm).replace(/[^\d.,]+$/, '')}` : ''
  const technologie = [...new Set([...(family.technologies || []), pim.technology].filter(Boolean).map(String))]
  // źródła kluczowej cechy: zatwierdzone fakty Księgi wiedzy o tym produkcie (najpierw technologia, potem seria, kategoria, marka)
  const fakty = kb.filter(f => applies(f, family, families, product)).sort((x, y) => (LEVEL_PRIO[x.level] ?? 9) - (LEVEL_PRIO[y.level] ?? 9)).slice(0, 8).map(f => String(f.content).slice(0, 280))
  return {
    kategoria: family.category || '', nazwa_pl: product.name || '', marka: brand || '', model: family.model_name || '',
    wymiary: wym ? `${wym}${h} cm` : '', kolor: pim.color || a.kolor || '', material: a.material || '', technologia: technologie.join(', '),
    strona: sideOf(product.name) || sideOf(product.sku), fakty_o_produkcie: fakty,
    inne_cechy: [a.powloka, a.wykonczenie, a.odplyw, a.w_zestawie].filter(Boolean).map(String),
  }
}

// Szablon dla produktu: kanał + najdłuższe dopasowanie kategorii rodziny (pusta kategoria = wszystkie)
export function templateFor(templates, channelId, category) {
  const cat = String(category || '').toLowerCase()
  return templates.filter(t => t.channel_id === channelId && (!t.category || cat.startsWith(t.category.toLowerCase()))).sort((a, b) => (b.category || '').length - (a.category || '').length)[0] || null
}

// Podgląd struktury tytułu z danych po polsku (bez AI) – do edycji szablonu
const PREVIEW = { typ: f => String(f.kategoria || '').split(' ')[0], cecha: () => '[korzyść z Księgi wiedzy]' }
export const previewTitle = (tpl, facts) => tpl.components.filter(c => c.on).map(c => (PREVIEW[c.key] ? PREVIEW[c.key](facts) : facts[c.key])).filter(Boolean).join(tpl.separator ?? ' ')
