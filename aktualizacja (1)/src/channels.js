// Operacje na kanałach wspólne dla Ustawień i Szablonów
import { supabase } from './supabase.js'
import { OUTPUT_PRESETS } from './render.js'

// Kopiuje aktywne szablony (domyślny + kategorie) z rynku źródłowego na docelowy; formatKey = klucz OUTPUT_PRESETS albo '' (jak w źródle)
export async function copyTemplates(source, target, formatKey = '') {
  const [{ data: tpls, error: e1 }, { data: existing }] = await Promise.all([
    supabase.from('templates').select('*').eq('channel_id', source.id).eq('status', 'aktywny'),
    supabase.from('templates').select('brand_id, category').eq('channel_id', target.id).eq('status', 'aktywny'),
  ])
  if (e1) throw e1
  const from = `${source.marketplace} ${source.language.toUpperCase()}`, to = `${target.marketplace} ${target.language.toUpperCase()}`
  const rows = (tpls || [])
    .filter(t => !(existing || []).some(x => x.brand_id === t.brand_id && (x.category || '') === (t.category || '')))
    .map(t => ({
      channel_id: target.id, brand_id: t.brand_id, category: t.category, sections: t.sections, version: 1, status: 'aktywny',
      styles: formatKey ? { ...(t.styles || {}), output: { ...OUTPUT_PRESETS[formatKey].output } } : t.styles,
      name: String(t.name).replace(from, to),
    }))
  if (rows.length) { const { error } = await supabase.from('templates').insert(rows); if (error) throw error }
  return { copied: rows.length, skipped: (tpls || []).length - rows.length, withCategories: rows.some(r => r.category) }
}

// Usuwa kanał razem z jego szablonami; blokuje, gdy kanał ma już opisy (wtedy tylko wyłączenie)
export async function deleteChannel(channel, { withLanguageData = false } = {}) {
  const { count } = await supabase.from('descriptions').select('id', { count: 'exact', head: true }).eq('channel_id', channel.id)
  if (count) return { blocked: count }
  const t = await supabase.from('templates').delete().eq('channel_id', channel.id); if (t.error) throw t.error
  const c = await supabase.from('channels').delete().eq('id', channel.id); if (c.error) throw c.error
  let langRemoved = 0
  if (withLanguageData) {
    const kb = await supabase.from('keyword_banks').delete().eq('language', channel.language).select('id'); if (kb.error) throw kb.error
    const qa = await supabase.from('qa_rules').delete().eq('language', channel.language).select('id'); if (qa.error) throw qa.error
    langRemoved = (kb.data || []).length + (qa.data || []).length
  }
  return { deleted: true, langRemoved }
}

// Nowy, czysty szablon (bez kopiowania z innego rynku): standardowy zestaw sekcji + wybrany format HTML
const BLANK_SECTIONS = [
  { key: 'HERO', type: 'hero', enabled: true, image_source: 'none', image_url: '' },
  { key: 'S1', type: 'content', enabled: true, topic: 'Materiał i konstrukcja', image_source: 'none', image_url: '', list: true, bold: true, accent: false },
  { key: 'S2', type: 'content', enabled: true, topic: 'Zalety w codziennym użytkowaniu', image_source: 'none', image_url: '', list: true, bold: true, accent: false },
  { key: 'S3', type: 'content', enabled: true, topic: 'Montaż', image_source: 'none', image_url: '', list: true, bold: false, accent: false },
  { key: 'S4', type: 'content', enabled: true, topic: 'Wymiary i warianty', image_source: 'none', image_url: '', list: true, bold: false, accent: false },
  { key: 'S5', type: 'content', enabled: true, topic: 'Gwarancja i jakość', image_source: 'none', image_url: '', list: false, bold: false, accent: true },
  { key: 'FAQ', type: 'faq', enabled: true, max_questions: 4 },
]
export async function createBlankTemplates(channel, brands, formatKey = 'standard', category = null) {
  const label = `${channel.marketplace} ${channel.language.toUpperCase()}`
  const { data: existing } = await supabase.from('templates').select('brand_id').eq('channel_id', channel.id).eq('status', 'aktywny').is('category', category)
  const rows = brands.filter(b => !(existing || []).some(x => x.brand_id === b.id)).map(b => ({
    channel_id: channel.id, brand_id: b.id, category, version: 1, status: 'aktywny',
    name: `${b.name} · ${label}${category ? ` · ${category}` : ''}`,
    sections: BLANK_SECTIONS, styles: { hero_tag: 'h2', output: { ...OUTPUT_PRESETS[formatKey || 'standard'].output } },
  }))
  if (!rows.length) return { created: 0, ids: [] }
  const { data, error } = await supabase.from('templates').insert(rows).select('id')
  if (error) throw error
  return { created: rows.length, ids: (data || []).map(x => x.id) }
}

// Marki, dla których warto tworzyć szablony: te, które mają produkty w aplikacji (albo wszystkie, jeśli żadna nie ma)
export async function activeBrands() {
  const [{ data: brands }, { data: fams }] = await Promise.all([supabase.from('brands').select('id, name').order('name'), supabase.from('product_families').select('brand_id')])
  const used = (brands || []).filter(b => (fams || []).some(f => f.brand_id === b.id))
  return used.length ? used : (brands || [])
}
