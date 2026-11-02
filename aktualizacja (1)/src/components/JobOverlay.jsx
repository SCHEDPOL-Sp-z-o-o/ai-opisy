import { useEffect, useState } from 'react'
import { jobActivity, activeJobList } from '../jobs.js'

const JOB_LABEL = {
  generate_description: 'Generowanie opisu', generate_variants: 'Generowanie wariantów', import_baselinker: 'Import produktów z Baselinkera',
  kb_extract: 'Wyciąganie faktów z dokumentu', keywords_refresh: 'Odświeżanie fraz kluczowych', params_translate: 'Tłumaczenie parametrów',
  params_sync: 'Parametry w Base', publish_batch: 'Publikacja w Baselinkerze', bl_integrations: 'Pobieranie integracji z Baselinkera', ping: 'Sprawdzanie połączenia',
}
const STAGE_LABEL = { przygotowanie: 'Przygotowanie zadania…', wyslane: 'Zadanie wysłane do n8n…', w_toku: 'AI pracuje – wynik pojawi się automatycznie' }
const labelOf = j => j.type === 'params_sync' ? `${j.mode === 'write' ? 'Zapis parametrów w Base' : 'Porównanie parametrów z Base'}${j.lang && j.lang !== 'pl' ? ` (${j.lang.toUpperCase()})` : ''}`
  : j.type === 'params_translate' && j.lang ? `Tłumaczenie parametrów (${j.lang.toUpperCase()})` : (JOB_LABEL[j.type] || 'Zadanie AI')
const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function JobOverlay() {
  const [jobs, setJobs] = useState(activeJobList())
  const [hidden, setHidden] = useState(false)
  const [, tick] = useState(0)
  useEffect(() => {
    const f = () => { const l = activeJobList(); setJobs(l); if (!l.length) setHidden(false) }
    jobActivity.addEventListener('change', f); return () => jobActivity.removeEventListener('change', f)
  }, [])
  useEffect(() => { if (!jobs.length) return; const t = setInterval(() => tick(x => x + 1), 1000); return () => clearInterval(t) }, [jobs.length])
  useEffect(() => { const k = e => { if (e.key === 'Escape') setHidden(true) }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [])
  if (!jobs.length || hidden) return null
  const j = jobs[jobs.length - 1]
  const secs = Math.max(0, Math.round((Date.now() - jobs[0].started) / 1000))
  return (
    <div className="job-overlay">
      <div className="job-card" role="status" aria-live="polite">
        <span className="drain-grate lg" aria-hidden="true"><i /><i /><i /><i /><i /></span>
        <strong className="job-title">{labelOf(j)}{jobs.length > 1 ? ` (+${jobs.length - 1})` : ''}</strong>
        <span className="job-stage">{STAGE_LABEL[j.stage] || j.stage}</span>
        <span className="job-time" aria-label={`Czas oczekiwania ${clock(secs)}`}>{clock(secs)}</span>
        <button className="btn ghost" onClick={() => setHidden(true)}>Ukryj – zadanie potrwa w tle</button>
      </div>
    </div>
  )
}
