import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, plError, fetchAll } from '../supabase.js'
import { runJob, PUBLISH_URL } from '../jobs.js'
import N8nTest from '../components/N8nTest.jsx'
import DrainLoader from '../components/DrainLoader.jsx'

// odmiana: pl(5, ['opis', 'opisy', 'opisów'])
const pl = (n, [a, b, c]) => `${n} ${n === 1 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? b : c}`
const verb = (n, one, few, many) => n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? few : many
const STAGES = [['do_generacji', 'Do generacji'], ['do_weryfikacji', 'Do weryfikacji'], ['blad', 'Błędy'], ['zaakceptowany', 'Zaakceptowane'], ['opublikowany', 'Opublikowane']]
const N8N_LIMIT = 2500

export default function Dashboard({ profile }) {
  const [s, setS] = useState({ loading: true })

  const [market, setMarket] = useState('')
  const [syncing, setSyncing] = useState(null)
  const [reload, setReload] = useState(0)
  useEffect(() => { (async () => {
    const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0)
    let all
    try {
      all = await Promise.all([
        fetchAll('products', 'id, sku, family_id'),
        fetchAll('descriptions', 'id, family_id, channel_id, product_id, version, status, is_base, qa, created_at', q => q.order('version', { ascending: false }).order('id')),
        fetchAll('assortment', 'sku'),
        fetchAll('bl_catalog', 'sku, synced_at').catch(() => null),
      ])
    } catch (e) { setS({ error: plError(e.message) }); return }
    const [prodRows, descRows, asRows, blRows] = all
    const prod = { data: prodRows }, desc = { data: descRows }
    const [ch, tp, fam, jobs, facts, learnQ] = await Promise.all([
      supabase.from('channels').select('id, marketplace, language, active, baselinker_source_id').eq('active', true),
      supabase.from('templates').select('channel_id, brand_id').eq('status', 'aktywny'),
      supabase.from('product_families').select('id, brand_id, model_name'),
      supabase.from('jobs').select('*', { count: 'exact', head: true }).gte('created_at', month.toISOString()),
      supabase.from('kb_facts').select('*', { count: 'exact', head: true }).eq('status', 'do_akceptacji'),
      supabase.from('review_comments').select('id', { count: 'exact', head: true }).is('learned_at', null),
    ])
    const err = [ch, tp, fam, jobs, facts].find(r => r.error)?.error
    if (err) { setS({ error: plError(err.message) }); return }
    const famBrand = Object.fromEntries(fam.data.map(f => [f.id, f.brand_id]))
    const latest = {}
    for (const d of desc.data) { const k = `${d.channel_id}|${d.product_id}`; if (!latest[k]) latest[k] = d }
    // sloty = produkt × aktywny kanał z szablonem dla marki produktu
    const slots = []
    for (const p of prod.data) for (const c of ch.data) if (tp.data.some(t => t.channel_id === c.id && t.brand_id === famBrand[p.family_id])) slots.push({ p, c, d: latest[`${c.id}|${p.id}`] })
    const stageOf = d => !d ? 'do_generacji' : d.status === 'generowanie' ? 'do_weryfikacji' : d.status === 'poprawki' ? 'do_weryfikacji' : d.status
    const funnel = Object.fromEntries(STAGES.map(([k]) => [k, 0]))
    slots.forEach(x => { const st = stageOf(x.d); if (st in funnel) funnel[st]++ })
    const order = { ro: 1, hu: 2, bg: 3 }
    const markets = [...ch.data].sort((a, b) => (order[a.language] || 9) - (order[b.language] || 9)).map(c => {
      const mine = slots.filter(x => x.c.id === c.id)
      return { c, total: mine.length, accepted: mine.filter(x => x.d?.status === 'zaakceptowany').length, published: mine.filter(x => x.d?.status === 'opublikowany').length }
    })
    const done = Object.values(latest).filter(d => d.qa)
    const variants = done.filter(d => !d.is_base)
    const queue = Object.values(latest).filter(d => d.status === 'do_weryfikacji').sort((a, b) => a.created_at.localeCompare(b.created_at))
    setS({ loading: false, funnel, total: slots.length, markets, queue, famName: Object.fromEntries(fam.data.map(f => [f.id, f.model_name])),
      chName: Object.fromEntries(ch.data.map(c => [c.id, `${c.marketplace} ${c.language.toUpperCase()}`])),
      quality: { variants: variants.length, autoOk: variants.filter(d => d.qa?.pass && d.status !== 'do_weryfikacji').length,
        qaFail: done.filter(d => d.qa && !d.qa.pass).length, revised: Object.values(latest).filter(d => d.version > 1).length,
        langNotes: done.reduce((n, d) => n + (d.qa?.language_notes?.length || 0), 0) },
      jobs: jobs.count || 0, pendingFacts: facts.count || 0, toLearn: learnQ.error ? 0 : (learnQ.count || 0), families: fam.data.length, products: prod.data.length,
      cov: { pim: asRows.map(r => r.sku), bl: blRows ? blRows.map(r => r.sku) : null, blSynced: blRows?.length ? blRows.reduce((m, r) => r.synced_at > m ? r.synced_at : m, '') : null,
        prod: prod.data, latest, channels: ch.data } })
  })() }, [reload])

  if (s.loading) return <section className="page"><DrainLoader label="Ładowanie danych…" /></section>
  if (s.error) return <section className="page"><h1>Dashboard</h1><div className="panel"><p className="error" role="alert">Nie udało się pobrać danych: {s.error}</p></div></section>
  const pct = (a, b) => b ? Math.round(100 * a / b) : 0
  const age = d => { const days = Math.floor((Date.now() - new Date(d).getTime()) / 864e5); return days === 0 ? 'dziś' : days === 1 ? '1 dzień' : `${days} dni` }

  // ===== Pokrycie asortymentu: PIM → Baselinker → aplikacja → treść → publikacja =====
  const norm = x => String(x || '').trim().toLowerCase()
  const pimSet = new Set(s.cov.pim.map(norm).filter(Boolean))
  const blSet = s.cov.bl ? new Set(s.cov.bl.map(norm).filter(Boolean)) : null
  const appBySku = new Map(s.cov.prod.map(p => [norm(p.sku), p]))
  const baseSet = pimSet.size ? pimSet : (blSet || new Set(appBySku.keys()))
  const baseLabel = pimSet.size ? 'W drzewie (PIM)' : blSet ? 'W Baselinkerze' : 'W aplikacji'
  const GEN = ['do_weryfikacji', 'poprawki', 'zaakceptowany', 'opublikowany']
  const chans = market ? s.cov.channels.filter(c => c.id === market) : s.cov.channels
  const statusFor = p => chans.map(c => s.cov.latest[`${c.id}|${p.id}`]?.status).filter(Boolean)
  const base = [...baseSet]
  const inBl = blSet ? base.filter(k => blSet.has(k)) : null
  const inApp = base.filter(k => appBySku.has(k))
  const withContent = inApp.filter(k => statusFor(appBySku.get(k)).some(st => GEN.includes(st)))
  const published = inApp.filter(k => statusFor(appBySku.get(k)).includes('opublikowany'))
  const rawSku = new Map([...s.cov.pim, ...(s.cov.bl || []), ...s.cov.prod.map(p => p.sku)].map(x => [norm(x), String(x).trim()]))
  const pimNotBl = blSet && pimSet.size ? base.filter(k => !blSet.has(k)) : []
  const blNotApp = (inBl || []).filter(k => !appBySku.has(k))
  const appNoContent = inApp.filter(k => !withContent.includes(k))
  const blOnly = blSet && pimSet.size ? [...blSet].filter(k => !pimSet.has(k)).length : 0
  const steps = [
    { n: base.length, label: baseLabel, note: pimSet.size ? `SKU z listy PIM` : 'brak listy PIM – wgraj ją w Drzewie produktów', to: '/drzewo' },
    ...(pimSet.size ? [{ n: inBl === null ? null : inBl.length, label: 'W Baselinkerze', note: inBl === null ? 'stan katalogu nieodświeżony' : pimNotBl.length ? `${pimNotBl.length} SKU z PIM nie ma w Base` : 'wszystkie SKU z PIM są w Base', gap: pimNotBl }] : []),
    { n: inApp.length, label: 'W aplikacji', note: blNotApp.length ? `${blNotApp.length} SKU z Base do zaimportowania` : 'zaimportowane', gap: blNotApp, to: '/produkty' },
    { n: withContent.length, label: 'Z treścią', note: appNoContent.length ? `${appNoContent.length} SKU bez opisu${market ? '' : ' na żadnym rynku'}` : 'wszystkie mają opis', gap: appNoContent, to: '/produkty' },
    { n: published.length, label: 'Opublikowane', note: `${withContent.length - published.length} z treścią czeka na akceptację lub publikację`, to: '/publikacja' },
  ]
  const canSync = ['akceptujacy', 'admin'].includes(profile?.role)
  async function syncCatalog() {
    setSyncing({ busy: true })
    try {
      const r = await runJob('bl_catalog', { max_pages: 25 }, { url: PUBLISH_URL, timeoutSec: 240 })
      const x = r.result || r, batch = crypto.randomUUID(), now = new Date().toISOString()
      const rows = (x.items || []).map(i => ({ ...i, batch_id: batch, synced_at: now }))
      for (let i = 0; i < rows.length; i += 1000) { const e = await supabase.from('bl_catalog').upsert(rows.slice(i, i + 1000)); if (e.error) throw e.error }
      const d = await supabase.from('bl_catalog').delete().neq('batch_id', batch); if (d.error) throw d.error
      setSyncing({ ok: `Zapisano stan katalogu: ${rows.length} produktów.${x.truncated ? ' Uwaga: katalog może mieć więcej stron niż pobrano – zgłoś to adminowi.' : ''}` }); setReload(v => v + 1)
    } catch (e) { setSyncing({ err: plError(e.message) }) }
  }
  const csv = (name, keys) => {
    const body = '\uFEFFSKU\r\n' + keys.map(k => `"${(rawSku.get(k) || k).replace(/"/g, '""')}"`).join('\r\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'text/csv;charset=utf-8' })); a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }
  const reviewN = s.funnel.do_weryfikacji || 0, errN = s.funnel.blad || 0, accN = s.funnel.zaakceptowany || 0
  const todo = [
    !pimSet.size && { text: 'Wgraj listę asortymentu z PIM – od niej zaczyna się pokrycie.', to: '/drzewo', cta: 'Drzewo produktów' },
    pimSet.size > 0 && !blSet && canSync && { text: 'Odśwież stan katalogu Baselinkera, żeby zobaczyć, czego brakuje w Base.', action: syncCatalog, cta: 'Odśwież stan Base' },
    pimNotBl.length > 0 && { text: `${pimNotBl.length} SKU z PIM nie ma w Baselinkerze – przekaż listę osobie od danych.`, action: () => csv('pim-bez-base', pimNotBl), cta: 'Pobierz listę CSV' },
    blNotApp.length > 0 && { text: `${blNotApp.length} SKU z Base nie ma jeszcze w aplikacji – zaimportuj je.`, to: '/produkty', cta: 'Produkty → Importuj' },
    reviewN > 0 && { text: `${pl(reviewN, ['opis', 'opisy', 'opisów'])} ${verb(reviewN, 'czeka', 'czekają', 'czeka')} na weryfikację.`, to: '/weryfikacja', cta: 'Weryfikacja' },
    errN > 0 && { text: `${pl(errN, ['opis', 'opisy', 'opisów'])} ${verb(errN, 'ma', 'mają', 'ma')} błąd – sprawdź uwagi QA i wygeneruj ponownie.`, to: '/weryfikacja', cta: 'Błędy' },
    s.pendingFacts > 0 && { text: `${pl(s.pendingFacts, ['fakt', 'fakty', 'faktów'])} ${verb(s.pendingFacts, 'czeka', 'czekają', 'czeka')} na akceptację – bez nich generacja nie ruszy.`, to: '/wiedza', cta: 'Księga wiedzy' },
    s.toLearn >= 10 && { text: `${pl(s.toLearn, ['uwaga', 'uwagi', 'uwag'])} z weryfikacji ${verb(s.toLearn, 'czeka', 'czekają', 'czeka')} na naukę – zamień je w wytyczne dla AI.`, to: '/nauka', cta: 'Nauka z uwag' },
    accN > 0 && { text: `${pl(accN, ['zaakceptowany opis', 'zaakceptowane opisy', 'zaakceptowanych opisów'])} ${verb(accN, 'czeka', 'czekają', 'czeka')} na publikację.`, to: '/publikacja', cta: 'Publikacja' },
    appNoContent.length > 0 && { text: `${appNoContent.length} SKU w aplikacji nie ma jeszcze opisu${market ? ' na wybranym rynku' : ''}.`, to: '/produkty', cta: 'Generuj opisy' },
  ].filter(Boolean)
  const maxN = Math.max(1, ...steps.map(x => x.n || 0))

  return (
    <section className="page">
      <header className="page-head">
        <h1>Dashboard</h1>
        <p className="conn ok-dot">{s.products} SKU w {s.families === 1 ? '1 rodzinie' : `${s.families} rodzinach`} · {pl(s.total, ['opis', 'opisy', 'opisów'])} do pokrycia</p>
      </header>
      <div className="dash-top">
        <div className="panel coverage">
          <div className="coverage-head">
            <h2>Pokrycie asortymentu</h2>
            <div className="seg">
              <button className={!market ? 'seg-btn on' : 'seg-btn'} onClick={() => setMarket('')}>Dowolny rynek</button>
              {s.cov.channels.map(c => <button key={c.id} className={market === c.id ? 'seg-btn on' : 'seg-btn'} onClick={() => setMarket(c.id)}>{c.marketplace} {c.language.toUpperCase()}</button>)}
            </div>
          </div>
          <ol className="cov-steps">
            {steps.map((x, i) => (
              <li key={x.label}>
                <span className="cov-label">{x.to ? <Link to={x.to}>{x.label}</Link> : x.label}</span>
                <span className="cov-n">{x.n === null ? '—' : x.n.toLocaleString('pl-PL')}</span>
                <span className="bar cov-bar"><span key={market + i} style={{ width: `${x.n === null ? 0 : Math.max(x.n ? 1.5 : 0, 100 * x.n / maxN)}%` }} /></span>
                <span className="cov-note">{x.note}{x.gap?.length > 0 && <> · <button className="link-dark" onClick={() => csv(x.label.toLowerCase().replace(/\s+/g, '-'), x.gap)}>lista CSV</button></>}</span>
              </li>
            ))}
          </ol>
          <p className="muted small">
            {s.cov.blSynced ? `Stan Baselinkera z ${new Date(s.cov.blSynced).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}` : 'Stan Baselinkera nie był jeszcze pobierany'}{blOnly ? ` · ${blOnly} SKU jest w Base, ale nie w PIM` : ''}
            {canSync && <> · <button className="link-dark" disabled={syncing?.busy} onClick={syncCatalog}>{syncing?.busy ? 'odświeżanie…' : 'odśwież stan Base'}</button></>}
          </p>
          {syncing?.ok && <p className="ok">{syncing.ok}</p>}{syncing?.err && <p className="error">{syncing.err}</p>}
        </div>
        <div className="panel next-steps">
          <h2>Od czego zacząć</h2>
          {todo.length === 0 ? <p className="muted">Wszystko na bieżąco.</p> : (
            <ol>{todo.slice(0, 6).map((t, i) => (
              <li key={i}><span>{t.text}</span>{t.to ? <Link className="btn ghost small-btn" to={t.to}>{t.cta}</Link> : <button className="btn ghost small-btn" onClick={t.action}>{t.cta}</button>}</li>
            ))}</ol>
          )}
        </div>
      </div>
      <div className="pipe" role="list" aria-label="Opisy według statusu">
        {STAGES.map(([k, l], i) => (
          <div key={k} role="listitem" className={'pipe-stage' + (i === STAGES.length - 1 ? ' last' : '') + (k === 'blad' && s.funnel[k] ? ' alert' : '')}>
            <span className="pipe-count">{s.funnel[k]}</span><span className="pipe-label">{l}</span>
          </div>
        ))}
      </div>
      <div className="grid">
        <div className="panel">
          <h2>Rynki</h2>
          <table className="compact">
            <thead><tr><th>Kanał</th><th>Opublikowane</th><th className="bar-col" /><th>Zaakceptowane</th></tr></thead>
            <tbody>{s.markets.map(m => (
              <tr key={m.c.id}>
                <td><strong>{m.c.marketplace} {m.c.language.toUpperCase()}</strong>{!m.c.baselinker_source_id && <span className="tag warn">brak ID integracji</span>}</td>
                <td className="mono">{m.published} / {m.total}</td>
                <td className="bar-col"><span className="bar"><span style={{ width: `${pct(m.published, m.total)}%` }} /></span></td>
                <td className="mono">{m.accepted}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <div className="panel">
          <h2>Jakość</h2>
          <dl className="facts">
            <dt>Warianty zaakceptowane automatycznie</dt><dd>{s.quality.autoOk} / {s.quality.variants}</dd>
            <dt>Opisy z błędami QA</dt><dd>{s.quality.qaFail}</dd>
            <dt>Opisy poprawiane przez recenzenta</dt><dd>{s.quality.revised}</dd>
            <dt>Uwagi językowe AI</dt><dd>{s.quality.langNotes}</dd>
          </dl>
        </div>
        <div className="panel">
          <h2>Kolejka do weryfikacji</h2>
          {s.pendingFacts > 0 && <p className="hint">{s.pendingFacts} faktów czeka na akceptację w <Link to="/wiedza">Księdze wiedzy</Link>.</p>}
          {s.queue.length === 0 ? <p className="muted">Pusto – nic nie czeka.</p> : (
            <table className="compact">
              <thead><tr><th>Opis</th><th>Kanał</th><th>Czeka</th></tr></thead>
              <tbody>{s.queue.slice(0, 6).map(d => (
                <tr key={d.id}><td><Link to={`/weryfikacja/${d.id}`}>{s.famName[d.family_id]}{d.is_base ? ' (bazowy)' : ''}</Link></td><td>{s.chName[d.channel_id]}</td><td className={Date.now() - new Date(d.created_at) > 3 * 864e5 ? 'flags' : 'muted'}>{age(d.created_at)}</td></tr>
              ))}</tbody>
            </table>
          )}
          {s.queue.length > 6 && <p className="muted small"><Link to="/weryfikacja">i {s.queue.length - 6} więcej</Link></p>}
        </div>
        <div className="panel">
          <h2>Wykonania n8n w tym miesiącu</h2>
          <p className="big">{s.jobs} <span className="muted">/ {N8N_LIMIT}</span></p>
          <span className="bar wide"><span className={pct(s.jobs, N8N_LIMIT) > 80 ? 'hot' : ''} style={{ width: `${Math.min(100, pct(s.jobs, N8N_LIMIT))}%` }} /></span>
          <p className="muted small">Liczone są zadania z aplikacji. Inne workflow (np. wizualizacje) korzystają z tego samego limitu planu Starter.</p>
        </div>
        {profile?.role === 'admin' && <N8nTest />}
      </div>
    </section>
  )
}
