import { useEffect, useState } from 'react'
import { supabase, plError } from '../supabase.js'
import DrainLoader from '../components/DrainLoader.jsx'

const SCOPES = { seria: 'Seria', technologia: 'Technologia', model: 'Model (rodzina)', marka: 'Marka' }
const ROLES = ['baner', 'technologia', 'przekrój', 'montaż', 'aranżacja', 'ikona']

export default function Library({ profile }) {
  const [items, setItems] = useState(null)
  const [ctx, setCtx] = useState({ brands: [], families: [], series: [], tech: [] })
  const [f, setF] = useState({ scope: 'seria', scope_value: '', role: 'baner', alt_hint: '', url: '' })
  const [file, setFile] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    const [m, b, fam] = await Promise.all([
      supabase.from('media_library').select('*').order('created_at', { ascending: false }),
      supabase.from('brands').select('id, name'),
      supabase.from('product_families').select('id, brand_id, model_name, series, technologies'),
    ])
    setItems(m.data || [])
    const uniq = a => [...new Set(a.filter(Boolean))].sort()
    setCtx({ brands: b.data || [], families: fam.data || [], series: uniq((fam.data || []).map(x => x.series)), tech: uniq((fam.data || []).flatMap(x => x.technologies || [])) })
    setF(x => ({ ...x, brand_id: x.brand_id || (b.data || []).find(y => y.name === 'Aedler')?.id }))
  }
  useEffect(() => { load() }, [])

  async function add(e) {
    e.preventDefault(); setBusy(true); setMsg(null)
    try {
      let url = f.url.trim()
      if (file) {
        const path = `biblioteka/${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`
        const up = await supabase.storage.from('images').upload(path, file, { contentType: file.type })
        if (up.error) throw up.error
        url = supabase.storage.from('images').getPublicUrl(path).data.publicUrl
      }
      if (!/^https:\/\//.test(url)) throw new Error('Wgraj plik albo podaj adres zaczynający się od https://')
      const { data: { session } } = await supabase.auth.getSession()
      const { error } = await supabase.from('media_library').insert({ brand_id: f.brand_id, scope: f.scope, scope_value: f.scope === 'marka' ? null : f.scope_value.trim() || null,
        role: f.role.trim(), alt_hint: f.alt_hint.trim() || null, url, created_by: session.user.id })
      if (error) throw error
      setMsg({ type: 'ok', text: 'Grafika dodana. Nowe opisy użyją jej automatycznie.' }); setFile(null); setF({ ...f, url: '', alt_hint: '' }); load()
    } catch (e2) { setMsg({ type: 'error', text: plError(e2.message) }) } finally { setBusy(false) }
  }
  async function remove(m) { if (confirm('Usunąć grafikę z biblioteki?')) { await supabase.from('media_library').delete().eq('id', m.id); load() } }

  const scopeText = m => m.scope === 'marka' ? (ctx.brands.find(b => b.id === m.brand_id)?.name || 'marka') : m.scope === 'model' ? (ctx.families.find(x => x.id === m.scope_value)?.model_name || '—') : m.scope_value
  if (!items) return <section className="page"><DrainLoader /></section>

  return (
    <section className="page wide">
      <h1>Biblioteka grafik</h1>
      <p className="muted lead">Grafiki wspólne dla serii, technologii, modelu albo całej marki. Sekcja szablonu ustawiona na „Z biblioteki” sama dobiera grafikę o danej roli: najpierw dla modelu, potem serii, technologii, a na końcu marki.</p>
      <form className="panel" onSubmit={add}>
        <h2>Dodaj grafikę</h2>
        <div className="grid-form">
          <label>Marka<select value={f.brand_id || ''} onChange={e => setF({ ...f, brand_id: e.target.value })}>{ctx.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label>Dotyczy<select value={f.scope} onChange={e => setF({ ...f, scope: e.target.value, scope_value: '' })}>{Object.entries(SCOPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          {f.scope === 'model' ? (
            <label>Rodzina<select value={f.scope_value} onChange={e => setF({ ...f, scope_value: e.target.value })}><option value="">— wybierz —</option>{ctx.families.map(x => <option key={x.id} value={x.id}>{x.model_name}</option>)}</select></label>
          ) : f.scope !== 'marka' && (
            <label>{SCOPES[f.scope]}<input list="lib-values" value={f.scope_value} onChange={e => setF({ ...f, scope_value: e.target.value })} /></label>
          )}
          <label>Rola<input list="lib-roles" value={f.role} onChange={e => setF({ ...f, role: e.target.value })} /></label>
          <label>Plik<input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] || null)} /></label>
          <label>…albo adres HTTPS<input value={f.url} onChange={e => setF({ ...f, url: e.target.value })} placeholder="https://" disabled={!!file} /></label>
          <label>Podpowiedź do ALT<input value={f.alt_hint} onChange={e => setF({ ...f, alt_hint: e.target.value })} placeholder="co przedstawia grafika" /></label>
        </div>
        <datalist id="lib-values">{(f.scope === 'seria' ? ctx.series : ctx.tech).map(v => <option key={v} value={v} />)}</datalist>
        <datalist id="lib-roles">{ROLES.map(v => <option key={v} value={v} />)}</datalist>
        <button className="btn" disabled={busy || !f.role.trim() || (f.scope !== 'marka' && !f.scope_value) || (!file && !f.url.trim())}>{busy ? 'Zapisywanie…' : 'Dodaj do biblioteki'}</button>
        {msg && <p className={msg.type} role="status">{msg.text}</p>}
      </form>
      {items.length === 0 ? <div className="panel empty"><p className="muted">Biblioteka jest pusta. Zacznij od banera serii Standard Plus albo banera marki Aedler.</p></div> : (
        <div className="lib-grid">
          {items.map(m => (
            <figure key={m.id} className="lib-item">
              <img src={m.url} alt={m.alt_hint || m.role} loading="lazy" />
              <figcaption><strong>{m.role}</strong><span className="muted small">{SCOPES[m.scope]}: {scopeText(m)}</span>
                {profile?.role === 'admin' && <button className="link-dark danger" onClick={() => remove(m)}>Usuń</button>}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  )
}
