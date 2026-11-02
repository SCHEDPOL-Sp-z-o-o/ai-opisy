import { useState } from 'react'
import { supabase, plError, N8N_URL } from '../supabase.js'

const STEPS = ['Zadanie zapisane w bazie', 'n8n przyjął zadanie', 'Wynik zapisany w bazie']
const sleep = ms => new Promise(r => setTimeout(r, ms))

export default function N8nTest() {
  const [done, setDone] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  async function run() {
    setBusy(true); setError(''); setResult(null); setDone(0)
    let jobId = null
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const ins = await supabase.from('jobs').insert({ job_type: 'ping', payload: {}, created_by: session.user.id }).select('id').single()
      if (ins.error) throw new Error(plError(ins.error.message))
      jobId = ins.data.id
      setDone(1)

      let res
      try {
        res = await fetch(N8N_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ job_id: jobId }),
        })
      } catch {
        throw new Error('Brak połączenia z n8n. Sprawdź, czy workflow jest włączony (Active), a w zmiennej VITE_N8N_WEBHOOK_URL jest Production URL.')
      }
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || `n8n odrzucił zadanie (kod ${res.status}).`)
      setDone(2)

      for (let i = 0; i < 20; i++) {
        await sleep(1500)
        const { data } = await supabase.from('jobs').select('status, result, error').eq('id', jobId).single()
        if (data?.status === 'gotowe') { setResult(data.result); setDone(3); return }
        if (data?.status === 'blad') throw new Error(data.error || 'n8n zgłosił błąd zadania.')
      }
      throw new Error('n8n przyjął zadanie, ale nie zapisał wyniku w ciągu 30 sekund. Sprawdź listę wykonań (Executions) w n8n.')
    } catch (e) {
      setError(e.message)
      if (jobId) await supabase.from('jobs').update({ status: 'blad', error: e.message }).eq('id', jobId).eq('status', 'w_kolejce')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <h2>Połączenie z n8n</h2>
      {!N8N_URL ? (
        <p className="hint">Brakuje adresu n8n. Dodaj w GitHub zmienną <code>VITE_N8N_WEBHOOK_URL</code> i uruchom wdrożenie ponownie.</p>
      ) : (
        <>
          <p className="muted">Wysyła zadanie testowe: aplikacja → n8n → baza. Zużywa jedno wykonanie z limitu n8n.</p>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s} className={i < done ? 'step-done' : busy && i === done ? 'step-active' : ''}>{s}</li>
            ))}
          </ol>
          {result && <p className="ok" role="status">Działa. {result.message} ({new Date(result.n8n_time).toLocaleTimeString('pl-PL')}).</p>}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" onClick={run} disabled={busy}>{busy ? 'Trwa test…' : 'Wyślij zadanie testowe'}</button>
        </>
      )}
    </div>
  )
}
