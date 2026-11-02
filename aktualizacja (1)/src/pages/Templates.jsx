import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { copyTemplates, createBlankTemplates } from '../channels.js'
import { supabase, plError } from '../supabase.js'
import { renderDescription, resolveImages, DEFAULT_STYLES, FTP_ASSETS, ftpLink, OUTPUT_PRESETS } from '../render.js'
import DrainLoader from '../components/DrainLoader.jsx'

function sampleFields(template) {
  const f = { HERO_IMG_ALT: 'Baner', HERO_H1: 'Brodzik akrylowy Aedler Antis 90x90 cm, Smooth White', HERO_LEAD: 'Tu pojawi się lead: 1–2 zdania z najważniejszymi korzyściami i frazą główną.', FAQ_H2: 'Najczęściej zadawane pytania' }
  for (const s of template.sections || []) {
    if (s?.type !== 'content') continue
    const k = s.key
    Object.assign(f, {
      [`${k}_H2`]: s.topic || k, [`${k}_P`]: `Akapit sekcji „${s.topic || k}” – AI napisze go wyłącznie z faktów zatwierdzonych w księdze wiedzy.`,
      [`${k}_P_BOLD`]: 'Zdanie z najmocniejszym dowodem.', [`${k}_LI1`]: 'Pierwszy konkretny atut', [`${k}_LI2`]: 'Drugi konkretny atut',
      [`${k}_AKCENT`]: 'Wyróżnik marki', [`${k}_IMG_ALT`]: s.topic || k,
    })
  }
  ;[1, 2, 3].forEach(i => { f[`FAQ_Q${i}`] = `Przykładowe pytanie klienta ${i}?`; f[`FAQ_A${i}`] = 'Odpowiedź wyłącznie na podstawie faktów.' })
  return f
}

const SEC_NAME = { hero: 'Nagłówek (hero)', content: 'Sekcja treści', faq: 'FAQ' }

function TemplateEditor({ profile, templateId, crumbs }) {
  const [list, setList] = useState(null)
  const [names, setNames] = useState({})
  const [sel, setSel] = useState(null)
  const [draft, setDraft] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const [library, setLibrary] = useState([])
  const [prodRoles, setProdRoles] = useState([])
  const [samples, setSamples] = useState([])
  const [sampleId, setSampleId] = useState('')
  const [imgState, setImgState] = useState({})
  const [showCode, setShowCode] = useState(false)
  const admin = profile?.role === 'admin'

  async function load(keepId) {
    const [t, c, b] = await Promise.all([
      supabase.from('templates').select('*').order('name'),
      supabase.from('channels').select('id, marketplace, language'),
      supabase.from('brands').select('id, name'),
    ])
    if (t.error) { setMsg({ type: 'error', text: plError(t.error.message) }); return }
    const [lib, ir, fams, prods] = await Promise.all([supabase.from('media_library').select('*'), supabase.from('import_rules').select('value').eq('attribute', 'zdjecie'),
      supabase.from('product_families').select('id, brand_id, model_name, series, technologies'), supabase.from('products').select('id, sku, family_id, attributes, images').limit(2000)])
    setLibrary(lib.data || []); setProdRoles([...new Set((ir.data || []).map(x => x.value))])
    const famById = Object.fromEntries((fams.data || []).map(f => [f.id, f]))
    const list = (prods.data || []).filter(p => famById[p.family_id]).map(p => ({ ...p, family: famById[p.family_id] })).sort((a, b) => a.sku.localeCompare(b.sku))
    setSamples(list); setSampleId(id => id || list[0]?.id || '')
    setList(t.data); setNames({ c: c.data || [], b: b.data || [] })
    const pick = t.data.find(x => x.id === (keepId || templateId))
    if (pick) { setSel(pick.id); setDraft({ sections: pick.sections, styles: { ...DEFAULT_STYLES, ...pick.styles } }) }
  }
  useEffect(() => { load() }, [])

  const current = list?.find(t => t.id === sel)
  const PLACEHOLDER = role => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="920" height="320"><rect width="100%" height="100%" fill="#E6E8E5"/><text x="50%" y="50%" fill="#4A5672" font-family="Arial" font-size="22" text-anchor="middle">Zdjęcie produktu z Base: ${role || 'pierwsze'}</text></svg>`)
  const sample = samples.find(p => p.id === sampleId) || null
  const sampleCtx = sample ? { brand_id: sample.family.brand_id, family: sample.family, product: sample, library } : null
  const preview = useMemo(() => {
    if (!draft) return ''
    let imgs = {}
    if (sampleCtx) imgs = resolveImages(draft, sampleCtx)
    for (const sec of draft.sections.filter(x => x && x.enabled !== false && x.type !== 'faq')) {
      const src = sec.image_source || 'static'
      if (imgs[sec.key]) continue
      if (src === 'static' && sec.image_url) imgs[sec.key] = sec.image_url
      if (src === 'library') { const hit = library.find(m => (m.role || '').toLowerCase() === (sec.image_role || '').toLowerCase()); if (hit || sec.image_url) imgs[sec.key] = hit ? hit.url : sec.image_url }
      if (src === 'product') imgs[sec.key] = PLACEHOLDER(sec.image_role)
    }
    return renderDescription(sampleFields(draft), draft, imgs)
  }, [draft, library, sampleId, samples])
  const dirty = current && draft && JSON.stringify({ s: current.sections, st: { ...DEFAULT_STYLES, ...current.styles } }) !== JSON.stringify({ s: draft.sections, st: draft.styles })

  const setSec = (i, patch) => setDraft(d => ({ ...d, sections: d.sections.map((s, j) => j === i ? { ...s, ...patch } : s) }))
  const move = (i, dir) => setDraft(d => { const a = [...d.sections]; const j = i + dir; if (j < 0 || j >= a.length) return d; [a[i], a[j]] = [a[j], a[i]]; return { ...d, sections: a } })
  const setStyle = (k, v) => setDraft(d => ({ ...d, styles: { ...d.styles, [k]: v } }))
  const output = { ...OUTPUT_PRESETS.standard.output, ...(draft?.styles?.output || {}) }
  const setOut = patch => setStyle('output', { ...output, ...patch })
  const presetOf = o => o.mode === 'standard' && !o.allowed_tags && o.keep_styles !== false && o.images !== false ? 'standard' : (o.html === OUTPUT_PRESETS.kaufland.output.html ? 'kaufland' : 'custom')
  function pickPreset(key) {
    if (key === 'custom' && output.mode === 'custom') return
    const base = OUTPUT_PRESETS[key].output
    setStyle('output', key === 'custom' ? { ...base, html: output.html || OUTPUT_PRESETS.kaufland.output.html, allowed_tags: output.allowed_tags } : { ...base })
  }
  function addSection() {
    const used = draft.sections.map(s => s.key)
    let n = 1; while (used.includes(`S${n}`)) n++
    if (n > 9) return
    const faqAt = draft.sections.findIndex(s => s.type === 'faq')
    const a = [...draft.sections]; a.splice(faqAt < 0 ? a.length : faqAt, 0, { key: `S${n}`, type: 'content', enabled: true, topic: 'Nowa sekcja', image_source: 'none', image_url: '', list: true, bold: true, accent: false })
    setDraft({ ...draft, sections: a })
  }

  async function upload(i, file) {
    if (!file) return
    setBusy(true); setMsg(null)
    const path = `szablony/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`
    const { error } = await supabase.storage.from('images').upload(path, file, { contentType: file.type })
    if (error) setMsg({ type: 'error', text: plError(error.message) })
    else setSec(i, { image_url: supabase.storage.from('images').getPublicUrl(path).data.publicUrl })
    setBusy(false)
  }

  async function save() {
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('templates').update({ sections: draft.sections, styles: draft.styles, version: (current.version || 1) + 1 }).eq('id', current.id)
    setMsg(error ? { type: 'error', text: plError(error.message) } : { type: 'ok', text: `Zapisano wersję ${(current.version || 1) + 1}. Nowe opisy powstaną według tej wersji.` })
    setBusy(false); if (!error) load(current.id)
  }

  if (!list) return <section className="page"><DrainLoader /></section>
  if (!current) return <section className="page wide">{crumbs}<p className="error">Nie znaleziono szablonu.</p></section>
  const label = t => { const c = names.c.find(x => x.id === t.channel_id); const b = names.b.find(x => x.id === t.brand_id); return `${b?.name || ''} · ${c ? `${c.marketplace} ${c.language.toUpperCase()}` : ''} · ${t.category || 'domyślny'}` }


  return (
    <section className="page wide">
      {crumbs}
      <header className="page-head">
        <h1>{current.category ? `Szablon: ${current.category}` : 'Szablon domyślny'}</h1>
        <span className="muted small">{label(current)} · wersja {current.version}</span>
      </header>
      {!admin && <p className="hint">Szablony edytuje admin. Możesz oglądać podgląd.</p>}
      {draft && (
        <div className="tpl-grid">
          <div className="tpl-editor">
            <div className="panel">
              <h2>Sekcje</h2>
              <p className="muted small">Kolejność z góry na dół = kolejność w opisie. Temat podpowiada AI, o czym pisać; sekcja bez pasujących faktów zniknie z opisu.</p>
              {draft.sections.map((s, i) => (
                <div key={s.key} className={'sec-row' + (s.enabled === false ? ' off' : '')}>
                  <div className="sec-head">
                    <label className="check"><input type="checkbox" checked={s.enabled !== false} disabled={!admin} onChange={e => setSec(i, { enabled: e.target.checked })} /> <strong>{SEC_NAME[s.type]}</strong> <span className="muted">{s.type === 'content' ? s.key : ''}</span></label>
                    {admin && <span className="sec-move"><button className="link-dark" onClick={() => move(i, -1)} aria-label="W górę">↑</button><button className="link-dark" onClick={() => move(i, 1)} aria-label="W dół">↓</button></span>}
                  </div>
                  {s.type === 'content' && (
                    <>
                      <label>Temat sekcji<input value={s.topic || ''} disabled={!admin} onChange={e => setSec(i, { topic: e.target.value })} /></label>
                      <div className="sec-opts">
                        <label className="check"><input type="checkbox" checked={s.list !== false} disabled={!admin} onChange={e => setSec(i, { list: e.target.checked })} /> lista punktów</label>
                        <label className="check"><input type="checkbox" checked={s.bold !== false} disabled={!admin} onChange={e => setSec(i, { bold: e.target.checked })} /> pogrubione zdanie</label>
                        <label className="check"><input type="checkbox" checked={!!s.accent} disabled={!admin} onChange={e => setSec(i, { accent: e.target.checked })} /> wyróżnik</label>
                      </div>
                    </>
                  )}
                  {s.type === 'faq' && (
                    <label>Liczba pytań (max)<input type="number" min="1" max="6" value={s.max_questions || 6} disabled={!admin} onChange={e => setSec(i, { max_questions: Math.min(6, Math.max(1, Number(e.target.value) || 1)) })} /></label>
                  )}
                  {s.type !== 'faq' && (
                    <>
                      <div className="img-row">
                        <label>Obrazek<select value={s.image_source || 'static'} disabled={!admin} onChange={e => setSec(i, { image_source: e.target.value })}>
                          <option value="none">brak</option><option value="static">stały (wgrany do szablonu)</option>
                          <option value="library">z biblioteki grafik</option><option value="product">zdjęcie produktu z Base</option>
                          <option value="ftp">z serwera wg konwencji (link automatyczny)</option></select></label>
                        {s.image_source === 'ftp' && (
                          <label>Zasób<select value={s.ftp_x || '1'} disabled={!admin} onChange={e => setSec(i, { ftp_x: e.target.value })}>
                            {FTP_ASSETS.map(a => <option key={a.x} value={a.x}>{a.label}</option>)}</select></label>
                        )}
                        {['library', 'product'].includes(s.image_source) && (
                          <label>Rola<input list={s.image_source === 'library' ? 'roles-lib' : 'roles-prod'} value={s.image_role || ''} disabled={!admin} placeholder={s.image_source === 'product' ? 'puste = pierwsze zdjęcie' : 'np. baner'} onChange={e => setSec(i, { image_role: e.target.value })} /></label>
                        )}
                      </div>
                      {s.image_source === 'ftp' && (() => {
                        const l = sample ? ftpLink(s, { family: sample.family, product: sample }, draft.styles.asset_base) : { url: null, why: 'wybierz produkt do podglądu' }
                        const st = l.url ? imgState[l.url] : null
                        return (
                          <p className="ftp-link small">
                            {l.url ? <><a href={l.url} target="_blank" rel="noreferrer">{l.url.replace(/^https?:\/\/[^/]+/, '')}</a>
                              <img src={l.url} alt="" hidden onLoad={() => setImgState(x => ({ ...x, [l.url]: 'ok' }))} onError={() => setImgState(x => ({ ...x, [l.url]: 'brak' }))} />
                              {' '}{st === 'ok' ? <span className="tag okt">plik istnieje</span> : st === 'brak' ? <span className="tag err">brak pliku na serwerze</span> : <span className="muted">sprawdzanie…</span>}</>
                              : <span className="muted">Link nie powstanie: {l.why}</span>}
                            {sample && <span className="muted"> · dla {sample.sku}</span>}
                          </p>
                        )
                      })()}
                      {['static', 'library'].includes(s.image_source || 'static') && (
                        <div className="img-row">
                          <label>{s.image_source === 'library' ? 'Adres zapasowy (gdy biblioteka nie ma grafiki)' : 'Adres HTTPS'}<input value={s.image_url || ''} disabled={!admin} placeholder="brak" onChange={e => setSec(i, { image_url: e.target.value.trim() })} /></label>
                          {admin && <label className="btn ghost upload">Wgraj<input type="file" accept="image/*" hidden onChange={e => upload(i, e.target.files?.[0])} /></label>}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
              {admin && <button className="link-dark" onClick={addSection}>+ Dodaj sekcję treści</button>}
            </div>
            <div className="panel">
              <h2>Format HTML</h2>
              <label>Format<select value={presetOf(output)} disabled={!admin} onChange={e => pickPreset(e.target.value)}>
                {Object.entries(OUTPUT_PRESETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
              {output.mode === 'custom' && (
                <>
                  <label>Szkielet HTML<textarea className="code" rows={12} value={output.html} disabled={!admin} onChange={e => setOut({ html: e.target.value })} spellCheck={false} /></label>
                  <details className="fields-help"><summary className="small">Dostępne pola</summary>
                    <p className="small"><code>{'{{TYTUL}}'}</code> <code>{'{{LEAD}}'}</code> <code>{'{{HERO_IMG}}'}</code> · pętla sekcji <code>{'{{#sekcje}}…{{/sekcje}}'}</code> z polami <code>{'{{H2}} {{P}} {{P_BOLD}} {{AKCENT}} {{IMG}} {{IMG_ALT}}'}</code>, lista punktów <code>{'{{#MA_LI}}<ul>{{#LI}}<li>{{.}}</li>{{/LI}}</ul>{{/MA_LI}}'}</code> · FAQ <code>{'{{#MA_FAQ}}{{FAQ_H2}}{{/MA_FAQ}}'}</code>, <code>{'{{#faq}}{{Q}} {{A}}{{/faq}}'}</code> · konkretne pole sekcji, np. <code>{'{{S1_H2}}'}</code>, <code>{'{{S2_LI1}}'}</code>, <code>{'{{S1_IMG}}'}</code>.</p>
                    <p className="small"><code>{'{{#pole}}…{{/pole}}'}</code> pokazuje fragment tylko, gdy pole nie jest puste; <code>{'{{^pole}}…{{/pole}}'}</code> – gdy jest puste. Treść AI wstawiaj zawsze w podwójnych nawiasach – są bezpiecznie escapowane.</p>
                  </details>
                </>
              )}
              <div className="grid-form">
                <label className="span-all">Dozwolone znaczniki<input value={output.allowed_tags} disabled={!admin} onChange={e => setOut({ allowed_tags: e.target.value })} placeholder="puste = bez ograniczeń, np. h2, h3, p, ul, li, b" /></label>
                <label>Limit znaków HTML<input type="number" min="0" step="100" value={output.max_chars || 0} disabled={!admin} onChange={e => setOut({ max_chars: Number(e.target.value) || 0 })} /></label>
              </div>
              <label className="check"><input type="checkbox" checked={output.keep_styles !== false} disabled={!admin} onChange={e => setOut({ keep_styles: e.target.checked })} /> zachowaj style (atrybut style)</label>
              <label className="check"><input type="checkbox" checked={output.images !== false} disabled={!admin} onChange={e => setOut({ images: e.target.checked })} /> zachowaj obrazki</label>
              <p className="muted small">Znaczniki spoza listy są usuwane po wygenerowaniu (treść zostaje), skrypty i atrybuty zdarzeń zawsze. Opis dłuższy niż limit nie przejdzie QA. 0 = bez limitu.</p>
            </div>
            <div className="panel">
              <h2>Wygląd</h2>
              {output.mode === 'custom' && <p className="hint">Przy własnym szkielecie HTML kolory i rozmiary poniżej nie są używane – wygląd określa szkielet.</p>}
              <div className="grid-form">
                <label>Kolor tekstu<input type="color" value={draft.styles.text_color} disabled={!admin} onChange={e => setStyle('text_color', e.target.value)} /></label>
                <label>Kolor nagłówków<input type="color" value={draft.styles.heading_color} disabled={!admin} onChange={e => setStyle('heading_color', e.target.value)} /></label>
                <label>Kolor wyróżnika<input type="color" value={draft.styles.accent_color} disabled={!admin} onChange={e => setStyle('accent_color', e.target.value)} /></label>
                <label>Tekst (px)<input type="number" min="12" max="20" value={draft.styles.font_size} disabled={!admin} onChange={e => setStyle('font_size', Number(e.target.value))} /></label>
                <label>Tytuł (px)<input type="number" min="18" max="40" value={draft.styles.h1_size} disabled={!admin} onChange={e => setStyle('h1_size', Number(e.target.value))} /></label>
                <label>Nagłówki sekcji (px)<input type="number" min="16" max="32" value={draft.styles.h2_size} disabled={!admin} onChange={e => setStyle('h2_size', Number(e.target.value))} /></label>
                <label>Maks. szerokość (px)<input type="number" min="600" max="1400" step="10" value={draft.styles.max_width} disabled={!admin} onChange={e => setStyle('max_width', Number(e.target.value))} /></label>
                <label className="span-all">Adres katalogu grafik na serwerze<input value={draft.styles.asset_base || ''} disabled={!admin} onChange={e => setStyle('asset_base', e.target.value.trim())} placeholder="https://schedpol.nazwa.pl/AEDLER/" /></label>
                <label>Znacznik tytułu<select value={draft.styles.hero_tag} disabled={!admin} onChange={e => setStyle('hero_tag', e.target.value)}><option value="h1">H1</option><option value="h2">H2</option></select></label>
              </div>
              <p className="muted small">eMAG wyświetla nazwę produktu jako H1 strony. Tytuł w opisie jako H2 unika dwóch H1 na jednej stronie – wygląd się nie zmienia.</p>
            </div>
            {admin && <button className="btn" onClick={save} disabled={!dirty || busy}>{busy ? 'Zapisywanie…' : dirty ? 'Zapisz nową wersję' : 'Brak zmian'}</button>}
            {msg && <p className={msg.type} role="status">{msg.text}</p>}
          </div>
          <div className="tpl-preview">
            <div className="preview-label">Podgląd z przykładową treścią
              {samples.length > 0 && <select className="sample-pick" value={sampleId} onChange={e => setSampleId(e.target.value)} aria-label="Produkt do podglądu grafik">
                {samples.map(p => <option key={p.id} value={p.id}>{p.sku} · {p.family.model_name} · {[p.attributes?.ksztalt, p.attributes?.wykonczenie].filter(Boolean).join(', ')}</option>)}
              </select>}</div>
            <datalist id="roles-lib">{[...new Set(['baner', ...library.map(m => m.role)])].map(r => <option key={r} value={r} />)}</datalist>
            <datalist id="roles-prod">{[...new Set(['packshot', 'rysunek techniczny', 'aranżacja 1', 'aranżacja 2', 'infografika', ...prodRoles])].map(r => <option key={r} value={r} />)}</datalist>
            <div className="preview-tools">
              <button className="link-dark" onClick={() => setShowCode(v => !v)}>{showCode ? 'Pokaż podgląd' : 'Pokaż kod HTML'}</button>
              <span className={output.max_chars && preview.length > output.max_chars ? 'tag err' : 'muted small'}>{preview.length} znaków HTML{output.max_chars ? ` / limit ${output.max_chars}` : ''}</span>
            </div>
            {showCode ? <pre className="code-view">{preview}</pre> : <div className="preview-frame" dangerouslySetInnerHTML={{ __html: preview }} />}
          </div>
        </div>
      )}
    </section>
  )
}

// ===== Nawigacja: kanał sprzedaży → rynek → kategoria → edytor =====
function CopyPanel({ admin, channel, channels, brands, onDone }) {
  const nav = useNavigate()
  const [brandId, setBrandId] = useState(brands[0]?.id || '')
  const [fmt, setFmt] = useState(/kaufland/i.test(channel.marketplace) ? 'kaufland' : '')
  const [src, setSrc] = useState(channels.find(c => c.code === 'emag_ro')?.id || channels[0]?.id || '')
  const [state, setState] = useState(null)
  const formats = Object.entries(OUTPUT_PRESETS).filter(([k]) => k !== 'custom')
  async function blank() {
    setState({ busy: true })
    try {
      const r = await createBlankTemplates(channel, brands.filter(b => b.id === brandId), fmt || 'standard')
      if (r.ids[0]) nav(`/szablony/${encodeURIComponent(channel.marketplace)}/${channel.id}/${r.ids[0]}`); else { setState({ ok: 'Szablon dla tej marki już istnieje.' }); onDone() }
    } catch (e) { setState({ err: plError(e.message) }) }
  }
  async function copy() {
    setState({ busy: true })
    try { const r = await copyTemplates(channels.find(c => c.id === src), channel, fmt); setState({ ok: `Skopiowano szablony: ${r.copied}.` }); onDone() }
    catch (e) { setState({ err: plError(e.message) }) }
  }
  if (!admin) return <div className="panel empty"><p className="muted">Na tym rynku nie ma jeszcze szablonów. Szablony dodaje admin.</p></div>
  return (
    <div className="panel">
      <h2>Na tym rynku nie ma jeszcze szablonów</h2>
      <div className="copy-row left">
        {brands.length > 1 && <label>Marka<select value={brandId} onChange={e => setBrandId(e.target.value)}>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>}
        <label>Format HTML<select value={fmt} onChange={e => setFmt(e.target.value)}><option value="">eMAG – bogaty HTML (domyślny)</option>{formats.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        <button className="btn" onClick={blank} disabled={state?.busy || !brandId}>{state?.busy ? 'Tworzenie…' : 'Nowy szablon od zera'}</button>
      </div>
      <p className="muted small">Powstanie szablon domyślny ze standardowymi sekcjami (tytuł, 5 sekcji treści, FAQ) w wybranym formacie – od razu otworzy się edytor.</p>
      {channels.length > 0 && (
        <details><summary className="small">albo skopiuj szablony z innego rynku</summary>
          <div className="copy-row left">
            <label>Rynek źródłowy<select value={src} onChange={e => setSrc(e.target.value)}>{channels.map(c => <option key={c.id} value={c.id}>{c.marketplace} {c.language.toUpperCase()}</option>)}</select></label>
            <button className="btn ghost" onClick={copy} disabled={state?.busy}>Skopiuj szablony</button>
          </div>
        </details>
      )}
      {state?.ok && <p className="ok">{state.ok}</p>}{state?.err && <p className="error">{state.err}</p>}
    </div>
  )
}

const LANG_NAME = { ro: 'Rumunia', hu: 'Węgry', bg: 'Bułgaria', de: 'Niemcy', pl: 'Polska', fr: 'Francja' }
const enc = encodeURIComponent

function Crumbs({ mp, ch, tpl }) {
  return (
    <div className="crumbs" role="navigation" aria-label="Ścieżka">
      <Link to="/szablony">Szablony</Link>
      {mp && <><span>›</span>{ch ? <Link to={`/szablony/${enc(mp)}`}>{mp}</Link> : <strong>{mp}</strong>}</>}
      {ch && <><span>›</span>{tpl ? <Link to={`/szablony/${enc(mp)}/${ch.id}`}>{ch.language.toUpperCase()}</Link> : <strong>{ch.language.toUpperCase()}</strong>}</>}
      {tpl && <><span>›</span><strong>{tpl.category || 'domyślny'}</strong></>}
    </div>
  )
}

export default function Templates({ profile }) {
  const { mp, ch: chId, tid } = useParams()
  const nav = useNavigate()
  const [d, setD] = useState(null)
  const [msg, setMsg] = useState(null)
  const admin = profile?.role === 'admin'

  async function load() {
    const [t, c, b, f] = await Promise.all([
      supabase.from('templates').select('id, channel_id, brand_id, name, category, version, status, sections').order('name'),
      supabase.from('channels').select('id, code, marketplace, language, active').order('code'),
      supabase.from('brands').select('id, name'),
      supabase.from('product_families').select('brand_id, category'),
    ])
    setD({ templates: t.data || [], channels: c.data || [], brands: b.data || [], families: f.data || [] })
  }
  useEffect(() => { load() }, [])
  if (!d) return <section className="page"><DrainLoader /></section>

  const channel = d.channels.find(c => c.id === chId)
  const tpl = d.templates.find(t => t.id === tid)
  if (tid) return <TemplateEditor key={tid} profile={profile} templateId={tid} crumbs={<Crumbs mp={mp} ch={channel} tpl={tpl} />} />

  const brandName = id => d.brands.find(b => b.id === id)?.name || '—'
  const active = d.templates.filter(t => t.status === 'aktywny')
  const order = { ro: 1, hu: 2, bg: 3 }

  // 1) kanały sprzedaży
  if (!mp) {
    const mps = [...new Set(d.channels.map(c => c.marketplace))]
    return (
      <section className="page wide">
        <h1>Szablony</h1>
        <p className="muted lead">Wybierz kanał sprzedaży, potem rynek i kategorię. Generacja używa szablonu kategorii produktu, a jeśli go nie ma – szablonu domyślnego dla rynku.</p>
        <div className="nav-cards">
          {mps.map(m => {
            const chs = d.channels.filter(c => c.marketplace === m)
            const n = active.filter(t => chs.some(c => c.id === t.channel_id)).length
            return (
              <Link key={m} to={`/szablony/${enc(m)}`} className="nav-card">
                <strong>{m}</strong>
                <span className="muted">{chs.length} {chs.length === 1 ? 'rynek' : chs.length < 5 ? 'rynki' : 'rynków'} · {n} szablonów</span>
                <span className="nav-tags">{chs.sort((a, b) => (order[a.language] || 9) - (order[b.language] || 9)).map(c => <span key={c.id} className={c.active ? 'tag' : 'tag st-none'}>{c.language.toUpperCase()}</span>)}</span>
              </Link>
            )
          })}
        </div>
      </section>
    )
  }

  // 2) rynki kanału
  if (!chId) {
    const chs = d.channels.filter(c => c.marketplace === mp).sort((a, b) => (order[a.language] || 9) - (order[b.language] || 9))
    return (
      <section className="page wide">
        <Crumbs mp={mp} />
        <h1>{mp} – rynki</h1>
        <div className="nav-cards">
          {chs.map(c => {
            const ts = active.filter(t => t.channel_id === c.id)
            const cats = ts.filter(t => t.category).map(t => t.category)
            return (
              <Link key={c.id} to={`/szablony/${enc(mp)}/${c.id}`} className="nav-card">
                <strong>{c.marketplace} {c.language.toUpperCase()}</strong>
                <span className="muted">{LANG_NAME[c.language] || c.language}{!c.active && ' · kanał nieaktywny'}</span>
                <span className="muted small">{ts.some(t => !t.category) ? 'szablon domyślny' : 'brak szablonu domyślnego'}{cats.length ? ` + ${cats.length} kategorii: ${cats.join(', ')}` : ''}</span>
              </Link>
            )
          })}
        </div>
      </section>
    )
  }

  // 3) kategorie na rynku
  if (!channel) return <section className="page"><Crumbs mp={mp} /><p className="error">Nie znaleziono rynku.</p></section>
  const here = active.filter(t => t.channel_id === channel.id)
  const brandsHere = [...new Set([...here.map(t => t.brand_id)])]
  async function createFor(brandId, category) {
    const base = here.find(t => t.brand_id === brandId && !t.category)
    if (!base) { setMsg({ type: 'error', text: 'Najpierw potrzebny jest szablon domyślny dla tej marki i rynku.' }); return }
    const { data: full } = await supabase.from('templates').select('*').eq('id', base.id).single()
    const { data, error } = await supabase.from('templates').insert({ channel_id: channel.id, brand_id: brandId, name: `${base.name.split(' · ').slice(0, 2).join(' · ')} · ${category}`,
      sections: full.sections, styles: full.styles, version: 1, status: 'aktywny', category }).select('id').single()
    if (error) setMsg({ type: 'error', text: plError(error.message) }); else nav(`/szablony/${enc(mp)}/${channel.id}/${data.id}`)
  }
  return (
    <section className="page wide">
      <Crumbs mp={mp} ch={channel} />
      <h1>{channel.marketplace} {channel.language.toUpperCase()} – kategorie</h1>
      {msg && <p className={msg.type} role="status">{msg.text}</p>}
      {brandsHere.length === 0 && <CopyPanel admin={admin} channel={channel} brands={d.brands.filter(b => d.families.some(f => f.brand_id === b.id)).length ? d.brands.filter(b => d.families.some(f => f.brand_id === b.id)) : d.brands} channels={d.channels.filter(c => c.id !== channel.id && active.some(t => t.channel_id === c.id))} onDone={load} />}
      {brandsHere.map(bid => {
        const ts = here.filter(t => t.brand_id === bid).sort((a, b) => (a.category ? 1 : 0) - (b.category ? 1 : 0) || String(a.category).localeCompare(String(b.category), 'pl'))
        const covered = new Set(ts.map(t => t.category).filter(Boolean))
        const missing = [...new Set(d.families.filter(f => f.brand_id === bid && f.category && !covered.has(f.category)).map(f => f.category))].sort()
        return (
          <div key={bid} className="panel">
            <h2>{brandName(bid)}</h2>
            <div className="table-wrap"><table className="compact cat-table">
              <thead><tr><th>Kategoria</th><th>Sekcje</th><th>Wersja</th><th /></tr></thead>
              <tbody>
                {ts.map(t => (
                  <tr key={t.id}>
                    <td><strong>{t.category || 'domyślny'}</strong>{!t.category && <span className="muted small"> – dla kategorii bez własnego szablonu</span>}</td>
                    <td className="muted">{(t.sections || []).filter(s => s && s.enabled !== false && s.type === 'content').map(s => s.topic).join(' · ')}</td>
                    <td className="mono">v{t.version}</td>
                    <td className="actions"><Link to={`/szablony/${enc(mp)}/${channel.id}/${t.id}`}>{admin ? 'Edytuj' : 'Podgląd'}</Link></td>
                  </tr>
                ))}
                {missing.map(c => (
                  <tr key={c} className="inactive-row">
                    <td>{c}</td><td className="muted">korzysta z szablonu domyślnego</td><td />
                    <td className="actions">{admin && <button className="link-dark" onClick={() => createFor(bid, c)}>Utwórz szablon</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            {admin && <button className="link-dark" onClick={() => { const c = (prompt('Nazwa kategorii (jak w PIM, małymi literami, np. „nośniki”):') || '').trim().toLowerCase(); if (c) createFor(bid, c) }}>+ szablon dla innej kategorii</button>}
          </div>
        )
      })}
    </section>
  )
}
