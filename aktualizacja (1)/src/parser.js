// Rozpoznawanie atrybutów wariantów z nazwy, SKU i ścieżki zdjęcia.
// Ta sama logika dla importu z Baselinkera i z pliku CSV.

const NAME_RX = /^(\S+)\s+Brodzik\s+(\S+)\s+(\S+)\s+(.+?)\s+(\d+)\s*x\s*(\d+)\s*x\s*(\d+(?:[.,]\d+)?)(?:\s+R(\d+))?(?:\s+.*)?$/i
const IMG_SHAPES = { kwadrat: 'kwadratowy', prostokat: 'prostokątny', polokragly: 'półokrągły', pieciokat: 'pięciokątny', asymetryczny: 'asymetryczny' }
const IMG_COLORS = { smooth_white: 'smooth white', black_scale: 'black scale', white_scale: 'white scale', cement_scale: 'cement scale', grey_scale: 'grey scale', anthracite_scale: 'anthracite scale', cashmere_scale: 'cashmere scale' }
const DRAWING = { kwadratowy: 'kwadrat', 'prostokątny': 'prostokąt', 'półokrągły': 'półokrągły', 'pięciokątny': 'pięciokąt', asymetryczny: 'asymetryczny' }
const MATERIALS = { akrylowy: 'akryl', kompozytowy: 'kompozyt' }

export const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim()

function ruleFor(rules, brandId, attribute, sku) {
  const [base, ...rest] = sku.split('/')
  const active = rules.filter(r => r.active !== false && (!r.brand_id || r.brand_id === brandId))
  // kody powłok (np. AP1) doklejone do końcówki nie przeszkadzają w rozpoznaniu koloru: B/SC/AP1 → B/SC
  const coatings = new Set(active.filter(r => r.match_type === 'segment').map(r => r.pattern.toUpperCase()))   // powłoki, /NO itp.
  const suffix = rest.filter(seg => !coatings.has(seg.toUpperCase())).join('/')
  const list = active.filter(r => r.attribute === attribute)
  if (attribute === 'powloka') return list.find(r => r.match_type === 'segment' && rest.some(seg => seg.toUpperCase() === r.pattern.toUpperCase())) || null
  return (
    list.find(r => r.match_type === 'base' && r.pattern === base) ||
    list.filter(r => r.match_type === 'suffix' && r.pattern && (suffix === r.pattern || suffix.startsWith(r.pattern + '/'))).sort((a, b) => b.pattern.length - a.pattern.length)[0] ||
    list.find(r => r.match_type === 'suffix' && r.pattern === '' && suffix === '') ||
    list.filter(r => r.match_type === 'prefix' && r.pattern && base.startsWith(r.pattern)).sort((a, b) => b.pattern.length - a.pattern.length)[0] ||
    null
  )
}

export const pimCategory = row => row?.category_path?.length ? row.category_path.join(' ').toLowerCase() : (row?.category ? String(row.category).toLowerCase() : null)
const DIMS_RX = /(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)(?:\s*x\s*(\d+(?:[.,]\d+)?))?/i

// raw: [{ sku, ean, name, image, bl_id, weight }], brands: [{id, name}], rules: import_rules, pim: Map sku → wiersz asortymentu z PIM (opcjonalnie)
export function parseProducts(raw, brands, rules, pim = new Map()) {
  const out = raw.map(p => {
    const sku = clean(p.sku), name = clean(p.name), flags = []
    const pr = pim.get(sku)
    if (String(p.name ?? '') !== name) flags.push('Podwójne spacje w nazwie (poprawione)')
    if (/\p{L}\?\p{L}/u.test(name)) flags.push('Nazwa zawiera „?” zamiast polskich znaków – sprawdź kodowanie pliku')
    const m = name.match(NAME_RX)
    const brandName = m ? m[1] : pr?.brand
    const brand = brandName ? brands.find(b => b.name.toLowerCase() === String(brandName).toLowerCase()) : null
    const a = {}
    if (!m && pr) {
      // produkt spoza wzorca brodzików (wanna, odpływ, nośnik…) – atrybuty z PIM i z wymiaru w nazwie
      if (!brand) flags.push(`Nieznana marka „${pr.brand || '—'}” – dodaj ją w bazie`)
      const d = (pr.name || name).match(DIMS_RX)
      if (d) { a.wymiar = `${d[1]}x${d[2]}`; if (d[3]) a.wysokosc_cm = Number(d[3].replace(',', '.')) }
      if (pr.shape) a.ksztalt = pr.shape
      if (!pr.model) flags.push('Brak modelu w PIM – rodzina utworzona z kategorii')
    } else if (!m) flags.push('Nazwa nierozpoznana i brak produktu w liście PIM – rodzinę i atrybuty uzupełnij ręcznie')
    else {
      if (!brand) flags.push(`Nieznana marka „${m[1]}” – dodaj ją w bazie`)
      a.material = MATERIALS[m[2].toLowerCase()] || m[2].toLowerCase()
      a.wymiar = `${m[5]}x${m[6]}`
      a.wysokosc_cm = Number(m[7].replace(',', '.'))
      const fromName = m[8] ? 'półokrągły' : m[5] === m[6] ? 'kwadratowy' : 'prostokątny'
      const override = ruleFor(rules, brand?.id, 'ksztalt', sku)
      a.ksztalt = override ? override.value : fromName
      if (m[8]) a.promien_cm = Number(m[8])
      if (override && override.value !== fromName) flags.push(`Kształt z reguły słownika: ${override.value} (z nazwy wynikałby ${fromName})`)
    }
    // reguła „brak końcówki SKU” dotyczy brodzików – nie przenosimy jej na wanny, odpływy, nośniki
    const isTray = !!m || /^(brodziki|wanny)/.test(pimCategory(pr) || '')   // „brak końcówki = Smooth White”: brodziki i wanny
    let fin = ruleFor(rules, brand?.id, 'wykonczenie', sku)
    if (fin && fin.match_type === 'suffix' && fin.pattern === '' && !isTray) fin = null
    if (fin) a.wykonczenie = fin.value
    else if (pr?.color) a.wykonczenie = pr.color
    else if (m) flags.push(`Brak reguły wykończenia dla końcówki SKU „${sku.split('/').slice(1).join('/') || '(brak)'}”`)
    if (pr?.shape && a.ksztalt && pr.shape !== a.ksztalt) flags.push(`Kształt w PIM „${pr.shape}” ≠ rozpoznany „${a.ksztalt}” – sprawdź raport jakości PIM`)
    const coat = ruleFor(rules, brand?.id, 'powloka', sku)
    if (coat) a.powloka = coat.value
    // „krótszy/dłuższy bok” ma sens tylko w prostokącie
    const drain = ruleFor(rules, brand?.id, 'odplyw', sku)
    if (drain && a.ksztalt === 'prostokątny') a.odplyw = drain.value
    const imgShape = Object.keys(IMG_SHAPES).find(k => new RegExp(`/${k}/`, 'i').test(p.image || ''))
    if (imgShape && a.ksztalt && IMG_SHAPES[imgShape] !== a.ksztalt) flags.push(`Zdjęcie główne pokazuje kształt „${IMG_SHAPES[imgShape]}”, a wariant to „${a.ksztalt}”`)
    if (p.weight !== undefined && !(Number(String(p.weight).replace(',', '.')) > 0)) flags.push('Waga = 0')
    // wszystkie zdjęcia SKU z rolą z reguł słownika (pozycja w Base albo fragment nazwy pliku)
    const imgRules = rules.filter(r => r.active !== false && r.attribute === 'zdjecie' && (!r.brand_id || r.brand_id === brand?.id))
    const images = (p.images?.length ? p.images : p.image ? [p.image] : []).filter(Boolean).map((url, i) => {
      const file = String(url).split('/').pop().toLowerCase()
      const pathRule = imgRules.find(r => { if (r.match_type !== 'path' || !r.pattern) return false; try { return new RegExp(r.pattern, 'i').test(String(url)) } catch { return false } })
      const rule = pathRule || imgRules.find(r => r.match_type === 'filename' && r.pattern && file.includes(r.pattern.toLowerCase()))
        || imgRules.find(r => r.match_type === 'position' && Number(r.pattern) === i + 1)
      return { url, position: i + 1, role: rule ? rule.value : null }
    })
    // brak reguły odpływu dla prostokąta → odpływ odczytany z packshotu (konwencja zdjęć jest źródłem prawdy)
    const PACK_TO_DRAIN = { 'packshot – odpływ w narożniku': 'odpływ w narożniku', 'packshot – odpływ na środku boku': 'odpływ na środku boku', 'packshot – odpływ na krótkim boku': 'odpływ przy krótszym boku' }
    const mainPack = images.find(im => im.role && im.role.startsWith('packshot'))
    if (!a.odplyw && a.ksztalt === 'prostokątny' && mainPack && PACK_TO_DRAIN[mainPack.role]) {
      a.odplyw = PACK_TO_DRAIN[mainPack.role]
      flags.push(`Odpływ odczytany ze zdjęcia: ${a.odplyw}`)
    }
    // który packshot i który rysunek pasuje do tego wariantu (konwencja ścieżek zdjęć)
    const odplywRules = imgRules.filter(r => r.match_type === 'odplyw')
    const DRAIN_TO_PACK = { 'w narożniku': 'packshot – odpływ w narożniku', 'na środku boku': 'packshot – odpływ na środku boku', 'krótszym boku': 'packshot – odpływ na krótkim boku' }
    const wantPack = a.odplyw
      ? (odplywRules.find(r => r.pattern && a.odplyw.toLowerCase().includes(r.pattern.toLowerCase()))?.value || Object.entries(DRAIN_TO_PACK).find(([k]) => a.odplyw.includes(k))?.[1])
      : odplywRules.find(r => r.pattern === '')?.value
    const wantDraw = DRAWING[a.ksztalt] ? `rysunek techniczny – ${DRAWING[a.ksztalt]}` : null
    images.forEach(im => { im.preferred = !!im.role && (im.role === wantPack || im.role === wantDraw) })
    const main = images[0]
    if (main?.role?.startsWith('packshot') && wantPack && main.role !== wantPack)
      flags.push(`Packshot nie pasuje do odpływu: zdjęcie „${main.role.replace('packshot – ', '')}”, wariant „${a.odplyw || 'bez atrybutu odpływu'}”`)
    const colorDir = main && (String(main.url).match(/aedler\/[^/]+\/([^/]+)\/[^/]+\/[^/]+$/i) || [])[1]
    if (colorDir && IMG_COLORS[colorDir.toLowerCase()] && a.wykonczenie && !a.wykonczenie.toLowerCase().startsWith(IMG_COLORS[colorDir.toLowerCase()]))
      flags.push(`Zdjęcie główne z folderu koloru „${colorDir}”, a wariant to „${a.wykonczenie}”`)
    if (imgRules.some(r => r.match_type === 'path')) {
      const off = images.filter(im => !im.role).map(im => String(im.url).split('/').slice(-2).join('/'))
      if (off.length) flags.push(`Zdjęcie spoza konwencji nazw: ${off.join(', ')}`)
    }
    if (images.length && images.some(im => im.role) && wantDraw && !images.some(im => im.role === wantDraw)) flags.push(`Brak rysunku technicznego dla kształtu „${a.ksztalt}”`)
    const catFromName = m ? (a.material === 'akryl' ? 'brodziki standard' : a.material === 'kompozyt' ? 'brodziki kompozytowe' : `brodziki ${a.material}`) : null
    const category = pimCategory(pr) || catFromName
    let model = (m ? m[3] : null) || pr?.model || (pr ? (pr.category_path?.slice(-1)[0] || pr.category || null) : null)
    // zestaw (np. wanna z nośnikiem) → osobna rodzina „model + nośnik”; same nośniki są wyłączone
    const isCarrier = /^no[sś]nik/i.test(category || '') || /^(\S+\s+)?no[sś]nik/i.test(name)
    // zestaw: najpierw fragment SKU (np. /NO), opcjonalnie aktywna reguła po opisie z PIM
    const setRules = !isCarrier && model ? rules.filter(r => r.active !== false && r.attribute === 'rodzina' && (!r.brand_id || r.brand_id === brand?.id)) : []
    const segs = sku.split('/').slice(1).map(x => x.toUpperCase())
    const bySku = setRules.find(r => r.match_type === 'segment' && segs.includes(r.pattern.toUpperCase()))
    const byName = !bySku && pr ? setRules.find(r => { if (r.match_type !== 'name') return false; try { return new RegExp(r.pattern, 'i').test(pr.name || '') } catch { return false } }) : null
    const famRule = bySku || byName
    if (famRule) { model = `${model} + ${famRule.value}`; a.w_zestawie = famRule.value; flags.push(`Zestaw z: ${famRule.value} (${bySku ? 'SKU /' + famRule.pattern : 'opis w PIM'}) – osobna rodzina „${model}”`) }
    return {
      sku, ean: clean(p.ean) || pr?.ean || '', name, image_url: images[0]?.url || null, images, bl_id: p.bl_id ? Number(p.bl_id) : null,
      brand_id: brand?.id || null, brand_name: brand?.name || brandName || null,
      model_name: model, series: m ? clean(m[4]) : (pr?.technology ? pr.technology.replace(/\b\w/g, x => x.toUpperCase()) : null), category,
      attributes: a, flags: pr || !m || !pim.size ? flags : [...flags, 'Brak produktu na liście PIM – kategoria z nazwy'],
    }
  })
  // nazwa identyczna z innym SKU = marketplace pokaże duplikaty
  const count = {}
  out.forEach(p => { count[p.name] = (count[p.name] || 0) + 1 })
  out.forEach(p => { if (count[p.name] > 1) p.flags.push(`Nazwa identyczna jak u ${count[p.name] - 1} innych SKU`) })
  return out
}

export function groupFamilies(parsed) {
  const fams = {}
  for (const p of parsed) {
    const key = p.model_name ? `${p.brand_name}|${p.model_name}` : '—|nierozpoznane'
    ;(fams[key] ||= { key, brand_name: p.brand_name, brand_id: p.brand_id, model_name: p.model_name, series: p.series, category: p.category, items: [] }).items.push(p)
  }
  return Object.values(fams)
}

// Wiersze z eksportu CSV Baselinkera
export function rowsFromBaselinkerCsv(rows) {
  return rows.filter(r => r.produkt_sku).map(r => ({
    sku: r.produkt_sku, ean: r.produkt_ean, name: r.produkt_nazwa, image: r.zdjecie, bl_id: r.produkt_id, weight: r.waga,
    images: [r.zdjecie, ...Array.from({ length: 15 }, (_, i) => r[`zdjecie_dodatkowe_${i + 1}`])].filter(Boolean),
  }))
}

// Marka i model z nazwy (do drzewa asortymentu); dla nazw spoza wzorca: marka = pierwsze słowo
export function parseModel(name) {
  const n = clean(name)
  const m = n.match(NAME_RX)
  if (m) return { brand: m[1], model: m[3] }
  return { brand: n.split(' ')[0] || null, model: null }
}

// Wykończenie i powłoka wyliczone z samego SKU (dla produktów, których nie ma jeszcze w aplikacji)
export function skuAttributes(sku, brandId, rules, category, shape) {
  const a = {}
  // kształt: reguła słownika (np. kod bazowy → pięciokątny) ma pierwszeństwo przed polem PIM
  const sh = ruleFor(rules, brandId, 'ksztalt', sku)
  if (sh) a.ksztalt = sh.value
  shape = a.ksztalt || shape
  const drain = ruleFor(rules, brandId, 'odplyw', sku)
  if (drain && shape === 'prostokątny') a.odplyw = drain.value   // jak przy imporcie: odpływ tylko dla prostokątów
  let fin = ruleFor(rules, brandId, 'wykonczenie', sku)
  if (fin && fin.match_type === 'suffix' && fin.pattern === '' && !/^(brodziki|wanny)/.test(String(category || ''))) fin = null
  if (fin) a.wykonczenie = fin.value
  const coat = ruleFor(rules, brandId, 'powloka', sku)
  if (coat) a.powloka = coat.value
  return a
}
