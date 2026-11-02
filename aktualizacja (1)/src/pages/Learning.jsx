import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, plError, fetchAll } from '../supabase.js'
import { runJob } from '../jobs.js'
import DrainLoader from '../components/DrainLoader.jsx'

const LANG = { all: 'Wszystkie języki', ro: 'rumuński', hu: 'węgierski', bg: 'bułgarski', de: 'niemiecki', pl: 'polski', en: 'angielski', cs: 'czeski', sk: 'słowacki', fr: 'francuski', it: 'włoski', es: 'hiszpański' }
const scopeName = s => s === 'all' ? 'Wszystkie języki' : `${s.toUpperCase()} – ${LANG[s] || s}`
const plN = (n, a, b, c) => `${n} ${n === 1 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? b : c}`
const date = d => d ? new Date(d).toLocaleDateString('pl-PL') : ''
const same = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || [])

function Changes({ c }) {
  const rows = [['Dodane', c?.added, 'ch-add'], ['Scalone', c?.merged, 'ch-merge'], ['Usunięte', c?.removed, 'ch-del'], ['Konflikty', c?.conflicts, 'ch-conf']].filter(r => r[1]?.length)
  if (!rows.length) return <p className="muted small">Bez opisu zmian.</p>
  return <div className="changes">{rows.map(([l, list, cls]) => <div key={l} className={cls}><strong>{l}</strong><ul>{list.map((x, i) => <li key={i}>{x}</li>)}</ul></div>)}</div>
}

function Proposal({ g, active, canEdit, onDone }) {
  const [text, setText] = useState((g.rules || []).join('\n'))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const rules = text.split('\n').map(x => x.trim()).filter(Boolean)
  async function approve() {
    setBusy(true); setErr('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (active) { const a = await supabase.from('style_guides').update({ status: 'archiwum' }).eq('id', active.id); if (a.error) throw a.error }
      const u = await supabase.from('style_guides').update({ rules, status: 'aktywna', approved_by: session.user.id, approved_at: new Date().toISOString() }).eq('id', g.id)
      if (u.error) throw u.error
      onDone(`Wytyczne „${scopeName(g.scope)}” v${g.version} są aktywne – trafią do kolejnych opisów.`)
    } catch (e) { setErr(plError(e.message)); setBusy(false) }
  }
  async function reject() {
    if (!confirm('Odrzucić tę propozycję? Obecne wytyczne zostaną bez zmian.')) return
    const u = await supabase.from('style_guides').update({ status: 'odrzucona' }).eq('id', g.id)
    if (u.error) setErr(plError(u.error.message)); else onDone('Propozycja odrzucona.')
  }
  return (
    <div className="panel proposal">
      <div className="proposal-head">
        <h3>{scopeName(g.scope)} · propozycja v{g.version}</h3>
        <span className="muted small">z {plN(g.source_count, 'uwagi', 'uwag', 'uwag')} · {date(g.created_at)}{active ? ` · zastąpi v${active.version}` : ' · pierwsza wersja'}</span>
      </div>
      <Changes c={g.changes} />
      <label className="small">Zasady (jedna w linii) – możesz poprawić przed zatwierdzeniem
        <textarea rows={Math.min(16, Math.max(5, rules.length + 1))} value={text} onChange={e => setText(e.target.value)} disabled={!canEdit} />
      </label>
      {canEdit && <div className="row-actions">
        <button className="btn" disabled={busy || !rules.length} onClick={approve}>Zatwierdź ({plN(rules.length, 'zasada', 'zasady', 'zasad')})</button>
        <button className="link-dark" disabled={busy} onClick={reject}>Odrzuć</button>
      </div>}
      {err && <p className="error">{err}</p>}
    </div>
  )
}

export default function Learning({ profile }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState('')
  const [openLang, setOpenLang] = useState('')
  const canEdit = ['akceptujacy', 'admin'].includes(profile?.role)
  async function load() {
    try {
      const [pending, guides] = await Promise.all([
        fetchAll('review_comments', 'id, content, section_key, created_at, description_id, descriptions(channel_id, family_id, channels(language, marketplace), product_families(brand_id, model_name, category))', q => q.is('learned_at', null).order('created_at')),
        fetchAll('style_guides', '*', q => q.order('created_at', { ascending: false })),
      ])
      setD({ pending, guides })
    } catch (e) { setErr(/style_guides|learned_at/.test(e.message) ? 'Baza nie ma jeszcze tabel nauki – uruchom migrację 23_nauka_i_technologie.sql.' : plError(e.message)) }
  }
  useEffect(() => { load() }, [])
  if (err) return <section className="page"><h1>Nauka z uwag</h1><p className="error">{err}</p></section>
  if (!d) return <section className="page"><DrainLoader /></section>

  const langOf = c => c.descriptions?.channels?.language || 'pl'
  const byLang = d.pending.reduce((m, c) => { (m[langOf(c)] ||= []).push(c); return m }, {})
  const activeOf = scope => d.guides.find(g => g.scope === scope && g.status === 'aktywna')
  const proposals = d.guides.filter(g => g.status === 'propozycja')
  const scopes = [...new Set(d.guides.filter(g => g.status === 'aktywna').map(g => g.scope))].sort((a, b) => (a === 'all' ? -1 : b === 'all' ? 1 : a.localeCompare(b)))

  async function consolidate(lang) {
    const list = byLang[lang].slice(0, 150)
    setBusy(lang); setMsg(null)
    try {
      const curAll = activeOf('all'), curLang = activeOf(lang)
      const r = await runJob('feedback_consolidate', {
        lang, current_all: curAll?.rules || [], current_lang: curLang?.rules || [],
        comments: list.map(c => ({ id: c.id, text: c.content, section: c.section_key, model: c.descriptions?.product_families?.model_name, category: c.descriptions?.product_families?.category })),
      }, { timeoutSec: 300 })
      const x = r.result || r
      const { data: { session } } = await supabase.auth.getSession()
      const nextV = scope => 1 + Math.max(0, ...d.guides.filter(g => g.scope === scope).map(g => g.version))
      const made = []
      for (const [scope, rules, cur, changes] of [['all', x.rules_all, curAll, x.changes_all || x.changes], [lang, x.rules_lang, curLang, x.changes_lang || x.changes]]) {
        if (!rules?.length || same(rules, cur?.rules)) continue
        // nowsza propozycja zastępuje starszą, jeszcze niezatwierdzoną
        await supabase.from('style_guides').update({ status: 'odrzucona' }).eq('scope', scope).eq('status', 'propozycja')
        const ins = await supabase.from('style_guides').insert({ scope, rules, changes: changes || {}, source_count: list.length, version: nextV(scope), status: 'propozycja', created_by: session.user.id })
        if (ins.error) throw ins.error
        made.push(scopeName(scope))
      }
      // fakty z uwag → propozycje w Księdze wiedzy (do akceptacji)
      const facts = (x.items || []).filter(i => i.kind === 'fakt' && i.fact).map(i => {
        const c = list.find(z => z.id === i.id), fam = c?.descriptions?.product_families
        return { content: i.fact, level: 'seria', brand_id: fam?.brand_id || null, family_id: c?.descriptions?.family_id || null, status: 'do_akceptacji',
          source_note: `Z uwagi w weryfikacji (${date(c?.created_at)}): „${String(c?.content || '').slice(0, 200)}”` }
      }).filter(f => f.family_id)
      if (facts.length) { const e = await supabase.from('kb_facts').insert(facts); if (e.error) throw e.error }
      // uwagi wzięte do nauki
      const now = new Date().toISOString()
      for (const kind of ['styl', 'fakt', 'jednorazowa']) {
        const ids = (x.items || []).filter(i => i.kind === kind).map(i => i.id)
        if (ids.length) { const e = await supabase.from('review_comments').update({ learned_at: now, learn_kind: kind }).in('id', ids); if (e.error) throw e.error }
      }
      const k = kind => (x.items || []).filter(i => i.kind === kind).length
      setMsg({ type: 'ok', text: `Przeanalizowano ${plN(list.length, 'uwagę', 'uwagi', 'uwag')}: zasady stylu ${k('styl')}, fakty ${k('fakt')}, jednorazowe ${k('jednorazowa')}.`
        + (made.length ? ` Nowe propozycje wytycznych: ${made.join(', ')} – przejrzyj i zatwierdź poniżej.` : ' Wytyczne bez zmian.')
        + (facts.length ? ` Do Księgi wiedzy ${facts.length === 1 ? 'trafiła' : facts.length % 10 >= 2 && facts.length % 10 <= 4 && (facts.length % 100 < 10 || facts.length % 100 >= 20) ? 'trafiły' : 'trafiło'} ${plN(facts.length, 'propozycja faktu', 'propozycje faktów', 'propozycji faktów')} do akceptacji.` : '')
        + (x.unclassified?.length ? ` ${x.unclassified.length} uwag AI nie sklasyfikowało – zostały w kolejce.` : ''), facts: facts.length })
      await load()
    } catch (e) { setMsg({ type: 'error', text: plError(e.message) }) } finally { setBusy('') }
  }

  return (
    <section className="page">
      <h1>Nauka z uwag</h1>
      <p className="muted lead">Uwagi wpisywane w Weryfikacji uczą generator. AI porządkuje je w wytyczne (zasady stylu), fakty o produktach kieruje do Księgi wiedzy, a poprawki jednorazowe pomija. Wytyczne działają dopiero po zatwierdzeniu.</p>
      {msg && <p className={msg.type} role="status">{msg.text}{msg.facts ? <> <Link to="/wiedza">Księga wiedzy →</Link></> : null}</p>}

      <div className="panel">
        <h2>Nowe uwagi do nauki</h2>
        {Object.keys(byLang).length === 0 ? <p className="muted">Brak nowych uwag – wszystkie zostały już przeanalizowane.</p> : (
          <div className="learn-langs">{Object.entries(byLang).sort((a, b) => b[1].length - a[1].length).map(([lang, list]) => (
            <div key={lang} className="learn-lang">
              <div className="learn-row">
                <strong>{scopeName(lang)}</strong>
                <span className="muted small">{plN(list.length, 'uwaga', 'uwagi', 'uwag')} · najstarsza z {date(list[0].created_at)}{list.length > 150 ? ' · jednorazowo analizowanych jest 150 najstarszych' : ''}</span>
                <button className="link-dark small" onClick={() => setOpenLang(openLang === lang ? '' : lang)}>{openLang === lang ? 'ukryj' : 'pokaż'}</button>
                {canEdit && <button className="btn ghost small-btn" disabled={!!busy} onClick={() => consolidate(lang)}>{busy === lang ? 'Analiza…' : 'Ucz się z tych uwag'}</button>}
              </div>
              {openLang === lang && <ul className="learn-list">{list.map(c => <li key={c.id}><span className="muted small">{c.descriptions?.product_families?.model_name || '—'}{c.section_key ? ` · ${c.section_key}` : ''} · {date(c.created_at)}</span><br />{c.content}</li>)}</ul>}
            </div>
          ))}</div>
        )}
        <p className="muted small">Dobry rytm: raz w tygodniu albo po zebraniu ok. 10–15 uwag w danym języku. Uwagi oznaczone w Weryfikacji „zaproponuj jako regułę” trafiają dodatkowo od razu do Reguł QA.</p>
      </div>

      {proposals.length > 0 && <>
        <h2 className="section-title">Do zatwierdzenia</h2>
        {proposals.map(g => <Proposal key={g.id} g={g} active={activeOf(g.scope)} canEdit={canEdit} onDone={t => { setMsg({ type: 'ok', text: t }); load() }} />)}
      </>}

      <h2 className="section-title">Aktywne wytyczne</h2>
      {scopes.length === 0 ? <div className="panel"><p className="muted">Jeszcze brak – pierwsze powstaną po analizie uwag i zatwierdzeniu.</p></div> : scopes.map(sc => {
        const g = activeOf(sc), hist = d.guides.filter(x => x.scope === sc && x.status === 'archiwum').length
        return (
          <div key={sc} className="panel">
            <div className="proposal-head"><h3>{scopeName(sc)} · v{g.version}</h3><span className="muted small">zatwierdzone {date(g.approved_at)}{hist ? ` · ${plN(hist, 'wcześniejsza wersja', 'wcześniejsze wersje', 'wcześniejszych wersji')} w archiwum` : ''}</span></div>
            <ol className="guide-rules">{(g.rules || []).map((r, i) => <li key={i}>{r}</li>)}</ol>
          </div>
        )
      })}
    </section>
  )
}
