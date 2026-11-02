import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { runJob, PUBLISH_URL } from '../jobs.js'
import DrainLoader from '../components/DrainLoader.jsx'

const opisy = n => `${n} ${n === 1 ? 'opis' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 'opisy' : 'opisów'}`

const VIEWS = [['gotowe', 'Gotowe do publikacji'], ['opublikowane', 'Opublikowane'], ['bledy', 'Błędy publikacji']]

export default function Publish({ profile }) {
  const [data, setData] = useState(null)
  const [channel, setChannel] = useState(null)
  const [view, setView] = useState('gotowe')
  const [sel, setSel] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')
  const canPublish = ['akceptujacy', 'admin'].includes(profile?.role)

  async function load() {
    const [ch, d, p, f, t] = await Promise.all([
      supabase.from('channels').select('*').eq('active', true).order('code'),
      supabase.from('descriptions').select('id, family_id, channel_id, product_id, version, status, is_base, published_at, publish_error, created_at').order('version', { ascending: false }),
      supabase.from('products').select('id, sku, baselinker_product_id'),
      supabase.from('product_families').select('id, model_name'),
      supabase.from('product_titles').select('product_id, channel_id, title, status'),   // tytuły z Generatora tytułów (przed migracją 44 – brak)
    ])
    const latest = {}
    for (const x of d.data || []) { const k = `${x.channel_id}|${x.product_id}`; if (!latest[k]) latest[k] = x }
    const order = { ro: 1, hu: 2, bg: 3 }
    const chans = (ch.data || []).sort((a, b) => (order[a.language] || 9) - (order[b.language] || 9))
    setData({ titles: Object.fromEntries((t?.data || []).map(x => [`${x.channel_id}|${x.product_id}`, x])), channels: chans, rows: Object.values(latest), sku: Object.fromEntries((p.data || []).map(x => [x.id, x])), fam: Object.fromEntries((f.data || []).map(x => [x.id, x.model_name])) })
    setChannel(c => c || chans[0]?.id)
  }
  useEffect(() => { load() }, [])

  if (!data) return <section className="page"><DrainLoader /></section>
  const ch = data.channels.find(c => c.id === channel)
  const inCh = data.rows.filter(r => r.channel_id === channel)
  const lists = {
    gotowe: inCh.filter(r => r.status === 'zaakceptowany' && !r.publish_error),
    opublikowane: inCh.filter(r => r.status === 'opublikowany'),
    bledy: inCh.filter(r => r.publish_error),
  }
  const shown = lists[view].sort((a, b) => (data.fam[a.family_id] || '').localeCompare(data.fam[b.family_id] || '') || (b.is_base - a.is_base))
  const allSel = shown.length > 0 && shown.every(r => sel.has(r.id))

  async function publish() {
    const ids = [...sel].filter(id => shown.some(r => r.id === id))
    if (!ids.length || !confirm(`Wysłać ${opisy(ids.length)} do Baselinkera (${ch.marketplace} ${ch.language.toUpperCase()})? Nadpisze to obecne teksty tych produktów w tej integracji.`)) return
    setBusy(true); setErr(''); setRes(null)
    try {
      const out = { published: 0, failed: [], skipped: [], dry_run: false, would_publish: 0 }
      // tytuł: jeśli produkt ma tytuł z Generatora tytułów, musi być zaakceptowany; bez niego – tytuł z opisu (jak dotąd)
      const titles = {}, okIds = []
      for (const id of ids) {
        const r0 = shown.find(r => r.id === id), t = data.titles[`${r0.channel_id}|${r0.product_id}`]
        if (t && t.status !== 'zaakceptowany') { out.skipped.push({ sku: data.sku[r0.product_id]?.sku, reason: 'tytuł niezaakceptowany (Generator tytułów)' }); continue }
        if (t) titles[id] = t.title
        okIds.push(id)
      }
      for (let i = 0; i < okIds.length; i += 100) {
        const part = okIds.slice(i, i + 100)
        const r = await runJob('publish_batch', { description_ids: part, titles: Object.fromEntries(part.filter(id => titles[id]).map(id => [id, titles[id]])) }, { url: PUBLISH_URL, timeoutSec: 60 + part.length * 2 })
        out.dry_run = r.dry_run; out.published += r.published || 0; out.would_publish += r.would_publish || 0
        out.failed.push(...(r.failed || [])); out.skipped.push(...(r.skipped || []))
        if (r.example) out.example = r.example
      }
      setRes(out); setSel(new Set()); load()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <section className="page wide">
      <h1>Publikacja</h1>
      <div className="tabs" role="tablist">
        {data.channels.map(c => <button key={c.id} role="tab" aria-selected={c.id === channel} className={c.id === channel ? 'tab on' : 'tab'} onClick={() => { setChannel(c.id); setSel(new Set()); setRes(null) }}>{c.marketplace} {c.language.toUpperCase()}</button>)}
      </div>
      {ch && !ch.baselinker_source_id && <p className="hint">Ten kanał nie ma ID integracji Baselinkera – uzupełnij je w Ustawieniach, inaczej publikacja zostanie pominięta.</p>}
      <div className="review-bar">
        <div className="seg">
          {VIEWS.map(([k, l]) => <button key={k} className={view === k ? 'seg-btn on' : 'seg-btn'} onClick={() => { setView(k); setSel(new Set()) }}>{l} <span className="count">{lists[k].length}</span></button>)}
        </div>
        {canPublish && view !== 'opublikowane' && (
          <button className="btn top" onClick={publish} disabled={busy || !sel.size}>{busy ? 'Wysyłanie…' : `Publikuj zaznaczone (${sel.size})`}</button>
        )}
      </div>
      {!canPublish && <p className="muted small">Publikować może akceptujący lub admin.</p>}
      {err && <p className="error" role="alert">{err}</p>}
      {res && (
        <div className="panel">
          {res.dry_run ? (
            <p className="hint"><strong>Tryb próbny:</strong> {opisy(res.would_publish)} gotowe do wysłania, do pól {res.example?.fields?.join(' i ')}. Nic nie zostało zapisane w Baselinkerze. Aby publikować naprawdę, ustaw DRY_RUN = false w workflow „AI Opisy – publikacja”.</p>
          ) : <p className="ok">Opublikowano {opisy(res.published)}.</p>}
          {res.failed.length > 0 && <><p className="error">Błędy Baselinkera ({res.failed.length}):</p><ul className="qa-err">{res.failed.map((f, i) => <li key={i}>{f.sku}: {f.error}</li>)}</ul></>}
          {res.skipped.length > 0 && <details><summary>Pominięte ({res.skipped.length})</summary><ul className="qa-warn">{res.skipped.map((s, i) => <li key={i}>{s.sku || s.description_id}: {s.reason}</li>)}</ul></details>}
        </div>
      )}
      {shown.length === 0 ? <div className="panel empty"><p className="muted">{view === 'gotowe' ? 'Brak zaakceptowanych opisów czekających na publikację.' : view === 'opublikowane' ? 'Jeszcze nic nie opublikowano w tym kanale.' : 'Brak błędów publikacji.'}</p></div> : (
        <div className="panel table-wrap">
          <table className="compact">
            <thead><tr>
              {view !== 'opublikowane' && <th><input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(shown.map(r => r.id)))} aria-label="Zaznacz wszystkie" /></th>}
              <th>Rodzina</th><th>SKU</th><th>Opis</th><th>Tytuł</th><th>Wersja</th><th>{view === 'opublikowane' ? 'Opublikowano' : view === 'bledy' ? 'Błąd' : 'ID w Baselinkerze'}</th><th /></tr></thead>
            <tbody>{shown.map(r => {
              const p = data.sku[r.product_id] || {}
              return (
                <tr key={r.id}>
                  {view !== 'opublikowane' && <td><input type="checkbox" checked={sel.has(r.id)} onChange={() => { const n = new Set(sel); n.has(r.id) ? n.delete(r.id) : n.add(r.id); setSel(n) }} /></td>}
                  <td>{data.fam[r.family_id]}</td><td className="mono">{p.sku}</td><td>{r.is_base ? 'bazowy' : 'wariant'}</td>
                  <td>{(() => { const t = data.titles[`${r.channel_id}|${r.product_id}`]; return !t ? <span className="muted small" title="Tytuł z opisu">z opisu</span> : t.status === 'zaakceptowany' ? <span className="tag okt" title={t.title}>zaakceptowany</span> : <span className="tag warn" title={t.title}>do akceptacji</span> })()}</td><td>v{r.version}</td>
                  <td className={view === 'bledy' ? 'flags' : 'muted'}>{view === 'opublikowane' ? new Date(r.published_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' }) : view === 'bledy' ? r.publish_error : (p.baselinker_product_id || <span className="tag warn">brak</span>)}</td>
                  <td><Link to={`/weryfikacja/${r.id}`}>Podgląd</Link></td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}
