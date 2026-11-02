import { Fragment, useEffect, useState } from 'react'
import { supabase, plError } from '../supabase.js'
import { runJob, PUBLISH_URL } from '../jobs.js'
import { LANGS, BASE_FORBIDDEN, DEFAULT_TITLE_PATTERN, titlePresetFor } from '../languages.js'
import { copyTemplates, deleteChannel, createBlankTemplates, activeBrands } from '../channels.js'
import TechMap from '../components/TechMap.jsx'
import PlanUsage from '../components/PlanUsage.jsx'
import { OUTPUT_PRESETS } from '../render.js'

const plN = (n, one, few, many) => `${n} ${n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? few : many}`
const MARKETPLACES = ['eMAG', 'Kaufland', 'Allegro', 'Amazon', 'Empik', 'Cdiscount']
const escapeRx = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const codeOf = (mp, lang) => `${mp.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '')}_${lang}`

function AddChannel({ channels, onAdded }) {
  const empty = { marketplace: '', language: 'de', code: '', src: '', bl_lang: '', desc_field: 'description', title_max: 200, title_pattern: '', active: true, copy_from: '', format: '', banks: true, qa: true }
  const [f, setF] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState(null)
  const set = patch => setF(x => { const n = { ...x, ...patch }; if ('marketplace' in patch || 'language' in patch) n.code = codeOf(n.marketplace || '', n.language); return n })
  const isAmazon = /amazon/i.test(f.marketplace)
  const dup = channels.find(c => c.marketplace.toLowerCase() === f.marketplace.trim().toLowerCase() && c.language === f.language)
  // domyślnie: kolejny rynek znanego marketplace'u → kopia z niego; nowy marketplace → szablon od zera
  const sameMp = channels.find(c => c.marketplace.toLowerCase() === f.marketplace.trim().toLowerCase())
  const tplMode = f.copy_from || (sameMp ? sameMp.id : 'blank')
  const source = tplMode !== 'blank' && tplMode !== 'none' ? channels.find(c => c.id === tplMode) : null
  // podpowiedź formatu: Kaufland → prosty HTML
  useEffect(() => {
    if (/kaufland/i.test(f.marketplace) && !f.format) setF(x => ({ ...x, format: 'kaufland' }))
    const tp = titlePresetFor(f.marketplace)
    if (tp) setF(x => ({ ...x, title_pattern: x.title_pattern || tp.pattern, title_max: x.title_max === 200 ? tp.max : x.title_max }))
  }, [f.marketplace])

  async function add(e) {
    e.preventDefault(); if (dup || !f.marketplace.trim()) return
    setBusy(true); const steps = []
    try {
      // 1) kanał
      const { data: ch, error } = await supabase.from('channels').insert({
        code: f.code.trim() || codeOf(f.marketplace, f.language), marketplace: f.marketplace.trim(), language: f.language,
        baselinker_source_id: f.src.trim() || null, bl_text_lang: f.bl_lang.trim() || null, bl_desc_field: f.desc_field.trim() || 'description', bl_name_field: 'name',
        limits: { ...(source?.limits || {}), title_max: Number(f.title_max) || 200, title_pattern: f.title_pattern.trim() || DEFAULT_TITLE_PATTERN }, active: isAmazon ? false : f.active,
      }).select().single()
      if (error) throw error
      steps.push(`Kanał ${ch.marketplace} ${ch.language.toUpperCase()} utworzony${isAmazon ? ' jako nieaktywny (Amazon wymaga osobnego formatu opisu)' : ''}.`)
      // 2) szablony: kopia z innego rynku albo nowe od zera (dla każdej marki z produktami)
      let blankNeeded = tplMode === 'blank'
      if (source) {
        const r = await copyTemplates(source, ch, f.format)
        if (r.copied) steps.push(`Skopiowano ${plN(r.copied, 'szablon', 'szablony', 'szablonów')} z ${source.marketplace} ${source.language.toUpperCase()}${r.withCategories ? ' (domyślny + kategorie)' : ''}${f.format ? `, format: ${OUTPUT_PRESETS[f.format].label}` : ''}.`)
        else { steps.push(`Rynek ${source.marketplace} ${source.language.toUpperCase()} nie ma szablonów do skopiowania – tworzę szablon od zera.`); blankNeeded = true }
      }
      if (blankNeeded) {
        const brands = await activeBrands()
        const r = await createBlankTemplates(ch, brands, f.format || 'standard')
        steps.push(`Utworzono ${plN(r.created, 'nowy szablon', 'nowe szablony', 'nowych szablonów')} od zera (${brands.map(b => b.name).join(', ')}), format: ${OUTPUT_PRESETS[f.format || 'standard'].label}. Dostosuj sekcje w zakładce Szablony.`)
      }
      // 3) banki fraz dla wszystkich kategorii w nowym języku (puste frazy startowe – do uzupełnienia w języku rynku)
      if (f.banks) {
        const [{ data: banks }, { data: fams }] = await Promise.all([supabase.from('keyword_banks').select('category, language'), supabase.from('product_families').select('category')])
        const cats = [...new Set([...(banks || []).map(b => b.category), ...(fams || []).map(x => x.category)].filter(Boolean))]
        const todo = cats.filter(c => !(banks || []).some(b => b.category === c && b.language === f.language))
        if (todo.length) { const r = await supabase.from('keyword_banks').insert(todo.map(category => ({ category, language: f.language, location_code: LANGS[f.language].location, seeds: [] }))); if (r.error) throw r.error }
        steps.push(todo.length ? `Założono ${plN(todo.length, 'bank', 'banki', 'banków')} fraz (${LANGS[f.language].name}): ${todo.join(', ')}. Frazy startowe są puste – uzupełnij je w zakładce Frazy kluczowe.` : `Banki fraz w języku „${LANGS[f.language].name}” już istnieją.`)
      }
      // 4) podstawowe reguły QA dla języka
      if (f.qa && BASE_FORBIDDEN[f.language]) {
        const { data: existing } = await supabase.from('qa_rules').select('pattern').eq('language', f.language)
        const add = BASE_FORBIDDEN[f.language].map(escapeRx).filter(p => !(existing || []).some(x => x.pattern.toLowerCase() === p.toLowerCase()))
        if (add.length) { const r = await supabase.from('qa_rules').insert(add.map(pattern => ({ rule_type: 'zakazany_wzorzec', pattern, language: f.language, status: 'aktywna' }))); if (r.error) throw r.error }
        steps.push(add.length ? `Dodano ${plN(add.length, 'zakazane sformułowanie', 'zakazane sformułowania', 'zakazanych sformułowań')} QA (${f.language.toUpperCase()}) – do przejrzenia w Regułach QA.` : 'Reguły QA dla tego języka już istnieją.')
      }
      setLog({ type: 'ok', steps }); setF(empty); onAdded()
    } catch (err) { setLog({ type: 'error', steps: [...steps, plError(err.message)] }) } finally { setBusy(false) }
  }

  return (
    <details className="panel">
      <summary><strong>Dodaj kanał</strong> <span className="muted small">nowy marketplace albo nowy rynek istniejącego</span></summary>
      <form onSubmit={add}>
        <div className="grid-form">
          <label>Kanał sprzedaży<input list="mp-list" value={f.marketplace} onChange={e => set({ marketplace: e.target.value })} placeholder="np. Kaufland" required /></label>
          <label>Rynek / język<select value={f.language} onChange={e => set({ language: e.target.value })}>{Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v.country} ({v.name})</option>)}</select></label>
          <label>Kod kanału<input value={f.code} onChange={e => setF({ ...f, code: e.target.value })} placeholder="np. kaufland_de" /></label>
          <label>ID integracji w Baselinkerze<input list="integ-list" value={f.src} onChange={e => setF({ ...f, src: e.target.value })} placeholder="np. kaufland_42893 (można później)" /></label>
          <label>Język klucza Baselinkera<input value={f.bl_lang} onChange={e => setF({ ...f, bl_lang: e.target.value })} placeholder={`puste = ${f.language}`} /></label>
          <label>Pole opisu<input value={f.desc_field} onChange={e => setF({ ...f, desc_field: e.target.value })} /></label>
          <label>Limit tytułu (znaki)<input type="number" min="40" max="500" value={f.title_max} onChange={e => setF({ ...f, title_max: e.target.value })} /></label>
          <label className="span-all">Wzorzec tytułu (instrukcja dla AI)<input value={f.title_pattern} onChange={e => setF({ ...f, title_pattern: e.target.value })} placeholder={DEFAULT_TITLE_PATTERN} /></label>
          <label>Szablony<select value={tplMode} onChange={e => setF({ ...f, copy_from: e.target.value })}>
            <option value="blank">nowy szablon od zera</option>
            {channels.map(c => <option key={c.id} value={c.id}>skopiuj z {c.marketplace} {c.language.toUpperCase()}</option>)}
            <option value="none">bez szablonów (dodam później)</option></select></label>
          {tplMode !== 'none' && <label>Format HTML szablonów<select value={f.format} onChange={e => setF({ ...f, format: e.target.value })}>
            <option value="">{tplMode === 'blank' ? 'eMAG – bogaty HTML (domyślny)' : 'jak w szablonach źródłowych'}</option>{Object.entries(OUTPUT_PRESETS).filter(([k]) => k !== 'custom').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>}
        </div>
        <label className="check"><input type="checkbox" checked={f.banks} onChange={e => setF({ ...f, banks: e.target.checked })} /> załóż banki fraz dla wszystkich kategorii w tym języku</label>
        {BASE_FORBIDDEN[f.language] && <label className="check"><input type="checkbox" checked={f.qa} onChange={e => setF({ ...f, qa: e.target.checked })} /> dodaj podstawowe zakazane sformułowania QA ({BASE_FORBIDDEN[f.language].slice(0, 3).join(', ')}…)</label>}
        <label className="check"><input type="checkbox" checked={isAmazon ? false : f.active} disabled={isAmazon} onChange={e => setF({ ...f, active: e.target.checked })} /> kanał aktywny</label>
        {isAmazon && <p className="hint">Amazon nie przyjmuje w opisie bogatego HTML ani obrazków, a kluczowe są punkty w osobnych polach. Kanał zostanie utworzony jako nieaktywny, dopóki nie przygotujemy dla niego osobnego formatu opisu.</p>}
        {dup && <p className="error">Kanał {dup.marketplace} {dup.language.toUpperCase()} już istnieje.</p>}
        <p className="muted small">Dostępne języki to te, które obsługuje generacja w n8n. Inny język wymaga dopisania go w workflow – daj znać.</p>
        <button className="btn" disabled={busy || !!dup || !f.marketplace.trim()}>{busy ? 'Tworzenie…' : 'Dodaj kanał'}</button>
        <datalist id="mp-list">{[...new Set([...channels.map(c => c.marketplace), ...MARKETPLACES])].map(m => <option key={m} value={m} />)}</datalist>
        {log && <ul className={log.type === 'ok' ? 'ok steps' : 'error steps'} role="status">{log.steps.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      </form>
    </details>
  )
}


export default function Settings() {
  const [tab, setTab] = useState(() => (new URLSearchParams(window.location.hash.split('?')[1] || '').get('tab')) || 'kanaly')
  const [channels, setChannels] = useState([])
  const [edit, setEdit] = useState({})
  const [integ, setInteg] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState('')

  async function load() {
    const { data } = await supabase.from('channels').select('*').order('code')
    setChannels(data || []); setEdit(Object.fromEntries((data || []).map(c => [c.id, { src: c.baselinker_source_id || '', active: c.active, title_max: c.limits?.title_max ?? 200, title_pattern: c.limits?.title_pattern || '',
      lang: c.bl_text_lang || '', desc: c.bl_desc_field || 'description', name: c.bl_name_field || 'name' }])))
  }
  useEffect(() => { load() }, [])

  async function fetchIntegrations() {
    setBusy('integ'); setMsg(null)
    try { const r = await runJob('bl_integrations', {}, { url: PUBLISH_URL, timeoutSec: 60 }); setInteg(r.integrations || []) }
    catch (e) { setMsg({ type: 'error', text: e.message }) } finally { setBusy('') }
  }
  async function remove(c) {
    const others = channels.filter(x => x.id !== c.id && x.language === c.language)
    if (!confirm(`Usunąć kanał ${c.marketplace} ${c.language.toUpperCase()} razem z jego szablonami? Tej operacji nie można cofnąć.`)) return
    const withLang = !others.length && confirm(`Żaden inny kanał nie używa języka „${c.language.toUpperCase()}”. Usunąć też banki fraz i reguły QA w tym języku?\n\nOK = usuń, Anuluj = zostaw (przydadzą się przy ponownym dodaniu kanału).`)
    setBusy(c.id); setMsg(null)
    try {
      const r = await deleteChannel(c, { withLanguageData: withLang })
      if (r.blocked) setMsg({ type: 'error', text: `Kanał ${c.marketplace} ${c.language.toUpperCase()} ma już ${plN(r.blocked, 'opis', 'opisy', 'opisów')}, więc nie można go usunąć (straciłbyś historię i publikacje). Odznacz „Aktywny”, żeby go wyłączyć.` })
      else { setMsg({ type: 'ok', text: `Usunięto kanał ${c.marketplace} ${c.language.toUpperCase()}${r.langRemoved ? ` oraz dane języka (banki fraz i reguły QA: ${r.langRemoved})` : ''}.` }); load() }
    } catch (e) { setMsg({ type: 'error', text: plError(e.message) }) } finally { setBusy('') }
  }

  async function save(c) {
    const e = edit[c.id]
    if (e.src.trim() && !/^[a-z]+_\d+$/.test(e.src.trim())) {
      setMsg({ type: 'error', text: `ID integracji ma format kod_konto, np. emagro_42894 – samo „${e.src.trim()}” nie wystarczy. Kliknij „Pobierz integracje z Baselinkera” i wybierz z listy.` }); return
    }
    if (e.lang.trim() && !/^[a-z]{2}$/.test(e.lang.trim())) { setMsg({ type: 'error', text: 'Język klucza to dwie małe litery, np. ro albo bg.' }); return }
    setBusy(c.id); setMsg(null)
    const { error } = await supabase.from('channels').update({ baselinker_source_id: e.src.trim() || null, active: e.active, limits: { ...(c.limits || {}), title_max: Number(e.title_max) || 200, title_pattern: (e.title_pattern || '').trim() || null },
      bl_text_lang: e.lang.trim() || null, bl_desc_field: e.desc.trim() || 'description', bl_name_field: e.name.trim() || 'name' }).eq('id', c.id)
    setMsg(error ? { type: 'error', text: plError(error.message) } : { type: 'ok', text: `Zapisano ${c.marketplace} ${c.language.toUpperCase()}.` })
    setBusy(''); if (!error) load()
  }

  return (
    <section className="page">
      <h1>Ustawienia</h1>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'kanaly'} className={tab === 'kanaly' ? 'tab on' : 'tab'} onClick={() => setTab('kanaly')}>Kanały sprzedaży</button>
        <button role="tab" aria-selected={tab === 'technologie'} className={tab === 'technologie' ? 'tab on' : 'tab'} onClick={() => setTab('technologie')}>Mapa technologii</button>
        <button role="tab" aria-selected={tab === 'plan'} className={tab === 'plan' ? 'tab on' : 'tab'} onClick={() => setTab('plan')}>Plan i kopie</button>
      </div>
      {tab === 'technologie' && <TechMap />}
      {tab === 'plan' && <PlanUsage />}
      {tab === 'kanaly' && <>
      <div className="panel">
        <div className="panel-head">
          <h2>Kanały sprzedaży</h2>
          <button className="btn ghost top" onClick={fetchIntegrations} disabled={busy === 'integ'}>{busy === 'integ' ? 'Pobieranie…' : 'Pobierz integracje z Baselinkera'}</button>
        </div>
        <p className="muted small">ID integracji wskazuje, do którego konta marketplace w Baselinkerze trafi opis (np. emag_12345). Bez niego publikacja w danym kanale jest zablokowana.</p>
        {integ && (
          <div className="integ">
            {integ.length === 0 ? <p className="hint">Baselinker nie zwrócił integracji dla tego katalogu.</p> : integ.map(i => (
              <span key={i.source_id} className="integ-item"><code>{i.source_id}</code> <span className="muted">{i.name}</span>
                <button className="link-dark" onClick={() => navigator.clipboard.writeText(i.source_id)}>kopiuj</button></span>
            ))}
          </div>
        )}
        <div className="table-wrap">
          <table className="compact">
            <thead><tr><th>Kanał</th><th>ID integracji</th><th>Język klucza</th><th>Pole opisu</th><th>Pole tytułu</th><th>Limit tytułu</th><th>Aktywny</th><th /></tr></thead>
            <tbody>
              {channels.map(c => {
                const e = edit[c.id] || {}
                const dirty = e.src !== (c.baselinker_source_id || '') || e.active !== c.active || Number(e.title_max) !== (c.limits?.title_max ?? 200) || (e.title_pattern || '') !== (c.limits?.title_pattern || '')
                  || e.lang !== (c.bl_text_lang || '') || e.desc !== (c.bl_desc_field || 'description') || e.name !== (c.bl_name_field || 'name')
                const key = `${e.desc || 'description'}|${e.lang || c.language}|${e.src || '…'}`
                return (
                  <Fragment key={c.id}><tr>
                    <td><strong>{c.marketplace} {c.language.toUpperCase()}</strong></td>
                    <td><input value={e.src || ''} placeholder="np. emagro_42894" list="integ-list" onChange={ev => setEdit({ ...edit, [c.id]: { ...e, src: ev.target.value } })} />
                      <span className="muted small key-preview">{key}</span></td>
                    <td><input value={e.lang || ''} placeholder={c.language} onChange={ev => setEdit({ ...edit, [c.id]: { ...e, lang: ev.target.value } })} style={{ width: 70 }} /></td>
                    <td><input value={e.desc || ''} list="desc-fields" onChange={ev => setEdit({ ...edit, [c.id]: { ...e, desc: ev.target.value } })} /></td>
                    <td><input value={e.name || ''} list="name-fields" onChange={ev => setEdit({ ...edit, [c.id]: { ...e, name: ev.target.value } })} style={{ width: 90 }} /></td>
                    <td><input type="number" min="50" max="255" value={e.title_max ?? 200} onChange={ev => setEdit({ ...edit, [c.id]: { ...e, title_max: ev.target.value } })} style={{ width: 90 }} /></td>
                    <td><input type="checkbox" checked={!!e.active} onChange={ev => setEdit({ ...edit, [c.id]: { ...e, active: ev.target.checked } })} /></td>
                    <td className="nowrap"><button className="btn ghost small-btn" disabled={!dirty || busy === c.id} onClick={() => save(c)}>Zapisz</button>
                      <button className="link-dark danger-link" disabled={busy === c.id} onClick={() => remove(c)} title="Usuń kanał">Usuń</button></td>
                  </tr>
                  <tr className="sub-row"><td colSpan={8}>
                    <label className="inline-label">Wzorzec tytułu<input value={e.title_pattern || ''} placeholder={`domyślny: ${titlePresetFor(c.marketplace)?.pattern || DEFAULT_TITLE_PATTERN}`} onChange={ev => setEdit({ ...edit, [c.id]: { ...e, title_pattern: ev.target.value } })} /></label>
                  </td></tr></Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
        <datalist id="desc-fields"><option value="description">Opis</option><option value="extra_field_25423">OPIS eMAG</option><option value="description_extra1">Opis dodatkowy 1</option></datalist>
        <datalist id="name-fields"><option value="name">Nazwa produktu</option></datalist>
        <p className="muted small">Klucz pod tabelą ID to dokładne pole, do którego trafi opis. Musi istnieć na liście pól tekstowych katalogu w Baselinkerze. Pole opisu ustaw takie, jakie integracja wysyła na marketplace (np. „OPIS eMAG”). Język klucza: zostaw puste, chyba że Baselinker oczekuje innego (eMAG HU: bg).</p>
        <datalist id="integ-list">{(integ || []).map(i => <option key={i.source_id} value={i.source_id}>{i.name}</option>)}</datalist>
        {msg && <p className={msg.type} role="status">{msg.text}</p>}
      </div>
      <AddChannel channels={channels} onAdded={load} />
      </>}
    </section>
  )
}
