import { useEffect, useState } from 'react'
import { supabase, plError } from '../supabase.js'
import { Link, useNavigate } from 'react-router-dom'
import ImportPanel from '../components/ImportPanel.jsx'
import { generateBase } from '../gen.js'
import DrainLoader from '../components/DrainLoader.jsx'

const ATTRS = [['wymiar', 'Wymiar'], ['wysokosc_cm', 'Wys. cm'], ['ksztalt', 'Kształt'], ['wykonczenie', 'Wykończenie'], ['powloka', 'Powłoka'], ['odplyw', 'Odpływ'], ['w_zestawie', 'W zestawie']]
const minor = f => f.startsWith('Nazwa identyczna') || f === 'Waga = 0' || f.startsWith('Podwójne') || f.startsWith('Kształt z reguły') || f.startsWith('Odpływ odczytany')

const fmt = v => v == null ? '—' : typeof v === 'number' ? v.toLocaleString('pl-PL') : v

export default function Products() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState('')
  const [gen, setGen] = useState({})
  const nav = useNavigate()

  async function load() {
    const [b, r, f, p, ch, tp, ds] = await Promise.all([
      supabase.from('brands').select('id, name'),
      supabase.from('import_rules').select('*'),
      supabase.from('product_families').select('id, brand_id, model_name, series, category, lead_product_id, technologies').order('model_name'),
      supabase.from('products').select('id, sku, name, family_id, attributes, import_flags').order('sku'),
      supabase.from('channels').select('id, marketplace, language, active'),
      supabase.from('templates').select('id, channel_id, brand_id').eq('status', 'aktywny'),
      supabase.from('descriptions').select('id, family_id, channel_id, product_id, version, status, is_base').order('version', { ascending: false }),
    ])
    const err = [b, r, f, p, ch, tp, ds].find(x => x.error)?.error
    if (err) { setError(plError(err.message)); return }
    setData({ brands: b.data, rules: r.data, families: f.data, products: p.data, channels: ch.data, templates: tp.data, descriptions: ds.data })
  }
  useEffect(() => { load() }, [])

  async function setTech(familyId, text) {
    const technologies = [...new Set(text.split(',').map(t => t.replace(/®/g, '').trim()).filter(Boolean))]
    const { error } = await supabase.from('product_families').update({ technologies }).eq('id', familyId)
    if (error) setError(plError(error.message)); else load()
  }

  async function setLead(familyId, productId) {
    const { error } = await supabase.from('product_families').update({ lead_product_id: productId || null }).eq('id', familyId)
    if (error) setError(plError(error.message)); else load()
  }

  async function generate(fam, ch) {
    const key = `${fam.id}|${ch.id}`
    setGen(g => ({ ...g, [key]: { busy: true } }))
    try { await generateBase(fam.id, ch.id, id => nav(`/weryfikacja/${id}`)) }
    catch (e) { setGen(g => ({ ...g, [key]: { error: e.message } })) }
  }

  if (error) return <section className="page"><h1>Produkty</h1><p className="error">{error}</p></section>
  if (!data) return <section className="page"><DrainLoader /></section>

  const brandName = id => data.brands.find(b => b.id === id)?.name || ''
  const orphans = data.products.filter(p => !p.family_id)

  return (
    <section className="page">
      <header className="page-head">
        <h1>Produkty</h1>
        {!importing && <button className="btn top" onClick={() => { setImporting(true); setMsg('') }}>Importuj produkty</button>}
      </header>
      {msg && <p className="ok" role="status">{msg}</p>}
      {importing && (
        <ImportPanel brands={data.brands} rules={data.rules} existingSkus={new Set(data.products.map(p => p.sku))}
          onClose={() => setImporting(false)}
          onSaved={n => { setImporting(false); setMsg(`Zapisano ${n} SKU. Wskaż wariant wiodący w każdej rodzinie.`); load() }} />
      )}

      {data.families.length === 0 && !importing && (
        <div className="panel empty">
          <p>Katalog jest pusty. Zaimportuj produkty z Baselinkera albo z pliku CSV.</p>
          <p className="muted">Rodziny tworzą się same ze wspólnej nazwy modelu, a atrybuty wariantów ze słownika importu.</p>
        </div>
      )}

      {data.families.filter(f => data.products.some(p => p.family_id === f.id)).map(f => {
        const items = data.products.filter(p => p.family_id === f.id)
        const issues = items.filter(p => (p.import_flags || []).some(x => !minor(x))).length
        return (
          <div key={f.id} className="panel family-card">
            <div className="family-head">
              <div>
                <h2>{f.model_name}</h2>
                <p className="muted">{brandName(f.brand_id)} · {f.series} · {f.category} · {items.length} SKU
                  {issues > 0 && <> · <span className="tag warn">{issues} do sprawdzenia</span></>}</p>
              </div>
              <label className="lead">Wariant wiodący
                <select value={f.lead_product_id || ''} onChange={e => setLead(f.id, e.target.value)}>
                  <option value="">— wybierz —</option>
                  {items.map(p => <option key={p.id} value={p.id}>{p.sku} · {p.attributes?.ksztalt} {p.attributes?.wymiar} · {p.attributes?.wykonczenie}</option>)}
                </select>
              </label>
            </div>
            {!f.lead_product_id && <p className="hint">Wybierz wariant wiodący – dla niego powstanie opis bazowy rodziny.</p>}
            <label className="tech">Technologie w tej rodzinie <span className="muted">(oddziel przecinkami – fakty o tych technologiach trafią do opisów)</span>
              <input defaultValue={(f.technologies || []).join(', ')} placeholder="np. Stabildense" onBlur={e => e.target.value !== (f.technologies || []).join(', ') && setTech(f.id, e.target.value)} />
            </label>
            <div className="gen-row">
              <span className="muted small">Opisy bazowe:</span>
              {data.channels.filter(ch => ch.active && data.templates.some(t => t.channel_id === ch.id && t.brand_id === f.brand_id)).map(ch => {
                const last = data.descriptions.find(d => d.is_base && d.family_id === f.id && d.channel_id === ch.id)
                const seen = {}; const vars = data.descriptions.filter(d => !d.is_base && d.family_id === f.id && d.channel_id === ch.id && !seen[d.product_id] && (seen[d.product_id] = true))
                const okVars = vars.filter(d => ['zaakceptowany', 'opublikowany'].includes(d.status)).length
                const g = gen[`${f.id}|${ch.id}`] || {}
                return (
                  <span key={ch.id} className="gen-item">
                    <strong>{ch.marketplace} {ch.language.toUpperCase()}</strong>
                    {last && <Link to={`/weryfikacja/${last.id}`} className={`tag st-${last.status}`}>v{last.version}</Link>}
                    <button className="link-dark" disabled={g.busy || !f.lead_product_id} onClick={() => generate(f, ch)}>{g.busy ? 'Uruchamianie…' : last ? 'Generuj ponownie' : 'Generuj'}</button>
                    {last?.status === 'zaakceptowany' && <span className="muted small">warianty: {okVars}/{Math.max(items.length - 1, 0)}</span>}
                    {g.error && <span className="error small">{g.error}</span>}
                  </span>
                )
              })}
            </div>
            <details>
              <summary>Warianty ({items.length})</summary>
              <div className="table-wrap">
                <table className="compact">
                  <thead><tr><th>SKU</th>{ATTRS.map(([, l]) => <th key={l}>{l}</th>)}<th>Uwagi</th></tr></thead>
                  <tbody>
                    {items.map(p => (
                      <tr key={p.id} className={p.id === f.lead_product_id ? 'is-lead' : ''}>
                        <td className="mono">{p.sku}</td>
                        {ATTRS.map(([k]) => <td key={k}>{fmt(p.attributes?.[k])}</td>)}
                        <td className="flags">{(p.import_flags || []).join(' · ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )
      })}
      {orphans.length > 0 && <p className="hint">{orphans.length} SKU bez rodziny (nazwa nierozpoznana). Popraw nazwę w Baselinkerze albo dodaj regułę.</p>}
    </section>
  )
}
