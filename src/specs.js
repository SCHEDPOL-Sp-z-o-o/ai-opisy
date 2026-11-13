// Specyfikacja techniczna w opisie: wiersze z danych produktu (szablon danych / eksport ERP), zależne od kategorii.
// Liczby z jednostkami wstawia program (AI ich nie zmienia), etykiety i wartości tekstowe AI tłumaczy na język kanału.
const N = (label, key, unit) => ({ label, key, unit, kind: 'num' })
const X = (label, key, fmt) => ({ label, key, kind: 'txt', fmt })
const COLOR = X('Kolor', 'Kolor', d => [d['Kolor'], d['Wykończenie']].filter(Boolean).join(' '))
const WARRANTY = X('Gwarancja', 'Gwarancja [lata]', d => d['Gwarancja [lata]'] ? `${d['Gwarancja [lata]']} lat` : '')
const YESNO = key => X(key, key, d => d[key] === 'TAK' ? 'tak' : d[key] === 'NIE' ? 'nie' : '')
export const SPEC_PRESETS = {
  brodzik: [N('Długość', 'Długość [cm]', 'cm'), N('Szerokość', 'Szerokość [cm]', 'cm'), N('Wysokość', 'Wysokość [cm]', 'cm'), X('Materiał', 'Materiał'), X('Technologia', 'Technologia'),
    YESNO('Antypoślizg'), N('Średnica odpływu', 'Średnica odpływu [mm]', 'mm'), COLOR, WARRANTY],
  wanna: [N('Długość', 'Długość [cm]', 'cm'), N('Szerokość', 'Szerokość [cm]', 'cm'), N('Wysokość', 'Wysokość [cm]', 'cm'), N('Głębokość', 'Głębokość [cm]', 'cm'), N('Pojemność', 'Pojemność [l]', 'l'),
    X('Materiał', 'Materiał'), X('Kształt', 'Kształt'), X('Sposób montażu', 'Sposób montażu'), COLOR, WARRANTY],
  'odpływ liniowy': [N('Długość', 'Długość [cm]', 'cm'), N('Szerokość', 'Szerokość [cm]', 'cm'), N('Wysokość', 'Wysokość [cm]', 'cm'), N('Głębokość', 'Głębokość [cm]', 'cm'),
    N('Przepływ', 'Przepływ [l/min]', 'l/min'), N('Średnica odpływu', 'Średnica odpływu [mm]', 'mm'), X('Materiał', 'Materiał'), COLOR, WARRANTY],
  inne: [N('Długość', 'Długość [cm]', 'cm'), N('Szerokość', 'Szerokość [cm]', 'cm'), N('Wysokość', 'Wysokość [cm]', 'cm'), X('Materiał', 'Materiał'), COLOR, N('Waga', 'Waga netto [kg]', 'kg'), WARRANTY],
}
const presetFor = cat => { const c = String(cat || '').toLowerCase(); return c.startsWith('brodzik') ? SPEC_PRESETS.brodzik : c.startsWith('wanna') ? SPEC_PRESETS.wanna : c.startsWith('odpływ') ? SPEC_PRESETS['odpływ liniowy'] : SPEC_PRESETS.inne }

// data – pola szablonu danych produktu (assortment.data); category – kategoria z danych albo rodziny
export function specRowsFor(data, category) {
  if (!data) return []
  return presetFor(data['Kategoria'] || category).map(r => {
    if (r.kind === 'num') { const v = data[r.key]; return v === null || v === undefined || v === '' ? null : { label: r.label, num: Number(v), unit: r.unit, value: `${v} ${r.unit}` } }
    const v = r.fmt ? r.fmt(data) : data[r.key]; return v ? { label: r.label, value: String(v), num: null, unit: '' } : null
  }).filter(Boolean)
}

// Gotowy układ szablonu eMAG według mokapu (baner, cechy, zalety, 3× obraz–tekst, zestaw, specyfikacja, marka, FAQ)
export const EMAG_LAYOUT = {
  sections: [
    { key: 'HERO', type: 'hero', enabled: true, image_source: 'library', image_role: 'baner', image_url: '' },
    { key: 'CECHY', type: 'features', enabled: true, topic: 'Kluczowe cechy', image_source: 'none' },
    { key: 'ZALETY', type: 'benefits', enabled: true, topic: 'Zalety modelu', image_source: 'none' },
    { key: 'S1', type: 'content', layout: 'split', enabled: true, topic: 'Konstrukcja i materiał – dla kogo i do jakiej łazienki', list: false, bold: false, accent: false, image_source: 'library', image_role: 'opis produktu', image_url: '' },
    { key: 'S2', type: 'content', layout: 'split', enabled: true, topic: 'Najważniejsza cecha produktu (np. maskownica, antypoślizg, technologia)', list: false, bold: false, accent: false, image_source: 'library', image_role: 'cecha produktu 1', image_url: '' },
    { key: 'S3', type: 'content', layout: 'split', enabled: true, topic: 'Montaż i dopasowanie', list: false, bold: false, accent: false, image_source: 'library', image_role: 'cecha produktu 2', image_url: '' },
    { key: 'ZESTAW', type: 'kit', enabled: true, topic: 'Co jest w zestawie', image_source: 'library', image_role: 'przekrój', image_url: '' },
    { key: 'SPEC', type: 'specs', enabled: true, topic: 'Specyfikacja techniczna', image_source: 'product', image_role: 'rysunek techniczny', image_url: '' },
    { key: 'S4', type: 'content', layout: 'split', tint: true, enabled: true, topic: 'Marka – europejski producent wyposażenia stref prysznica', list: false, bold: true, accent: false, image_source: 'library', image_role: 'logo marki', image_url: '' },
    { key: 'FAQ', type: 'faq', enabled: true, max_questions: 6 },
  ],
  styles: { hero_align: 'center', faq_style: 'bordered', heading_color: '#1E2328', accent_color: '#4E6476', text_color: '#3A4149', h1_size: 26, h2_size: 21, max_width: 960, font_size: 15, line_height: 1.6, hero_tag: 'h1' },
}
