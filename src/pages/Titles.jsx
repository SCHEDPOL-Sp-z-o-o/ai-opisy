import { useEffect, useMemo, useState } from 'react'
import { supabase, plError, fetchAll } from '../supabase.js'
import { runJob, TITLES_URL } from '../jobs.js'
import { COMPONENTS, DEFAULT_COMPONENTS, LANG_LABEL, titleFacts, templateFor, previewTitle } from '../titles.js'
import DrainLoader from '../components/DrainLoader.jsx'

// Tytuły produktów: szablon dla kanału i kategorii → generowanie AI w języku kanału (+ tłumaczenie PL) → edycja → akceptacja.
// Publikacja wysyła tylko zaakceptowane tytuły.
const STATUS = { do_akceptacji: 'do akceptacji', zaakceptowany: 'zaakceptowany', odrzucony: 'odrzucony' }
const LBL = Object.fromEntries(COMPONENTS.map(c => [c.key, c.label]))
const plN = (n, a, b, c) => `${n} ${n === 1 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? b : c}`

function TemplateEditor({ channel, tpl, categories, sampleFor, onSaved, onCancel, setMsg }) {
  const [t, setT] = useState(() => tpl || { channel_id: channel.id, category: '', max_len: 120, separator: ' ', rules: '', components: DEFAULT_COMPONENTS })
  const move = (i, d) => setT(x => { const c = [...x.components]; const j = i + d; if (j < 0 || j >= c.length) return x; [c[i], c[j]] = [c[j], c[i]]; return { ...x, components: c } })
  const setC = (i, patch) => setT(x => ({ ...x, components: x.components.map((c, k) => k === i ? { ...c, ...patch } : c) }))
  const sample = sampleFor(t.category), prev = sample ? previewTitle(t, sample) : ''
  async function save() {
    const { data: { session } } = await supabase.auth.getSession()
    const row = { channel_id: channel.id, category: t.category.trim(), max_len: Number(t.max_len) || 120, separator: t.separator ?? ' ', rules: t.rules || null, components: t.components, updated_at: new Date().toISOString(), ...(tpl ? {} : { created_by: session.user.id }) }
    const q = tpl ? supabase.from('title_templates').update(row).eq('id', tpl.id) : supabase.from('title_templates').insert(row)
    const { error } = await q
    if (error) setMsg({ type: 'error', text: /duplicate|title_templates_channel_id_category/.test(error.message) ? 'Szablon dla tej kategorii w tym kanale już istnieje – edytuj go.' : /title_templates/.test(error.message) ? 'Brak tabel – uruchom migrację 44_tytuly.sql.' : plError(error.message) })
    else { setMsg({ type: 'ok', text: 'Szablon zapisany.' }); onSaved() }
  }
  return (
    <div className="panel tt-editor">
      <h3>{tpl ? 'Edycja szablonu' : 'Nowy szablon'} – {channel.marketplace} {channel.language.toUpperCase()}</h3>
      <div className="grid-form price-form">
        <label>Kategoria<input list="tt-cats" value={t.category} onChange={e => setT({ ...t, category: e.target.value })} placeholder="puste = wszystkie kategorie" /></label>
        <label>Maks. liczba znaków<input type="number" min="20" max="500" value={t.max_len} onChange={e => setT({ ...t, max_len: e.target.value })} /></label>
        <label>Separator<select value={t.separator} onChange={e => setT({ ...t, separator: e.target.value })}><option value=" ">spacja</option><option value=" - ">„ - ”</option><option value=", ">„, ”</option><option value=" | ">„ | ”</option></select></label>
      </div>
      <datalist id="tt-cats">{categories.map(c => <option key={c} value={c} />)}</datalist>
      <p className="muted small">Kategoria działa jak początek nazwy kategorii rodziny (np. „wanny” obejmuje „wanny wolnostojące”). Dla produktu wybierany jest najbardziej szczegółowy pasujący szablon.</p>
      <h4>Składniki w kolejności tytułu</h4>
      <ol className="tt-comps">{t.components.map((c, i) => (
        <li key={c.key} className={c.on ? '' : 'off'}>
          <span className="tt-move"><button className="link-dark" disabled={i === 0} onClick={() => move(i, -1)} aria-label="W górę">↑</button><button className="link-dark" disabled={i === t.components.length - 1} onClick={() => move(i, 1)} aria-label="W dół">↓</button></span>
          <label className="check"><input type="checkbox" checked={c.on} onChange={e => setC(i, { on: e.target.checked })} /> <strong>{LBL[c.key]}</strong></label>
          <input className="inline-input tt-note" placeholder={COMPONENTS.find(x => x.key === c.key)?.hint || 'uwaga dla AI (opcjonalnie)'} value={c.note || ''} onChange={e => setC(i, { note: e.target.value })} />
        </li>))}</ol>
      <label className="block-label">Zasady stylu dla AI (opcjonalnie, każda w nowej linii)<textarea rows={3} value={t.rules || ''} onChange={e => setT({ ...t, rules: e.target.value })} placeholder={'np. Typ produktu z małej litery\nBez nazwy marki dla kanału X'} /></label>
      {sample && <p className="small">Podgląd struktury dla {sample.sku} (dane po polsku, bez AI): <strong>{prev || '—'}</strong> <span className={prev.length > t.max_len ? 'crit-text' : 'muted'}>({prev.length}/{t.max_len})</span></p>}
      <div className="row-actions"><button className="btn" onClick={save}>Zapisz szablon</button><button className="link-dark" onClick={onCancel}>anuluj</button></div>
    </div>
  )
}

export default function Titles({ profile }) {
  const canApprove = ['akceptujacy', 'admin'].includes(profile?.role)
  const [d, setD] = useState(null), [err, setErr] = useState(''), [msg, setMsg] = useState(null)
  const [chId, setChId] = useState(''), [tab, setTab] = useState('tytuly'), [edit, setEdit] = useState(null)
  const [q, setQ] = useState(''), [cat, setCat] = useState(''), [st, setSt] = useState(''), [sel, setSel] = useState(new Set()), [busy, setBusy] = useState('')
  const [drafts, setDrafts] = useState({})

  async function load() {
    try {
      const [ch, tt, pt, prods, fams, br, pim] = await Promise.all([
        supabase.from('channels').select('id, marketplace, language, active').order('code'),
        supabase.from('title_templates').select('*'),
        fetchAll('product_titles', '*'),
        fetchAll('products', 'id, sku, name, family_id, attributes'),
        supabase.from('product_families').select('id, model_name, series, category, brand_id'),
        supabase.from('brands').select('id, name'),
        fetchAll('assortment', 'sku, color, technology, model'),
      ])
      if (tt.error) throw tt.error
      const chans = (ch.data || []).filter(c => c.active !== false)
      setD({ channels: chans, templates: tt.data, titles: Object.fromEntries(pt.map(x => [`${x.channel_id}|${x.product_id}`, x])), products: prods.sort((a, b) => a.sku.localeCompare(b.sku)),
        fam: Object.fromEntries((fams.data || []).map(f => [f.id, f])), brand: Object.fromEntries((br.data || []).map(b => [b.id, b.name])), pim: Object.fromEntries(pim.map(r => [r.sku, r])) })
      setChId(c => c || chans[0]?.id || '')
    } catch (e) { setErr(/title_templates|product_titles/.test(e.message) ? 'Brak tabel generatora tytułów – uruchom migrację 44_tytuly.sql.' : plError(e.message)) }
  }
  useEffect(() => { load() }, [])
  const categories = useMemo(() => d ? [...new Set(Object.values(d.fam).map(f => f.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl')) : [], [d])
  if (err) return <section className="page"><h1>Tytuły</h1><p className="error">{err}</p></section>
  if (!d) return <section className="page"><DrainLoader /></section>
  const ch = d.channels.find(c => c.id === chId)
  const factsOf = p => { const f = d.fam[p.family_id] || {}; return titleFacts({ product: p, family: f, pim: d.pim[p.sku] || {}, brand: d.brand[f.brand_id] || '' }) }
  const tplOf = p => templateFor(d.templates, chId, d.fam[p.family_id]?.category)
  const tOf = p => d.titles[`${chId}|${p.id}`]
  const ql = q.trim().toLowerCase()
  const shown = d.products.filter(p => {
    const f = d.fam[p.family_id] || {}, t = tOf(p)
    if (cat && !String(f.category || '').toLowerCase().startsWith(cat.toLowerCase())) return false
    if (st === 'brak' ? t : st && t?.status !== st) return false
    return !ql || p.sku.toLowerCase().includes(ql) || (p.name || '').toLowerCase().includes(ql) || (f.model_name || '').toLowerCase().includes(ql) || (t?.title || '').toLowerCase().includes(ql)
  })
  const selShown = shown.filter(p => sel.has(p.id)), allShown = shown.length > 0 && selShown.length === shown.length
  const isPl = ch?.language === 'pl'

  async function generate() {
    const noTpl = selShown.filter(p => !tplOf(p)); if (noTpl.length) { setMsg({ type: 'error', text: `Brak szablonu tytułu dla kategorii: ${[...new Set(noTpl.map(p => d.fam[p.family_id]?.category || 'bez kategorii'))].join(', ')}. Dodaj go w zakładce „Szablony”.` }); return }
    const acc = selShown.filter(p => tOf(p)?.status === 'zaakceptowany').length
    if (acc && !confirm(`${plN(acc, 'zaakceptowany tytuł zostanie zastąpiony', 'zaakceptowane tytuły zostaną zastąpione', 'zaakceptowanych tytułów zostanie zastąpionych')} nowym i wróci do akceptacji. Kontynuować?`)) return
    setBusy('Generowanie tytułów…'); setMsg(null)
    const { data: { session } } = await supabase.auth.getSession()
    let done = 0, over = 0, missing = 0
    try {
      const groups = new Map(); for (const p of selShown) { const t = tplOf(p); (groups.get(t.id) || groups.set(t.id, { t, list: [] }).get(t.id)).list.push(p) }
      for (const { t, list } of groups.values()) for (let i = 0; i < list.length; i += 25) {
        const part = list.slice(i, i + 25)
        setBusy(`Generowanie tytułów… ${done + part.length}/${selShown.length}`)
        const r = await runJob('generate_titles', { mode: 'generate', channel: { marketplace: ch.marketplace, language: ch.language }, template: { components: t.components, max_len: t.max_len, separator: t.separator, rules: t.rules },
          items: part.map(p => ({ product_id: p.id, sku: p.sku, facts: factsOf(p) })) }, { url: TITLES_URL, timeoutSec: 400 })
        const rows = (r.titles || []).filter(x => x.title).map(x => ({ product_id: x.product_id, channel_id: chId, template_id: t.id, title: x.title, title_pl: isPl ? x.title : x.title_pl || null, pl_stale: false, parts: { used: x.used || [] }, status: 'do_akceptacji', note: x.over ? `za długi: ${x.length}/${t.max_len} znaków` : null, created_by: session.user.id }))
        if (rows.length) { const { error } = await supabase.from('product_titles').upsert(rows, { onConflict: 'product_id,channel_id' }); if (error) throw error }
        done += part.length; over += rows.filter(x => x.note).length; missing += (r.missing || []).length
      }
      setMsg({ type: over || missing ? 'hint' : 'ok', text: `Wygenerowano tytuły: ${done - missing}${over ? ` · za długich (do poprawy): ${over}` : ''}${missing ? ` · bez wyniku: ${missing} – spróbuj ponownie` : ''}. Sprawdź i zaakceptuj przed publikacją.` })
      await load()   // zaznaczenie zostaje – można od razu przejrzeć i zaakceptować
    } catch (e) { setMsg({ type: 'error', text: plError(e.message) }); await load() } finally { setBusy('') }
  }
  async function saveTitle(p, title) {
    const t = tOf(p), tpl = tplOf(p), clean = title.replace(/\s+/g, ' ').trim()
    if (!clean || clean === t?.title) return
    const max = tpl?.max_len || 9999
    const { error } = await supabase.from('product_titles').update({ title: clean, pl_stale: !isPl, title_pl: isPl ? clean : t.title_pl, note: clean.length > max ? `za długi: ${clean.length}/${max} znaków` : null }).eq('id', t.id)
    if (error) setMsg({ type: 'error', text: plError(error.message) }); else { setDrafts(x => { const n = { ...x }; delete n[p.id]; return n }); load() }
  }
  async function translate(list) {
    setBusy('Tłumaczenie…')
    try {
      for (let i = 0; i < list.length; i += 30) {
        const part = list.slice(i, i + 30)
        const r = await runJob('generate_titles', { mode: 'translate', channel: { marketplace: ch.marketplace, language: ch.language }, items: part.map(p => ({ product_id: p.id, title: tOf(p).title })) }, { url: TITLES_URL, timeoutSec: 300 })
        for (const x of r.titles || []) await supabase.from('product_titles').update({ title_pl: x.title_pl, pl_stale: false }).eq('product_id', x.product_id).eq('channel_id', chId)
      }
      await load()
    } catch (e) { setMsg({ type: 'error', text: plError(e.message) }) } finally { setBusy('') }
  }
  async function setStatus(list, status) {
    const blocked = status === 'zaakceptowany' ? list.filter(p => tOf(p)?.note?.startsWith('za długi')) : []
    const ok = list.filter(p => tOf(p) && !blocked.includes(p))
    for (const p of ok) { const { error } = await supabase.from('product_titles').update({ status }).eq('id', tOf(p).id); if (error) { setMsg({ type: 'error', text: plError(error.message) }); break } }
    setMsg({ type: blocked.length ? 'hint' : 'ok', text: `${status === 'zaakceptowany' ? 'Zaakceptowano' : 'Odrzucono'}: ${ok.length}${blocked.length ? ` · pominięto za długie (skróć je przed akceptacją): ${blocked.length}` : ''}.` })
    setSel(new Set()); load()
  }

  const chTpls = d.templates.filter(t => t.channel_id === chId).sort((a, b) => (a.category || '').localeCompare(b.category || '', 'pl'))
  const sampleFor = category => { const p = d.products.find(x => !category || String(d.fam[x.family_id]?.category || '').toLowerCase().startsWith(category.toLowerCase())); return p ? { ...factsOf(p), sku: p.sku } : null }
  const withTitle = selShown.filter(p => tOf(p))
  return (
    <section className="page wide">
      <h1>Tytuły</h1>
      <p className="muted lead">Szablon tytułu dla każdego kanału i kategorii → tytuły generowane przez AI w języku kanału, z tłumaczeniem na polski → edycja i akceptacja. Do Baselinkera trafiają tylko zaakceptowane tytuły.</p>
      <div className="tabs" role="tablist">{d.channels.map(c => <button key={c.id} role="tab" aria-selected={c.id === chId} className={c.id === chId ? 'tab on' : 'tab'} onClick={() => { setChId(c.id); setSel(new Set()); setEdit(null) }}>{c.marketplace} {c.language.toUpperCase()}</button>)}</div>
      <div className="seg tt-seg">{[['tytuly', 'Tytuły'], ['szablony', `Szablony (${chTpls.length})`]].map(([k, l]) => <button key={k} className={tab === k ? 'seg-btn on' : 'seg-btn'} onClick={() => setTab(k)}>{l}</button>)}</div>
      {msg && <p className={msg.type} role="status">{msg.text}</p>}

      {tab === 'szablony' && ch && <div className="panel">
        <p className="muted small">Język tytułów: <strong>{LANG_LABEL[ch.language] || ch.language}</strong>. Szablon określa kolejność składników, limit znaków i zasady stylu; puste pole kategorii = szablon domyślny dla całego kanału.</p>
        {chTpls.length > 0 && <table className="compact"><thead><tr><th>Kategoria</th><th>Składniki</th><th>Limit</th><th /></tr></thead>
          <tbody>{chTpls.map(t => <tr key={t.id}><td><strong>{t.category || 'wszystkie kategorie'}</strong></td><td className="small">{t.components.filter(c => c.on).map(c => LBL[c.key]).join(' · ')}</td><td>{t.max_len}</td>
            <td><button className="link-dark small" onClick={() => setEdit(t)}>edytuj</button> {canApprove && <button className="link-dark danger-link small" onClick={async () => { if (confirm('Usunąć szablon? Wygenerowane tytuły zostają.')) { await supabase.from('title_templates').delete().eq('id', t.id); load() } }}>usuń</button>}</td></tr>)}</tbody></table>}
        {!edit && <div className="row-actions"><button className="btn ghost" onClick={() => setEdit('new')}>+ Nowy szablon</button></div>}
        {edit && <TemplateEditor key={edit === 'new' ? 'new' : edit.id} channel={ch} tpl={edit === 'new' ? null : edit} categories={categories} sampleFor={sampleFor} onSaved={() => { setEdit(null); load() }} onCancel={() => setEdit(null)} setMsg={setMsg} />}
      </div>}

      {tab === 'tytuly' && ch && <div className="panel">
        {chTpls.length === 0 && <p className="hint small">Ten kanał nie ma jeszcze szablonu tytułu – dodaj go w zakładce „Szablony”.</p>}
        <div className="filters">
          <input placeholder="Szukaj: SKU, nazwa, model, tytuł…" value={q} onChange={e => setQ(e.target.value)} />
          <select value={cat} onChange={e => setCat(e.target.value)} aria-label="Kategoria"><option value="">wszystkie kategorie</option>{categories.map(c => <option key={c}>{c}</option>)}</select>
          <select value={st} onChange={e => setSt(e.target.value)} aria-label="Status"><option value="">wszystkie</option><option value="brak">bez tytułu</option>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        <div className="row-actions">
          <label className="check"><input type="checkbox" checked={allShown} ref={el => { if (el) el.indeterminate = !allShown && selShown.length > 0 }} onChange={() => setSel(s => { const n = new Set(s); allShown ? shown.forEach(p => n.delete(p.id)) : shown.forEach(p => n.add(p.id)); return n })} /> zaznacz wszystkie widoczne ({shown.length})</label>
          <button className="btn" disabled={!selShown.length || !!busy} onClick={generate}>Generuj tytuły AI ({selShown.length})</button>
          {canApprove && <button className="btn ghost" disabled={!withTitle.length || !!busy} onClick={() => setStatus(withTitle, 'zaakceptowany')}>Akceptuj zaznaczone ({withTitle.length})</button>}
          {!isPl && <button className="btn ghost" disabled={!withTitle.length || !!busy} onClick={() => translate(withTitle)}>Przetłumacz na PL</button>}
          {busy && <span className="muted working small">{busy}</span>}
        </div>
        {!canApprove && <p className="muted small">Tytuły akceptuje osoba z rolą „akceptujący” lub administrator.</p>}
        <div className="table-wrap"><table className="compact tt-table">
          <thead><tr><th /><th>Produkt</th><th>Tytuł ({LANG_LABEL[ch.language] || ch.language}){!isPl && ' / tłumaczenie PL'}</th><th>Znaki</th><th>Status</th><th /></tr></thead>
          <tbody>{shown.slice(0, 400).map(p => { const t = tOf(p), tpl = tplOf(p), max = tpl?.max_len, draft = drafts[p.id], len = (draft ?? t?.title ?? '').length
            return <tr key={p.id} className={sel.has(p.id) ? 'row-selected' : ''}>
              <td className="check-cell"><input type="checkbox" checked={sel.has(p.id)} onChange={() => setSel(s => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n })} aria-label="Zaznacz" /></td>
              <td><span className="mono">{p.sku}</span><div className="muted small">{d.fam[p.family_id]?.model_name || ''} · {d.fam[p.family_id]?.category || '—'}{!tpl && <span className="warn-text"> · brak szablonu</span>}</div></td>
              <td className="tt-cell">{t ? <>
                <input className="tt-input" value={draft ?? t.title} onChange={e => setDrafts(x => ({ ...x, [p.id]: e.target.value }))} onBlur={e => saveTitle(p, e.target.value)} onKeyDown={e => e.key === 'Enter' && e.target.blur()} aria-label="Tytuł" />
                {!isPl && <div className={'small ' + (t.pl_stale ? 'warn-text' : 'muted')}>PL: {t.title_pl || '—'}{t.pl_stale && <> · tytuł zmieniony – <button className="link-dark small" onClick={() => translate([p])}>przetłumacz ponownie</button></>}</div>}
                {t.note && <div className="small crit-text">{t.note}</div>}</> : <span className="muted small">brak tytułu{tpl ? '' : ' i szablonu'}</span>}</td>
              <td className={max && len > max ? 'crit-text' : 'muted'}>{t ? `${len}${max ? '/' + max : ''}` : ''}</td>
              <td>{t && <span className={`tag ${t.status === 'zaakceptowany' ? 'okt' : t.status === 'odrzucony' ? 'err' : 'warn'}`}>{STATUS[t.status]}</span>}</td>
              <td className="tt-act">{t && canApprove && t.status !== 'zaakceptowany' && <button className="link-dark small" onClick={() => setStatus([p], 'zaakceptowany')}>akceptuj</button>} {t && canApprove && t.status !== 'odrzucony' && <button className="link-dark danger-link small" onClick={() => setStatus([p], 'odrzucony')}>odrzuć</button>}</td>
            </tr> })}</tbody>
        </table></div>
        {shown.length > 400 && <p className="muted small">Pokazano 400 z {shown.length} – zawęź filtry.</p>}
      </div>}
    </section>
  )
}
