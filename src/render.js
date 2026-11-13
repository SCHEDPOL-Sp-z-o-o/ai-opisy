// Renderer opisu HTML sterowany szablonem (kolejność sekcji, obrazki, style).
// Ten sam kod działa w aplikacji (podgląd) i w n8n (generacja) – nie zmieniaj jednego bez drugiego.
export const DEFAULT_ASSET_BASE = 'https://schedpol.nazwa.pl/AEDLER/'
export const DEFAULT_STYLES = { asset_base: DEFAULT_ASSET_BASE, max_width: 920, font_size: 15, line_height: 1.6, text_color: '#333333', heading_color: '#0D1B3E', accent_color: '#1E4D9B', h1_size: 26, h2_size: 22, hero_tag: 'h1', hero_align: 'left', faq_style: 'numbered' }

// === RENDER START === (blok kopiowany 1:1 do n8n – węzły „GEN: QA i HTML” i „VAR: QA i HTML”)
// Formaty wyjściowe: standard (bogaty HTML eMAG), custom (własny szkielet HTML z polami {{…}}); oba przechodzą przez filtr dozwolonych znaczników.
function rdOut(template) { return { mode: 'standard', html: '', allowed_tags: '', keep_styles: true, images: true, max_chars: 0, ...((template && template.styles && template.styles.output) || {}) } }

// Mini-silnik szablonów: {{pole}} (z escapowaniem), {{{pole}}} (bez), {{#lista}}…{{/lista}} (pętla / warunek), {{^pole}}…{{/pole}} (gdy puste), {{.}} (bieżący element)
function rdMustache(tpl, ctx) {
  const esc = v => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const look = (stack, name) => { if (name === '.') return stack[stack.length - 1]; for (let i = stack.length - 1; i >= 0; i--) { const o = stack[i]; if (o && typeof o === 'object' && name in o) return o[name] } return '' }
  const render = (t, stack) => {
    let out = '', i = 0
    while (i < t.length) {
      const open = t.indexOf('{{', i)
      if (open < 0) { out += t.slice(i); break }
      out += t.slice(i, open)
      // niezamknięty znacznik ({{ bez }}) – reszta jako zwykły tekst (bez tego pętla nie miała końca)
      if (t.startsWith('{{{', open)) { const close = t.indexOf('}}}', open); if (close < 0) { out += t.slice(open); break } const name = t.slice(open + 3, close).trim(); out += String(look(stack, name) ?? ''); i = close + 3; continue }
      const close = t.indexOf('}}', open); if (close < 0) { out += t.slice(open); break } const tag = t.slice(open + 2, close).trim(); i = close + 2
      if (tag[0] === '#' || tag[0] === '^') {
        const name = tag.slice(1).trim(); let depth = 1, j = i, end = -1
        const re = /\{\{\s*([#^/])\s*([^}]+?)\s*\}\}/g; re.lastIndex = i; let m
        while ((m = re.exec(t))) { if (m[2] !== name) continue; if (m[1] === '/') { depth--; if (!depth) { end = m.index; j = re.lastIndex; break } } else depth++ }
        if (end < 0) { i = t.length; break }
        const inner = t.slice(i, end), val = look(stack, name)
        const empty = !val || (Array.isArray(val) && !val.length)
        if (tag[0] === '^') { if (empty) out += render(inner, stack) }
        else if (Array.isArray(val)) val.forEach(v => { out += render(inner, [...stack, v]) })
        else if (!empty) out += render(inner, [...stack, val])
        i = j
      } else if (tag[0] !== '/' && tag[0] !== '!') out += esc(look(stack, tag))
    }
    return out
  }
  return render(String(tpl || ''), [ctx])
}

// Filtr: zostają tylko dozwolone znaczniki (treść usuniętych zostaje), bez skryptów; atrybuty tylko src/alt/href (+ style, jeśli dozwolone)
function rdSanitize(html, out) {
  const allowed = String(out.allowed_tags || '').toLowerCase().split(/[\s,;]+/).filter(Boolean)
  let h = String(html).replace(/<(script|style|iframe)[^>]*>[\s\S]*?<\/\1>/gi, '')
  if (out.keep_styles === false) h = h.replace(/\s+style="[^"]*"/gi, '')
  if (out.images === false) h = h.replace(/<img\b[^>]*>/gi, '')
  if (allowed.length) {
    h = h.replace(/<\/?([a-z][a-z0-9]*)\b([^>]*)>/gi, (m, tag, attrs) => {
      const t = tag.toLowerCase(); if (!allowed.includes(t)) return ''
      if (m.startsWith('</')) return `</${t}>`
      const keep = (attrs.match(/\s(src|alt|href|style)="[^"]*"/gi) || []).filter(a => !/^\s*style=/i.test(a) || out.keep_styles !== false).join('')
      return `<${t}${keep}${/\/\s*>$/.test(m) ? ' /' : ''}>`
    })
    h = h.replace(/<(p|li|ul|ol|h[1-6]|div|strong|b)>\s*<\/\1>/gi, '')
  }
  return h.replace(/\n{3,}/g, '\n\n').trim()
}

// Dane dla własnego szkieletu: wszystkie pola (np. {{S1_H2}}) + listy {{#sekcje}} i {{#faq}}
function rdContext(fields, template, images) {
  const g = k => String(fields?.[k] ?? '').trim()
  const ctx = { ...fields, TYTUL: g('HERO_H1'), LEAD: g('HERO_LEAD'), HERO_IMG: '', sekcje: [], faq: [], FAQ_H2: g('FAQ_H2') }
  for (const sec of (template?.sections || []).filter(s => s && s.enabled !== false)) {
    const k = sec.key, src = images ? (images[k] || '') : ((sec.image_source || 'static') === 'static' ? (sec.image_url || '') : '')
    if (sec.type === 'hero') ctx.HERO_IMG = src
    if (sec.type === 'content') {
      const li = sec.list === false ? [] : [1, 2, 3, 4, 5].map(b => g(`${k}_LI${b}`)).filter(Boolean)
      const s = { KLUCZ: k, H2: g(`${k}_H2`), P: g(`${k}_P`), P_BOLD: sec.bold === false ? '' : g(`${k}_P_BOLD`), AKCENT: sec.accent ? g(`${k}_AKCENT`) : '', LI: li, IMG: src, IMG_ALT: g(`${k}_IMG_ALT`) }
      s.MA_LI = s.LI.length > 0
      if (s.H2 || s.P || s.P_BOLD || s.LI.length || s.AKCENT) { ctx.sekcje.push(s); ctx[`${k}_IMG`] = src }
    }
    if (sec.type === 'faq') ctx.faq = [1, 2, 3, 4, 5, 6].slice(0, sec.max_questions || 6).map(i => ({ NR: i, Q: g(`FAQ_Q${i}`), A: g(`FAQ_A${i}`) })).filter(x => x.Q && x.A)
  }
  ctx.MA_FAQ = ctx.faq.length > 0
  return ctx
}

// Specyfikacja techniczna: wiersze z danych produktu ({label, value, num, unit}) – liczby wstawia program, AI tylko tłumaczy etykiety i teksty.
// Zwraca liczby specyfikacji (dla kontroli jakości „liczby spoza faktów”).
function applySpecRows(fields, template, rows, lang) {
  const fmt = n => { const x = Number(n); const t = Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100); return lang === 'en' ? t : t.replace('.', ',') }
  const used = []
  for (const sec of (template?.sections || []).filter(s => s && s.enabled !== false && s.type === 'specs')) {
    const k = sec.key, list = (rows || []).slice(0, 12)
    for (let i = 1; i <= 12; i++) {
      const r = list[i - 1]
      if (!r) { delete fields[`${k}_L${i}`]; delete fields[`${k}_V${i}`]; continue }
      if (!String(fields[`${k}_L${i}`] || '').trim()) fields[`${k}_L${i}`] = r.label
      if (r.num !== null && r.num !== undefined && r.num !== '') { fields[`${k}_V${i}`] = `${fmt(r.num)}${r.unit ? ' ' + r.unit : ''}`; used.push(String(r.num)) }
      else { if (!String(fields[`${k}_V${i}`] || '').trim()) fields[`${k}_V${i}`] = r.value; (String(r.value).match(/\d+(?:[.,]\d+)?/g) || []).forEach(n => used.push(n.replace(',', '.'))) }
    }
  }
  return used
}

function renderDescription(fields, template, images) {
  const out = rdOut(template)
  if (out.mode === 'custom' && out.html) return rdSanitize(rdMustache(out.html, rdContext(fields, template, images)), out)
  const st = { ...DEFAULT_STYLES, ...(template?.styles || {}) }
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const attr = s => esc(s).replace(/"/g, '&quot;')
  const g = k => String(fields?.[k] ?? '').trim()
  const img = (src, alt) => src ? `<img alt="${attr(alt)}" src="${attr(src)}" style="width: 100%; height: auto">` : ''
  const srcOf = sec => images ? (images[sec.key] || '') : ((sec.image_source || 'static') === 'static' ? (sec.image_url || '') : '')
  const hr = '<hr style="border: none; margin: 32px auto">'
  const h2 = (text, bottom) => `<h2 style="font-size: ${st.h2_size}px; color: ${st.heading_color}; margin: 0 0 ${bottom}px 0">${esc(text)}</h2>`
  const ht = st.hero_tag === 'h2' ? 'h2' : 'h1'
  const LINE = '#E3E6EA'
  // układ obraz–tekst na przemian (na telefonie kolumny zawijają się – zawsze obraz nad tekstem)
  let splitN = 0
  const split = (body, src, alt, tint) => {
    const right = splitN++ % 2 === 1, pic = src ? `<img alt="${attr(alt)}" src="${attr(src)}" style="width: 100%; height: auto; border-radius: 4px; display: block">` : ''
    const col = (inner, pad) => `<div style="flex: 1 1 300px; padding: ${pad}">${inner}</div>`
    const txt = col(body, tint ? '18px 20px' : '0 10px 12px 10px'), img = pic ? col(pic, tint ? '18px 20px' : '0 10px 12px 10px') : ''
    return `<div style="display: flex; flex-wrap: ${right ? 'wrap-reverse' : 'wrap'}; align-items: center; margin: 0 0 26px 0${tint ? '; background: #F5F7F9; border-radius: 4px' : ''}">${right ? txt + img : img + txt}</div>`
  }
  let h = `<div style="max-width: ${st.max_width}px; margin: 0 auto; color: ${st.text_color}; font-size: ${st.font_size}px; line-height: ${st.line_height}">`
  for (const sec of (template?.sections || []).filter(s => s && s.enabled !== false)) {
    const k = sec.key
    if (sec.type === 'hero') {
      h += img(srcOf(sec), g('HERO_IMG_ALT'))
      const ctr = st.hero_align === 'center'
      h += `<${ht} style="font-size: ${st.h1_size}px; line-height: 1.25; color: ${st.heading_color}; margin: ${ctr ? '22px 0 10px 0' : '0 0 10px 0'}${ctr ? '; text-align: center' : ''}">${esc(g('HERO_H1'))}</${ht}>`
      if (g('HERO_LEAD')) h += `<p style="margin: 0 ${ctr ? 'auto 22px auto; max-width: 820px; text-align: center' : '0 8px 0; font-size: 16px'}">${esc(g('HERO_LEAD'))}</p>`
    } else if (sec.type === 'features') {
      const items = [1, 2, 3, 4, 5, 6].map(i => g(`${k}_${i}`)).filter(Boolean)
      if (!items.length) continue
      h += `<div style="display: flex; flex-wrap: wrap; border-top: 1px solid ${LINE}; border-bottom: 1px solid ${LINE}; padding: 10px 0; margin: 0 0 26px 0">`
      h += items.map(t => `<div style="flex: 1 1 280px; padding: 8px 10px; display: flex; gap: 10px; align-items: center"><span style="color: ${st.accent_color}; font-size: 20px; font-weight: bold">✔</span><span>${esc(t)}</span></div>`).join('') + '</div>'
    } else if (sec.type === 'benefits') {
      const items = [1, 2, 3, 4, 5].map(i => ({ t: g(`${k}_T${i}`), d: g(`${k}_D${i}`) })).filter(x => x.t || x.d)
      if (!items.length) continue
      if (g(`${k}_H2`)) h += `<h2 style="font-size: ${st.h2_size}px; color: ${st.heading_color}; text-align: center; margin: 0 0 12px 0">${esc(g(`${k}_H2`))}</h2>`
      h += `<ul style="margin: 0 auto 30px auto; max-width: 820px; padding-left: 20px">` + items.map(x => `<li style="margin: 0 0 6px 0">${x.t ? `<strong style="color: ${st.heading_color}">${esc(x.t)}</strong>` : ''}${x.t && x.d ? ' – ' : ''}${esc(x.d)}</li>`).join('') + '</ul>'
    } else if (sec.type === 'kit') {
      const items = [1, 2, 3, 4, 5, 6].map(i => g(`${k}_LI${i}`)).filter(Boolean)
      if (!items.length) continue
      const body = `${g(`${k}_H2`) ? `<h2 style="font-size: ${st.h2_size - 2}px; color: ${st.heading_color}; margin: 0 0 10px 0">${esc(g(`${k}_H2`))}</h2>` : ''}<ol style="margin: 0; padding: 0; list-style: none">`
        + items.map((t, i) => `<li style="display: flex; gap: 10px; align-items: center; padding: 6px 0${i < items.length - 1 ? `; border-bottom: 1px solid ${LINE}` : ''}"><span style="flex: 0 0 24px; height: 24px; border-radius: 50%; background: ${st.heading_color}; color: #FFFFFF; font-size: 13px; font-weight: bold; display: inline-flex; align-items: center; justify-content: center">${i + 1}</span>${esc(t)}</li>`).join('') + '</ol>'
      h += split(body, srcOf(sec), g(`${k}_IMG_ALT`))
    } else if (sec.type === 'specs') {
      const rows = []; for (let i = 1; i <= 12; i++) { const l = g(`${k}_L${i}`), v = g(`${k}_V${i}`); if (l && v) rows.push([l, v]) }
      if (!rows.length) continue
      const body = `${g(`${k}_H2`) ? `<h2 style="font-size: ${st.h2_size - 2}px; color: ${st.heading_color}; margin: 0 0 10px 0">${esc(g(`${k}_H2`))}</h2>` : ''}<table style="width: 100%; border-collapse: collapse; font-size: 14px">`
        + rows.map(([l, v], i) => { const b = i < rows.length - 1 ? `; border-bottom: 1px solid ${LINE}` : ''; return `<tr><td style="padding: 6px 8px; color: #5C6570${b}">${esc(l)}</td><td style="padding: 6px 8px; color: ${st.heading_color}; font-weight: bold${b}">${esc(v)}</td></tr>` }).join('') + '</table>'
      h += split(body, srcOf(sec), g(`${k}_IMG_ALT`))
    } else if (sec.type === 'content' && sec.layout === 'split') {
      const lis = sec.list === false ? [] : [1, 2, 3, 4, 5].map(b => g(`${k}_LI${b}`)).filter(Boolean)
      const H2 = g(`${k}_H2`), P = g(`${k}_P`), PB = sec.bold === false ? '' : g(`${k}_P_BOLD`)
      if (!H2 && !P && !PB && !lis.length) continue
      let body = H2 ? `<h2 style="font-size: ${st.h2_size - 2}px; color: ${st.heading_color}; margin: 0 0 8px 0">${esc(H2)}</h2>` : ''
      if (P) body += `<p style="margin: 0${PB || lis.length ? ' 0 8px 0' : ''}">${esc(P)}</p>`
      if (lis.length) body += `<ul style="margin: 0${PB ? ' 0 8px 0' : ''}; padding-left: 18px">` + lis.map(l => `<li>${esc(l)}</li>`).join('') + '</ul>'
      if (PB) body += `<p style="margin: 0"><strong style="color: ${st.heading_color}">${esc(PB)}</strong></p>`
      h += split(body, srcOf(sec), g(`${k}_IMG_ALT`), !!sec.tint)
    } else if (sec.type === 'content') {
      const lis = sec.list === false ? [] : [1, 2, 3, 4, 5].map(b => g(`${k}_LI${b}`)).filter(Boolean)
      const H2 = g(`${k}_H2`), P = g(`${k}_P`), PB = sec.bold === false ? '' : g(`${k}_P_BOLD`), AK = sec.accent ? g(`${k}_AKCENT`) : ''
      if (!H2 && !P && !PB && !lis.length && !AK) continue   // pusta sekcja znika razem z obrazkiem
      h += hr + '<div style="text-align: left">' + h2(H2, 12)
      if (P || PB) h += `<p style="margin: 0 0 ${(lis.length || AK) ? 10 : 14}px 0">${esc(P)}${PB ? ' <strong>' + esc(PB) + '</strong>' : ''}</p>`
      if (lis.length) h += `<ul style="margin: 0 0 ${AK ? 10 : 14}px 0; padding-left: 18px">` + lis.map(l => `<li>${esc(l)}</li>`).join('') + '</ul>'
      if (AK) h += `<p style="margin: 0 0 14px 0; color: ${st.accent_color}"><strong>${esc(AK)}</strong></p>`
      h += img(srcOf(sec), g(`${k}_IMG_ALT`)) + '</div>'
    } else if (sec.type === 'faq') {
      const qs = [1, 2, 3, 4, 5, 6].slice(0, sec.max_questions || 6).map(i => ({ q: g(`FAQ_Q${i}`), a: g(`FAQ_A${i}`) })).filter(x => x.q && x.a)
      if (!qs.length) continue
      if (st.faq_style === 'bordered') {
        h += `<h2 style="font-size: ${st.h2_size}px; color: ${st.heading_color}; margin: 0 0 12px 0">${esc(g('FAQ_H2'))}</h2><div style="border-top: 1px solid ${LINE}">`
          + qs.map(x => `<div style="padding: 10px 0; border-bottom: 1px solid ${LINE}"><p style="margin: 0 0 4px 0; color: ${st.heading_color}"><strong>${esc(x.q)}</strong></p><p style="margin: 0">${esc(x.a)}</p></div>`).join('') + '</div>'
        continue
      }
      h += hr + '<div>' + h2(g('FAQ_H2'), 16)
      qs.forEach((x, i) => {
        h += `<p style="margin: 0 0 4px 0; color: ${st.heading_color}"><strong>${i + 1}. ${esc(x.q)}</strong></p><p style="${i === qs.length - 1 ? 'margin: 0' : 'margin: 0 0 14px 0'}">${esc(x.a)}</p>`
      })
      h += '</div>'
    }
  }
  h += '</div>'
  const needsFilter = out.allowed_tags || out.keep_styles === false || out.images === false
  return needsFilter ? rdSanitize(h, out) : h
}
// === RENDER END ===
export { renderDescription, rdMustache, rdSanitize, rdContext, applySpecRows }

// Gotowe formaty wyjściowe do wyboru w edytorze szablonów
export const OUTPUT_PRESETS = {
  standard: { label: 'eMAG – bogaty HTML (style, grafiki)', output: { mode: 'standard', html: '', allowed_tags: '', keep_styles: true, images: true, max_chars: 0 } },
  kaufland: { label: 'Kaufland – prosty HTML (nagłówki, akapity, listy)', output: { mode: 'custom', keep_styles: false, images: false, max_chars: 5000,
    allowed_tags: 'h2, h3, p, br, ul, ol, li, b, strong',
    html: `<h2>{{TYTUL}}</h2>
{{#LEAD}}<p>{{LEAD}}</p>{{/LEAD}}
{{#sekcje}}
<h3>{{H2}}</h3>
<p>{{P}}{{#P_BOLD}} <b>{{P_BOLD}}</b>{{/P_BOLD}}</p>
{{#MA_LI}}<ul>{{#LI}}<li>{{.}}</li>{{/LI}}</ul>{{/MA_LI}}
{{#AKCENT}}<p><b>{{AKCENT}}</b></p>{{/AKCENT}}
{{/sekcje}}
{{#MA_FAQ}}<h3>{{FAQ_H2}}</h3>{{/MA_FAQ}}
{{#faq}}<p><b>{{Q}}</b><br>{{A}}</p>{{/faq}}` } },
  custom: { label: 'Własny kod HTML', output: { mode: 'custom', keep_styles: true, images: true, max_chars: 0, allowed_tags: '', html: '' } },
}

// Lista pól, które AI ma wypełnić dla danego szablonu (kontrakt generacji)
export function templateFields(template) {
  const keys = []
  for (const sec of (template?.sections || []).filter(s => s && s.enabled !== false)) {
    if (sec.type === 'hero') keys.push('HERO_IMG_ALT', 'HERO_H1', 'HERO_LEAD')
    if (sec.type === 'content') {
      keys.push(`${sec.key}_H2`, `${sec.key}_P`)
      if (sec.bold !== false) keys.push(`${sec.key}_P_BOLD`)
      if (sec.list !== false) keys.push(...[1, 2, 3, 4, 5].map(b => `${sec.key}_LI${b}`))
      if (sec.accent && sec.layout !== 'split') keys.push(`${sec.key}_AKCENT`)
      if (hasImage(sec)) keys.push(`${sec.key}_IMG_ALT`)
    }
    if (sec.type === 'faq') { keys.push('FAQ_H2'); for (let i = 1; i <= (sec.max_questions || 6); i++) keys.push(`FAQ_Q${i}`, `FAQ_A${i}`) }
    if (sec.type === 'features') keys.push(...[1, 2, 3, 4, 5, 6].map(i => `${sec.key}_${i}`))
    if (sec.type === 'benefits') { keys.push(`${sec.key}_H2`); for (let i = 1; i <= 5; i++) keys.push(`${sec.key}_T${i}`, `${sec.key}_D${i}`) }
    if (sec.type === 'kit') { keys.push(`${sec.key}_H2`, ...[1, 2, 3, 4, 5, 6].map(i => `${sec.key}_LI${i}`)); if (hasImage(sec)) keys.push(`${sec.key}_IMG_ALT`) }
    if (sec.type === 'specs') { keys.push(`${sec.key}_H2`); if (hasImage(sec)) keys.push(`${sec.key}_IMG_ALT`) }   // wiersze: z danych produktu (applySpecRows)
  }
  return keys
}

const hasImage = sec => { const src = sec.image_source || 'static'; return src === 'static' ? !!sec.image_url : src !== 'none' }

const eq = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

// Dobór grafik: biblioteka (model → seria → technologia → marka → stały adres zapasowy) albo zdjęcie SKU wg roli
export function resolveImages(template, { brand_id, family = {}, product = {}, library = [] } = {}) {
  const out = {}
  for (const sec of (template?.sections || []).filter(s => s && s.enabled !== false && s.type !== 'faq')) {
    const src = sec.image_source || 'static'
    if (src === 'none') continue
    if (src === 'static') { if (sec.image_url) out[sec.key] = sec.image_url; continue }
    if (src === 'ftp') { const l = ftpLink(sec, { family, product }, template?.styles?.asset_base); if (l.url) out[sec.key] = l.url; continue }
    if (src === 'product') {
      const imgs = [...(product.images || [])].sort((a, b) => a.position - b.position)
      const role = String(sec.image_role || '').trim().toLowerCase()
      // role ogólne: właściwy packshot (wg odpływu) i rysunek (wg kształtu) wybrane przy imporcie
      const hit = !role ? imgs[0]
        : role === 'packshot' ? (imgs.find(i => i.preferred && String(i.role).startsWith('packshot')) || imgs.find(i => String(i.role || '').startsWith('packshot')))
        : role === 'rysunek techniczny' ? imgs.find(i => i.preferred && String(i.role).startsWith('rysunek techniczny'))
        : imgs.find(i => eq(i.role, sec.image_role))
      if (hit) out[sec.key] = hit.url
      continue
    }
    const pool = library.filter(m => eq(m.role, sec.image_role) && (!m.brand_id || m.brand_id === brand_id))
    const hit = pool.find(m => m.scope === 'model' && m.scope_value === family.id)
      || pool.find(m => m.scope === 'seria' && eq(m.scope_value, family.series))
      || pool.find(m => m.scope === 'technologia' && (family.technologies || []).some(t => eq(t, m.scope_value)))
      || pool.find(m => m.scope === 'marka')
    if (hit) out[sec.key] = hit.url
    else if (sec.image_url) out[sec.key] = sec.image_url
  }
  return out
}

// ===== Linki do grafik wg konwencji Oli: {baza}/{model}/{kolor}/{ksztalt}/{X}.jpg oraz {baza}/{model}/{X}.jpg =====
export const FTP_ASSETS = [
  { x: 'auto-packshot', label: 'Packshot – automatycznie wg odpływu (1 / 1a / 1b)', level: 'variant' },
  { x: '1', label: '1 – packshot, odpływ w narożniku', level: 'variant' },
  { x: '1a', label: '1a – packshot, odpływ na środku boku', level: 'variant' },
  { x: '1b', label: '1b – packshot, odpływ na krótkim boku', level: 'variant' },
  { x: '2', label: '2 – aranżacja 1', level: 'variant' },
  { x: '3', label: '3 – aranżacja 2', level: 'variant' },
  { x: '4', label: '4 – infografika', level: 'variant' },
  { x: 'auto-drawing', label: 'Rysunek techniczny – automatycznie wg kształtu', level: 'model' },
]
const ascii = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l')
export const slug = s => ascii(s).trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
const SHAPE_DIR = { 'kwadratowy': 'kwadrat', 'prostokątny': 'prostokat', 'półokrągły': 'polokragly', 'pięciokątny': 'pieciokat', 'asymetryczny': 'asymetryczny' }
const DRAWING_X = { 'kwadratowy': '1', 'prostokątny': '2', 'półokrągły': '3' }
export function ftpLink(sec, { family = {}, product = {} } = {}, base = DEFAULT_ASSET_BASE) {
  const a = product.attributes || {}
  const model = slug(String(family.model_name || '').split(' + ')[0])
  const root = String(base || DEFAULT_ASSET_BASE).replace(/\/?$/, '/')
  if (!model) return { url: null, why: 'brak modelu' }
  if (sec.ftp_x === 'auto-drawing') {
    const x = DRAWING_X[a.ksztalt]
    return x ? { url: `${root}${model}/${x}.jpg` } : { url: null, why: `konwencja nie przewiduje rysunku dla kształtu „${a.ksztalt || '—'}”` }
  }
  const color = slug(String(a.wykonczenie || '').split('(')[0])
  const shape = SHAPE_DIR[a.ksztalt]
  if (!color || !shape) return { url: null, why: !color ? 'brak koloru wariantu' : `brak katalogu dla kształtu „${a.ksztalt || '—'}”` }
  let x = sec.ftp_x || '1'
  if (x === 'auto-packshot') x = /krótsz/i.test(a.odplyw || '') ? '1b' : /środku/i.test(a.odplyw || '') ? '1a' : '1'
  return { url: `${root}${model}/${color}/${shape}/${x}.jpg` }
}
