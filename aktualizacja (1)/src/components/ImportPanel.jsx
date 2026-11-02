import { useState } from 'react'
import Papa from 'papaparse'
import { supabase, plError } from '../supabase.js'
import { parseProducts, groupFamilies, rowsFromBaselinkerCsv } from '../parser.js'
import { runJob } from '../jobs.js'
import { autoAssignTechnologies } from '../knowledge.js'

const ATTR_COLS = [['wymiar', 'Wymiar'], ['wysokosc_cm', 'Wys. cm'], ['ksztalt', 'Kształt'], ['wykonczenie', 'Wykończenie'], ['powloka', 'Powłoka'], ['odplyw', 'Odpływ'], ['w_zestawie', 'W zestawie']]

const fmt = v => v == null ? '—' : typeof v === 'number' ? v.toLocaleString('pl-PL') : v

export default function ImportPanel({ brands, rules, existingSkus, onSaved, onClose }) {
  const [tab, setTab] = useState('baselinker')
  const [filterName, setFilterName] = useState('Aedler')
  const [stage, setStage] = useState('')
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [preview, setPreview] = useState(null)
  const [saving, setSaving] = useState(false)

  async function pimMap(skus) {
    const map = new Map()
    for (let i = 0; i < skus.length; i += 300) {
      const { data } = await supabase.from('assortment').select('sku, name, brand, category, category_path, model, color, shape, technology, ean').in('sku', skus.slice(i, i + 300))
      ;(data || []).forEach(r => map.set(r.sku, r))
    }
    return map
  }

  async function buildPreview(raw, source) {
    const pim = await pimMap(raw.map(r => String(r.sku || '').trim()).filter(Boolean))
    const parsed = parseProducts(raw, brands, rules, pim).map(p => ({ ...p, source }))
    setPreview({ parsed, families: groupFamilies(parsed), source })
  }

  async function fromBaselinker() {
    setError(''); setWarning(''); setPreview(null); setStage('Wysyłanie zadania do n8n…')
    try {
      const result = await runJob('import_baselinker', { filter_name: filterName.trim() }, {
        onStage: s => setStage(s === 'w_toku' ? 'n8n pobiera produkty z Baselinkera…' : 'Zadanie zapisane…'),
      })
      if (result?.warnings?.length) setWarning(result.warnings.join(' '))
      if (!result?.products?.length) throw new Error(`Baselinker nie zwrócił produktów dla filtra „${filterName}”.`)
      await buildPreview(result.products, 'baselinker')
    } catch (e) { setError(e.message) } finally { setStage('') }
  }

  function fromFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(''); setWarning(''); setPreview(null)
    const reader = new FileReader()
    reader.onload = async () => {
      const text = String(reader.result)
      if (/\p{L}\?\p{L}/u.test(text)) setWarning('Plik ma uszkodzone polskie znaki („?” zamiast ą, ę, ś…). Eksport był zapisany bez UTF-8. Nazwy produktów mogą być błędne – zalecany import z Baselinkera.')
      const { data, errors } = Papa.parse(text, { header: true, skipEmptyLines: true, delimitersToGuess: [';', ',', '\t'] })
      const raw = rowsFromBaselinkerCsv(data)
      if (!raw.length) { setError(errors[0]?.message || 'Nie znaleziono kolumny „produkt_sku”. Użyj eksportu CSV z Baselinkera.'); return }
      await buildPreview(raw, 'excel')
    }
    reader.readAsText(file, 'utf-8')
    e.target.value = ''
  }

  async function save() {
    setSaving(true); setError('')
    try {
      const fams = preview.families.filter(f => f.brand_id && f.model_name)
      const famIds = {}
      if (fams.length) {
        const { data, error } = await supabase.from('product_families')
          .upsert(fams.map(f => ({ brand_id: f.brand_id, model_name: f.model_name, series: f.series, category: f.category })), { onConflict: 'brand_id,model_name' })
          .select('id, brand_id, model_name')
        if (error) throw error
        data.forEach(d => { famIds[`${d.brand_id}|${d.model_name}`] = d.id })
        // technologie wg kategorii/serii (np. brodziki kompozytowe → Stabildense – technologia kompozytowa + Stabildense)
        try { await autoAssignTechnologies(supabase, data.map(d => d.id)) } catch (e) { /* brak tabeli technologii – pomiń */ }
      }
      const rows = preview.parsed.map(p => ({
        sku: p.sku, ean: p.ean || null, name: p.name, family_id: famIds[`${p.brand_id}|${p.model_name}`] || null,
        attributes: p.attributes, import_flags: p.flags, image_url: p.image_url, images: p.images, source: p.source, baselinker_product_id: p.bl_id,
      }))
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from('products').upsert(rows.slice(i, i + 200), { onConflict: 'sku' })
        if (error) throw error
      }
      onSaved(rows.length)
    } catch (e) { setError(plError(e.message)) } finally { setSaving(false) }
  }

  const total = preview?.parsed.length || 0
  const isNew = preview ? preview.parsed.filter(p => !existingSkus.has(p.sku)).length : 0
  const flagged = preview ? preview.parsed.filter(p => p.flags.some(f => !f.startsWith('Nazwa identyczna') && f !== 'Waga = 0' && !f.startsWith('Podwójne') && !f.startsWith('Kształt z reguły') && !f.startsWith('Odpływ odczytany'))).length : 0

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Import produktów</h2>
        <button className="link-dark" onClick={onClose}>Zamknij</button>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'baselinker'} className={tab === 'baselinker' ? 'tab on' : 'tab'} onClick={() => setTab('baselinker')}>Z Baselinkera</button>
        <button role="tab" aria-selected={tab === 'plik'} className={tab === 'plik' ? 'tab on' : 'tab'} onClick={() => setTab('plik')}>Z pliku CSV</button>
      </div>
      {tab === 'baselinker' ? (
        <div className="row-form">
          <label>Nazwa produktu zawiera
            <input value={filterName} onChange={e => setFilterName(e.target.value)} placeholder="np. Aedler Brodzik" />
          </label>
          <button className="btn" onClick={fromBaselinker} disabled={!!stage || !filterName.trim()}>{stage ? 'Pobieranie…' : 'Pobierz podgląd'}</button>
        </div>
      ) : (
        <div className="row-form">
          <label>Plik CSV z eksportu Baselinkera (kodowanie UTF-8)
            <input type="file" accept=".csv,text/csv" onChange={fromFile} />
          </label>
        </div>
      )}
      {stage && <p className="muted working" role="status">{stage}</p>}
      {warning && <p className="hint" role="status">{warning}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {preview && (
        <div className="preview">
          <p className="summary">
            <strong>{total} SKU</strong> w {preview.families.length} rodzinach · {isNew} nowych, {total - isNew} do aktualizacji
            {flagged > 0 && <> · <span className="tag warn">{flagged} do sprawdzenia</span></>}
          </p>
          {preview.families.map(f => (
            <details key={f.key} className="family" open={preview.families.length <= 3}>
              <summary><strong>{f.model_name || 'Nierozpoznane'}</strong> <span className="muted">{f.brand_name} · {f.category || 'bez kategorii'}{f.series ? ` · ${f.series}` : ''} · {f.items.length} SKU</span></summary>
              <div className="table-wrap">
                <table className="compact">
                  <thead><tr><th>SKU</th>{ATTR_COLS.map(([, l]) => <th key={l}>{l}</th>)}<th>Uwagi</th></tr></thead>
                  <tbody>
                    {f.items.map(p => (
                      <tr key={p.sku}>
                        <td className="mono">{p.sku}{!existingSkus.has(p.sku) && <span className="tag new">nowy</span>}</td>
                        {ATTR_COLS.map(([k]) => <td key={k}>{fmt(p.attributes[k])}</td>)}
                        <td className="flags">{p.flags.join(' · ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
          <button className="btn" onClick={save} disabled={saving}>{saving ? 'Zapisywanie…' : `Zapisz ${total} SKU w bazie`}</button>
        </div>
      )}
    </div>
  )
}
