// Poziomy: marka → kategoria → technologia → seria (rodzina, np. Antis) → model (seria w kolorze) → wariant (SKU)
const eq = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

export const baseModel = name => String(name || '').split(' + ')[0].trim()

// rodzina faktu albo jej zestaw (fakty „Antis” obowiązują też „Antis + nośnik”)
function familyMatch(fact, fam, families) {
  if (!fact.family_id) return false
  if (fact.family_id === fam.id) return true
  const src = families.find(f => f.id === fact.family_id)
  return !!src && src.brand_id === fam.brand_id && eq(src.model_name, baseModel(fam.model_name)) && fam.model_name !== src.model_name
}

// kategoria faktu „brodziki” obejmuje „brodziki standard”, „brodziki kompozytowe”…; „brodziki kompozytowe” – tylko siebie
export const categoryMatch = (famCat, factCat) => { const a = String(famCat || '').trim().toLowerCase(), b = String(factCat || '').trim().toLowerCase(); return !!b && (a === b || a.startsWith(b + ' ')) }

// Czy fakt dotyczy produktu (product = konkretny SKU; bez niego tylko poziomy ogólne)
export function applies(fact, fam, families = [], product = null) {
  if (fact.brand_id && fact.brand_id !== fam.brand_id) return false
  switch (fact.level) {
    case 'marka': return !!fact.brand_id
    case 'kategoria': return categoryMatch(fam.category, fact.category)
    // technologia w kontekście kategorii: „Stabildense · Wanny” ≠ „Stabildense · Brodziki”; bez kategorii = wszystkie kategorie
    case 'technologia': return (fam.technologies || []).some(t => eq(t, fact.technology)) && (!fact.category || categoryMatch(fam.category, fact.category))
    case 'seria': return familyMatch(fact, fam, families)
    case 'model': return familyMatch(fact, fam, families) && !!product && eq(product.attributes?.wykonczenie, fact.color)
    case 'wariant': return !!product && fact.product_id === product.id
    default: return false
  }
}

// Czy fakt w ogóle dotyczy rodziny (do list i liczników, bez wskazywania SKU)
export function touchesFamily(fact, fam, families = []) {
  if (['model', 'wariant'].includes(fact.level)) return (!fact.brand_id || fact.brand_id === fam.brand_id) && familyMatch(fact, fam, families)
  return applies(fact, fam, families)
}

export const LEVEL_LABEL = { marka: 'Marka', kategoria: 'Kategoria', technologia: 'Technologia', seria: 'Seria', model: 'Model (kolor)', wariant: 'Wariant (SKU)' }
export const LEVEL_HINT = { marka: 'cała marka', kategoria: 'grupa produktów, np. brodziki, wanny', technologia: 'technologia w danej kategorii', seria: 'rodzina produktów, np. Antis', model: 'seria w konkretnym kolorze', wariant: 'konkretne SKU' }

export const categoryLabel = key => String(key || '').replace(/(^|\s)\p{L}/u, m => m.toUpperCase())

export function scopeLabel(fact, brands, families, products = [], categories = []) {
  const brand = brands.find(b => b.id === fact.brand_id)?.name
  const fam = families.find(f => f.id === fact.family_id)?.model_name
  const sku = products.find(p => p.id === fact.product_id)?.sku
  const catName = categories.find(c => c.key === fact.category)?.label || categoryLabel(fact.category)
  const what = { marka: brand, kategoria: catName, technologia: fact.technology ? `${fact.technology} · ${fact.category ? catName : 'wszystkie kategorie'}` : null, seria: fam, model: fam && fact.color ? `${fam} · ${fact.color}` : fam, wariant: sku || fam }[fact.level]
  return `${LEVEL_LABEL[fact.level] || fact.level}: ${what || '—'}${brand && fact.level !== 'marka' ? ` · ${brand}` : ''}`
}

// Technologie rodziny wg mapy kategoria × technologia (Ustawienia → Mapa technologii).
// „wg_pim”: tylko gdy seria/technologia z PIM zawiera klucz technologii (match_series); „wszystkie”: każda seria w kategorii.
// Do technologii zawsze dochodzi jej nadrzędna (fakty o Stabildense trafiają też do jej odmian).
// Marka bez mapy – dotychczasowe reguły z kb_technologies (match_category / match_series).
export function techFor(family, techs, map = null) {
  const out = new Set()
  const addWithParent = t => { out.add(t.name); const p = techs.find(x => x.id === t.parent_id); if (p) out.add(p.name) }
  const brandMap = (map || []).filter(m => m.brand_id === family.brand_id)
  const ser = String(family.series || '').toLowerCase()
  if (brandMap.length) {
    for (const m of brandMap) {
      if (!categoryMatch(family.category, m.category)) continue
      const t = techs.find(x => x.id === m.technology_id); if (!t) continue
      if (m.mode === 'wszystkie' || !t.match_series || ser.includes(t.match_series.toLowerCase())) addWithParent(t)
    }
    return [...out].sort()
  }
  const cat = String(family.category || '').toLowerCase()
  for (const t of techs.filter(t => !t.brand_id || t.brand_id === family.brand_id)) {
    const hit = (t.match_category && cat.startsWith(t.match_category.toLowerCase())) || (t.match_series && ser.includes(t.match_series.toLowerCase()))
    if (hit) addWithParent(t)
  }
  return [...out].sort()
}

// Plan zmian: dla każdej rodziny technologie ze słownika wg mapy; technologie spoza słownika (dopisane ręcznie) zostają
export function techPlan(families, techs, map) {
  const dict = new Set(techs.map(t => t.name.toLowerCase()))
  return families.map(f => {
    const cur = f.technologies || []
    const want = techFor(f, techs, map)
    const keep = cur.filter(t => !dict.has(t.toLowerCase()))
    const next = [...new Set([...keep, ...want])].sort()
    return { family: f, cur, next, add: next.filter(t => !cur.includes(t)), remove: cur.filter(t => !next.includes(t)) }
  }).filter(x => x.add.length || x.remove.length)
}

// Import: tylko dopisuje brakujące technologie (nie usuwa)
export async function autoAssignTechnologies(supabase, familyIds = null) {
  const [{ data: techs }, mq, fq] = await Promise.all([
    supabase.from('kb_technologies').select('*'),
    supabase.from('kb_category_tech').select('*'),
    (familyIds ? supabase.from('product_families').select('id, brand_id, category, series, technologies').in('id', familyIds) : supabase.from('product_families').select('id, brand_id, category, series, technologies')),
  ])
  if (!techs?.length) return 0
  let changed = 0
  for (const f of fq.data || []) {
    const add = techFor(f, techs, mq.error ? null : mq.data).filter(t => !(f.technologies || []).includes(t))
    if (!add.length) continue
    const { error } = await supabase.from('product_families').update({ technologies: [...(f.technologies || []), ...add].sort() }).eq('id', f.id)
    if (!error) changed++
  }
  return changed
}
