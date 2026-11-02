import { useEffect, useState } from 'react'
import { supabase, plError } from '../supabase.js'

const ATTR = { wykonczenie: 'Wykończenie', powloka: 'Powłoka', odplyw: 'Odpływ', ksztalt: 'Kształt', zdjecie: 'Rola zdjęcia', rodzina: 'Zestaw → osobna rodzina' }
const MATCH = { suffix: 'Końcówka SKU (po „/”)', segment: 'Fragment SKU (między „/”)', prefix: 'Początek kodu SKU', base: 'Dokładny kod bazowy', position: 'Pozycja zdjęcia w Base', filename: 'Fragment nazwy pliku', path: 'Ścieżka zdjęcia (wyrażenie)', odplyw: 'Wartość odpływu', name: 'Nazwa produktu (wyrażenie)' }
const EMPTY = { attribute: 'wykonczenie', match_type: 'suffix', pattern: '', value: '', note: '' }

export default function Rules({ profile }) {
  const [rows, setRows] = useState([])
  const [brands, setBrands] = useState([])
  const [form, setForm] = useState(EMPTY)
  const [msg, setMsg] = useState(null)
  const admin = profile?.role === 'admin'

  async function load() {
    const [r, b] = await Promise.all([
      supabase.from('import_rules').select('*').order('attribute').order('pattern'),
      supabase.from('brands').select('id, name'),
    ])
    if (r.error) setMsg({ type: 'error', text: plError(r.error.message) }); else setRows(r.data)
    if (b.data) { setBrands(b.data); setForm(f => ({ ...f, brand_id: f.brand_id || b.data.find(x => x.name === 'Aedler')?.id })) }
  }
  useEffect(() => { load() }, [])

  async function add(e) {
    e.preventDefault()
    const { error } = await supabase.from('import_rules').insert({ ...form, pattern: form.pattern.trim(), value: form.value.trim(), note: form.note.trim() || null })
    setMsg(error ? { type: 'error', text: plError(error.message) } : { type: 'ok', text: 'Reguła dodana. Zadziała przy kolejnym imporcie.' })
    if (!error) { setForm({ ...EMPTY, brand_id: form.brand_id }); load() }
  }
  async function toggle(r) { await supabase.from('import_rules').update({ active: !r.active }).eq('id', r.id); load() }
  async function remove(r) {
    if (!confirm(`Usunąć regułę „${r.pattern || '(brak końcówki)'} → ${r.value}”?`)) return
    await supabase.from('import_rules').delete().eq('id', r.id); load()
  }

  return (
    <section className="page">
      <h1>Słownik importu</h1>
      <p className="muted lead">Zamienia kody SKU na atrybuty wariantów. Zmiana działa przy następnym imporcie – wtedy zaimportuj produkty ponownie.</p>
      <div className="panel table-wrap">
        <table className="compact">
          <thead><tr><th>Marka</th><th>Atrybut</th><th>Dopasowanie</th><th>Wzorzec</th><th>Wartość w opisach</th><th>Notatka</th>{admin && <th />}</tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className={r.active ? '' : 'inactive'}>
                <td>{brands.find(b => b.id === r.brand_id)?.name || 'wszystkie'}</td>
                <td>{ATTR[r.attribute]}</td>
                <td>{MATCH[r.match_type]}</td>
                <td className="mono">{r.pattern || '(brak końcówki)'}</td>
                <td>{r.value}</td>
                <td className="muted">{r.note || ''}</td>
                {admin && <td className="actions">
                  <button className="link-dark" onClick={() => toggle(r)}>{r.active ? 'Wyłącz' : 'Włącz'}</button>
                  <button className="link-dark danger" onClick={() => remove(r)}>Usuń</button>
                </td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {admin && (
        <form className="panel" onSubmit={add}>
          <h2>Dodaj regułę</h2>
          <div className="grid-form">
            <label>Marka<select value={form.brand_id || ''} onChange={e => setForm({ ...form, brand_id: e.target.value || null })}>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
            <label>Atrybut<select value={form.attribute} onChange={e => setForm({ ...form, attribute: e.target.value })}>
              {Object.entries(ATTR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>Dopasowanie<select value={form.match_type} onChange={e => setForm({ ...form, match_type: e.target.value })}>
              {Object.entries(MATCH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>Wzorzec<input value={form.pattern} onChange={e => setForm({ ...form, pattern: e.target.value })} placeholder="np. CM/SC albo 493.28" /></label>
            <label>Wartość w opisach<input value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} placeholder="np. Cement Scale (RAL 7038)" required /></label>
            <label>Notatka<input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></label>
          </div>
          <button className="btn" disabled={!form.value.trim()}>Dodaj regułę</button>
        </form>
      )}
      {msg && <p className={msg.type} role="status">{msg.text}</p>}
    </section>
  )
}
