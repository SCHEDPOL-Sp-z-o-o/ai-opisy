import { supabase } from './supabase.js'
import { applies } from './knowledge.js'
import { resolveImages } from './render.js'
import { runJob, startJob } from './jobs.js'
import { DEFAULT_TITLE_PATTERN, titlePresetFor } from './languages.js'

const MARKET = c => `${c.marketplace} ${c.language.toUpperCase()}`

// Zbiera wszystko, czego potrzebuje generacja, i sprawdza warunki wstępne
export async function buildContext(familyId, channelId) {
  const { data: family } = await supabase.from('product_families').select('*').eq('id', familyId).single()
  const [ch, br, tp, lead, facts, banks, lib, rules, guides] = await Promise.all([
    supabase.from('channels').select('*').eq('id', channelId).single(),
    supabase.from('brands').select('id, name').eq('id', family.brand_id).single(),
    supabase.from('templates').select('*').eq('channel_id', channelId).eq('brand_id', family.brand_id).eq('status', 'aktywny'),
    family.lead_product_id ? supabase.from('products').select('*').eq('id', family.lead_product_id).single() : Promise.resolve({ data: null }),
    supabase.from('kb_facts').select('*').eq('status', 'zatwierdzony'),
    supabase.from('keyword_banks').select('*'),
    supabase.from('media_library').select('*'),
    supabase.from('qa_rules').select('*').eq('status', 'aktywna'),
    supabase.from('style_guides').select('scope, rules').eq('status', 'aktywna'),
  ])
  const eqc = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
  const template = (tp.data || []).find(t => t.category && eqc(t.category, family.category)) || (tp.data || []).find(t => !t.category) || null
  const channel = ch.data, product = lead.data
  const problems = []
  if (!product) problems.push('Wybierz wariant wiodący rodziny (ekran Produkty).')
  if (!template) problems.push(`Brak aktywnego szablonu dla ${br.data?.name} · ${MARKET(channel)}.`)
  const { data: brandFams } = await supabase.from('product_families').select('id, brand_id, model_name').eq('brand_id', family.brand_id)
  // opis bazowy: fakty ogólne + koloru i SKU wariantu wiodącego
  const famFacts = (facts.data || []).filter(f => applies(f, family, brandFams || [], product))
  const factPool = facts.data || []
  if (!famFacts.length) problems.push('Brak zatwierdzonych faktów dla tej rodziny (Księga wiedzy).')
  const eq = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
  const bank = (banks.data || []).find(b => eq(b.category, family.category) && b.language === channel.language)
  const excluded = new Set(bank?.excluded || [])
  const keywords = (bank?.keywords || []).filter(k => !excluded.has(k.kw)).map(k => ({ kw: k.kw, volume: k.volume }))
  if (!keywords.length) problems.push(`Bank fraz „${family.category} · ${channel.language.toUpperCase()}” jest pusty – odśwież go (Frazy kluczowe).`)
  return { problems, family, channel, brand: br.data, template, product, facts: famFacts, factPool, brandFams: brandFams || [], keywords, library: lib.data || [],
    forbidden: (rules.data || []).filter(r => ['zakazany_wzorzec', 'marka_konkurencji'].includes(r.rule_type) && (!r.language || r.language === channel.language)).map(r => r.pattern),
    // wytyczne wyuczone z uwag (ogólne + języka rynku), potem reguły redakcyjne dodane ręcznie
    instructions: [
      ...(guides.data || []).filter(g => g.scope === 'all').flatMap(g => g.rules || []),
      ...(guides.data || []).filter(g => g.scope === channel.language).flatMap(g => g.rules || []),
      ...(rules.data || []).filter(r => r.rule_type === 'instrukcja' && (!r.language || r.language === channel.language)).map(r => r.pattern),
    ].filter((x, i, a) => x && a.indexOf(x) === i) }
}

function payloadFrom(ctx, extra) {
  const sections = ctx.template.sections.filter(s => s && s.enabled !== false)
  return {
    language: ctx.channel.language, market: MARKET(ctx.channel), brand: ctx.brand.name,
    family: { model_name: ctx.family.model_name, series: ctx.family.series, category: ctx.family.category },
    product: { sku: ctx.product.sku, attributes: ctx.product.attributes },
    facts: ctx.facts.map(f => f.content), keywords: ctx.keywords.slice(0, 150),
    template: { sections, styles: ctx.template.styles },
    images: resolveImages(ctx.template, { brand_id: ctx.family.brand_id, family: ctx.family, product: ctx.product, library: ctx.library }),
    limits: ctx.channel.limits || {}, forbidden: ctx.forbidden, instructions: ctx.instructions,
    title_pattern: (ctx.channel.limits || {}).title_pattern || titlePresetFor(ctx.channel.marketplace)?.pattern || DEFAULT_TITLE_PATTERN,
    ...extra,
  }
}

async function nextVersion(familyId, channelId, productId) {
  const { data } = await supabase.from('descriptions').select('version').eq('family_id', familyId).eq('channel_id', channelId).eq('product_id', productId).order('version', { ascending: false }).limit(1)
  return (data?.[0]?.version || 0) + 1
}

async function launch(descId, payload) {
  try {
    await runJob('generate_description', { ...payload, description_id: descId }, { timeoutSec: 660 })   // ponawianie zapytań do Vertex (3 próby × do 2 min) mieści się w czasie oczekiwania
  } catch (e) {
    await supabase.from('descriptions').update({ status: 'blad', qa: { pass: false, errors: [e.message], warnings: [] } }).eq('id', descId)
    throw e
  }
}

// Nowy opis bazowy rodziny (wariant wiodący) dla kanału
export async function generateBase(familyId, channelId, onCreated) {
  const ctx = await buildContext(familyId, channelId)
  if (ctx.problems.length) throw new Error(ctx.problems.join(' '))
  const { data: { session } } = await supabase.auth.getSession()
  const version = await nextVersion(familyId, channelId, ctx.product.id)
  const ins = await supabase.from('descriptions').insert({ family_id: familyId, product_id: ctx.product.id, channel_id: channelId, template_id: ctx.template.id,
    is_base: true, version, status: 'generowanie', created_by: session.user.id }).select('id').single()
  if (ins.error) throw new Error(ins.error.message)
  onCreated?.(ins.data.id)
  await launch(ins.data.id, payloadFrom(ctx, { mode: 'full' }))
  return ins.data.id
}

// Poprawka wybranych sekcji na podstawie uwag recenzenta → nowa wersja
export async function regenerateSections(desc, sections, comments, general, onCreated) {
  const ctx = await buildContext(desc.family_id, desc.channel_id)
  if (!ctx.template) throw new Error('Brak aktywnego szablonu')
  const { data: { session } } = await supabase.auth.getSession()
  const rows = comments.filter(c => c.text.trim()).map(c => ({ description_id: desc.id, section_key: c.section, content: c.text.trim(), make_rule: !!c.rule, author: session.user.id }))
  if (general.trim()) rows.push({ description_id: desc.id, section_key: null, content: general.trim(), make_rule: false, author: session.user.id })
  if (rows.length) {
    const { data: saved } = await supabase.from('review_comments').insert(rows).select('id, content, make_rule')
    const proposals = (saved || []).filter(c => c.make_rule).map(c => ({ rule_type: 'instrukcja', pattern: c.content, language: ctx.channel.language, source_comment_id: c.id, status: 'propozycja', created_by: session.user.id }))
    if (proposals.length) await supabase.from('qa_rules').insert(proposals)
  }
  await supabase.from('descriptions').update({ status: 'poprawki' }).eq('id', desc.id)
  const ins = await supabase.from('descriptions').insert({ family_id: desc.family_id, product_id: desc.product_id, channel_id: desc.channel_id, template_id: ctx.template.id,
    is_base: desc.is_base, parent_id: desc.parent_id, version: desc.version + 1, fields: desc.fields, translation_pl: desc.translation_pl, meta: desc.meta,
    status: 'generowanie', created_by: session.user.id }).select('id').single()
  if (ins.error) throw new Error(ins.error.message)
  onCreated?.(ins.data.id)
  const product = ctx.product?.id === desc.product_id ? ctx.product : (await supabase.from('products').select('*').eq('id', desc.product_id).single()).data
  await launch(ins.data.id, payloadFrom({ ...ctx, product, facts: ctx.facts.length ? ctx.facts : [] }, {
    mode: 'sections', sections, comments: comments.filter(c => c.text.trim()), general_comment: general.trim(),
    current_fields: desc.fields, current_translation: desc.translation_pl, keyword_map: desc.meta?.keyword_map,
  }))
  await supabase.from('review_comments').update({ status: 'uwzgledniona' }).eq('description_id', desc.id).eq('status', 'otwarta')
  return ins.data.id
}

// Warianty z zaakceptowanego opisu bazowego: paczki po 6 SKU w jednym wykonaniu n8n
export async function generateVariants(base, { onlyMissing = true } = {}) {
  const ctx = await buildContext(base.family_id, base.channel_id)
  if (!ctx.template) throw new Error('Brak aktywnego szablonu')
  if (base.status !== 'zaakceptowany') throw new Error('Najpierw zaakceptuj opis bazowy')
  const [{ data: products }, { data: existing }, { data: baseProduct }] = await Promise.all([
    supabase.from('products').select('*').eq('family_id', base.family_id),
    supabase.from('descriptions').select('product_id, version, status').eq('family_id', base.family_id).eq('channel_id', base.channel_id).eq('is_base', false).order('version', { ascending: false }),
    supabase.from('products').select('*').eq('id', base.product_id).single(),
  ])
  const latest = {}
  for (const d of existing || []) if (!latest[d.product_id]) latest[d.product_id] = d
  const todo = (products || []).filter(p => p.id !== base.product_id && (!onlyMissing || !['zaakceptowany', 'opublikowany', 'generowanie'].includes(latest[p.id]?.status)))
  if (!todo.length) return 0
  const { data: { session } } = await supabase.auth.getSession()
  const rows = todo.map(p => ({ family_id: base.family_id, product_id: p.id, channel_id: base.channel_id, template_id: ctx.template.id, is_base: false,
    parent_id: base.id, version: (latest[p.id]?.version || 0) + 1, status: 'generowanie', created_by: session.user.id }))
  const { data: created, error } = await supabase.from('descriptions').insert(rows).select('id, product_id')
  if (error) throw new Error(error.message)
  const common = {
    market: `${ctx.channel.marketplace} ${ctx.channel.language.toUpperCase()}`, language: ctx.channel.language, brand: ctx.brand.name,
    family: { model_name: ctx.family.model_name, series: ctx.family.series, category: ctx.family.category },
    facts: ctx.facts.map(f => f.content), keywords: ctx.keywords.slice(0, 80), limits: ctx.channel.limits || {}, forbidden: ctx.forbidden, instructions: ctx.instructions,
    template: { sections: ctx.template.sections.filter(s => s && s.enabled !== false), styles: ctx.template.styles },
    base: { sku: baseProduct.sku, attributes: baseProduct.attributes, fields: base.fields, translation_pl: base.translation_pl, keyword_map: base.meta?.keyword_map, approved_by: base.approved_by },
  }
  const byId = Object.fromEntries(todo.map(p => [p.id, p]))
  const variants = created.map(c => { const p = byId[c.product_id]; return { description_id: c.id, sku: p.sku, attributes: p.attributes,
    facts: ctx.factPool.filter(f => ['model', 'wariant'].includes(f.level) && applies(f, ctx.family, ctx.brandFams, p)).map(f => f.content),
    images: resolveImages(ctx.template, { brand_id: ctx.family.brand_id, family: ctx.family, product: p, library: ctx.library }) } })
  for (let i = 0; i < variants.length; i += 6) {
    const chunk = variants.slice(i, i + 6)
    try { await startJob('generate_variants', { ...common, variants: chunk }) }
    catch (e) {
      await supabase.from('descriptions').update({ status: 'blad', qa: { pass: false, errors: [e.message], warnings: [] } }).in('id', chunk.map(v => v.description_id))
      throw e
    }
  }
  return variants.length
}
