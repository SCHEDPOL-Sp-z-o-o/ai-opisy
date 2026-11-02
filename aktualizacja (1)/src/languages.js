// Języki obsługiwane w całym łańcuchu (aplikacja + prompty n8n + DataForSEO).
// Nowy język = wpis tutaj ORAZ w mapie LANG w węzłach „GEN: przygotuj” i „VAR: przygotuj” workflow n8n.
export const LANGS = {
  ro: { name: 'rumuński', country: 'Rumunia', location: 2642 },
  hu: { name: 'węgierski', country: 'Węgry', location: 2348 },
  bg: { name: 'bułgarski', country: 'Bułgaria', location: 2100 },
  de: { name: 'niemiecki', country: 'Niemcy', location: 2276 },
  pl: { name: 'polski', country: 'Polska', location: 2616 },
}
// Podstawowe zakazane sformułowania (superlatywy, rankingi) dla języków bez reguł wbudowanych w n8n
export const BASE_FORBIDDEN = {
  de: ['der beste', 'die beste', 'das beste', 'Nr. 1', 'Testsieger', 'unschlagbar', 'am billigsten'],
  pl: ['najlepszy', 'najlepsza', 'najlepsze', 'nr 1', 'najtańszy', 'bezkonkurencyjny'],
}

// Wzorce tytułu (instrukcja dla AI) – domyślny i podpowiedzi per marketplace; edytowalne w Ustawieniach kanału
export const DEFAULT_TITLE_PATTERN = '[typ produktu] [marka] [model], [wymiary] cm, [materiał], [kolor/wykończenie]'
export const TITLE_PRESETS = {
  emag: { pattern: '[typ produktu] [marka] [model], [wymiary] cm, [materiał], [kolor/wykończenie] – zgodnie ze standardem nazw eMAG', max: 200 },
  kaufland: { pattern: '[marka] [model] [typ produktu] [wymiary] cm, [kolor/wykończenie] – marka i nazwa produktu na początku, zwięźle, bez ciągu słów kluczowych', max: 80 },
}
export const titlePresetFor = mp => TITLE_PRESETS[String(mp || '').toLowerCase().replace(/[^a-z]/g, '')] || null

// Języki parametrów w Base (tłumaczenie wartości + nazwy parametrów ustawione w Base) i banków fraz.
// location = kod lokalizacji DataForSEO (Google Ads) dla rynku, z którego pobierane są frazy.
export const PARAM_LANGS = {
  ro: { name: 'rumuński', country: 'Rumunia', location: 2642 },
  en: { name: 'angielski', country: 'Wielka Brytania', location: 2826 },
  bg: { name: 'bułgarski', country: 'Bułgaria', location: 2100 },
  cs: { name: 'czeski', country: 'Czechy', location: 2203 },
  de: { name: 'niemiecki', country: 'Niemcy', location: 2276 },
  es: { name: 'hiszpański', country: 'Hiszpania', location: 2724 },
  et: { name: 'estoński', country: 'Estonia', location: 2233 },
  fr: { name: 'francuski', country: 'Francja', location: 2250 },
  hu: { name: 'węgierski', country: 'Węgry', location: 2348 },
  it: { name: 'włoski', country: 'Włochy', location: 2380 },
  lt: { name: 'litewski', country: 'Litwa', location: 2440 },
  lv: { name: 'łotewski', country: 'Łotwa', location: 2428 },
  sk: { name: 'słowacki', country: 'Słowacja', location: 2703 },
}
export const KEYWORD_LANGS = { pl: LANGS.pl, ...PARAM_LANGS }
