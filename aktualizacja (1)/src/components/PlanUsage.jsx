import { useEffect, useState } from 'react'
import { supabase, plError } from '../supabase.js'
import DrainLoader from './DrainLoader.jsx'

// Plan darmowy Supabase: 500 MB bazy. Progi: do 60% spokojnie, 60–80% obserwować, od 80% przejść na Pro.
const LIMIT_MB = 500
const mb = b => Math.round((Number(b) || 0) / 1048576 * 10) / 10
const NAMES = { descriptions: 'opisy (wszystkie wersje)', assortment: 'asortyment z PIM', products: 'produkty', kb_facts: 'fakty Księgi wiedzy', bl_catalog: 'katalog Baselinkera', img_checks: 'wyniki sprawdzania grafik', jobs: 'zadania n8n', review_comments: 'uwagi z weryfikacji', bl_value_translations: 'tłumaczenia parametrów' }

export default function PlanUsage() {
  const [u, setU] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { supabase.rpc('db_usage').then(({ data, error }) => error ? setErr(/db_usage/.test(error.message) ? 'Brak funkcji odczytu – uruchom migrację 29_stan_bazy.sql.' : plError(error.message)) : setU(data)) }, [])
  if (err) return <p className="error">{err}</p>
  if (!u) return <DrainLoader label="Sprawdzanie bazy…" />
  const used = mb(u.db_bytes), pct = Math.min(100, Math.round(100 * used / LIMIT_MB))
  const level = pct >= 80 ? 'crit' : pct >= 60 ? 'warn' : 'ok'
  return (
    <>
      <div className="panel">
        <h2>Baza danych (Supabase, plan darmowy)</h2>
        <div className="usage-row">
          <span className="cov-n">{used} MB</span><span className="muted">z {LIMIT_MB} MB ({pct}%)</span>
          <span className={`bar usage-bar ${level}`}><span style={{ width: `${pct}%` }} /></span>
        </div>
        <p className={level === 'ok' ? 'muted small' : level === 'warn' ? 'hint' : 'error'}>
          {level === 'ok' && 'Spokojnie – sporo miejsca do limitu planu darmowego.'}
          {level === 'warn' && 'Ponad 60% limitu – warto zaplanować przejście na Supabase Pro w najbliższych tygodniach.'}
          {level === 'crit' && 'Ponad 80% limitu – przejdź na Supabase Pro. Plan darmowy nie dopuszcza przekroczeń: po osiągnięciu limitu zapis nowych danych (opisów, faktów) może zostać zablokowany.'}
        </p>
        <div className="table-wrap"><table className="compact">
          <thead><tr><th>Największe tabele</th><th className="num-cell">Rozmiar</th><th className="num-cell">Wiersze (ok.)</th></tr></thead>
          <tbody>{(u.tables || []).map(t => <tr key={t.table}><td>{NAMES[t.table] || t.table} <span className="muted small mono">{t.table}</span></td><td className="num-cell">{mb(t.bytes)} MB</td><td className="num-cell">{Number(t.rows).toLocaleString('pl-PL')}</td></tr>)}</tbody>
        </table></div>
      </div>
      <div className="panel">
        <h2>Kiedy przejść na plany płatne</h2>
        <p className="muted small">Przejście to kilka kliknięć, bez migracji danych. Sygnały, że to już ten moment:</p>
        <ul className="plan-triggers">
          <li><strong>Supabase Pro (25 USD/mies.)</strong> – baza powyżej 80% limitu; potrzebne kopie zapasowe z przywracaniem w panelu; więcej niż kilka osób pracuje na co dzień.</li>
          <li><strong>n8n Pro (60 EUR/mies.)</strong> – zużycie wykonań powyżej 80% z 2 500 miesięcznie (licznik w panelu n8n); po przekroczeniu limitu workflowy się zatrzymują do końca miesiąca. Najpóźniej przed uruchomieniem codziennego pobierania danych z Dealavo.</li>
        </ul>
        <h2>Kopie zapasowe na planie darmowym</h2>
        <p className="muted small">Plan darmowy nie robi kopii. Zastępuje je workflow GitHub „Kopia bazy i podtrzymanie projektu”: co tydzień zaszyfrowana kopia bazy (90 dni przechowywania), codziennie zapytanie, które nie pozwala uśpić projektu po 7 dniach bez aktywności. Status: GitHub → Actions.</p>
      </div>
    </>
  )
}
