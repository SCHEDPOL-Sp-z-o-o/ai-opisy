import { supabase, N8N_URL } from './supabase.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Zleca zadanie n8n i czeka na wynik zapisany w bazie
// Moduł publikacji działa jako osobny workflow – adres wyliczany z adresu głównego
export const PUBLISH_URL = N8N_URL.replace('ai-opisy-zadania', 'ai-opisy-publikacja')
// Osobny workflow na dane z zewnątrz (Dealavo) – awaria nie dotyka publikacji
export const DATA_URL = N8N_URL.replace('ai-opisy-zadania', 'studio-dane')
// Pozyskiwanie klientów – osobny workflow (research, kwalifikacja, przekazanie do ClickUp)
export const LEADS_URL = N8N_URL.replace('ai-opisy-zadania', 'studio-pozyskiwanie')
// Tytuły produktów – osobny workflow
export const TITLES_URL = N8N_URL.replace('ai-opisy-zadania', 'studio-tytuly')

// Aktywne zadania AI/n8n – logo w menu i nakładka na środku ekranu pokazują, że coś się dzieje
export const jobActivity = new EventTarget()
const active = new Map()   // id → { type, stage, started }
let seq = 0
const emit = () => jobActivity.dispatchEvent(new CustomEvent('change', { detail: active.size }))
export const activeJobCount = () => active.size
export const activeJobList = () => [...active.values()]

export async function runJob(jobType, payload, opts = {}) {
  const id = ++seq
  active.set(id, { type: jobType, mode: payload?.mode || null, lang: payload?.lang || null, stage: 'przygotowanie', started: Date.now() }); emit()
  const onStage = st => { const j = active.get(id); if (j) { j.stage = st; emit() } opts.onStage?.(st) }
  try { return await runJobInner(jobType, payload, { ...opts, onStage }) } finally { active.delete(id); emit() }
}

async function runJobInner(jobType, payload, { onStage, timeoutSec = 120, url = N8N_URL } = {}) {
  if (!url) throw new Error('Brakuje adresu n8n (zmienna VITE_N8N_WEBHOOK_URL).')
  const { data: { session } } = await supabase.auth.getSession()
  const ins = await supabase.from('jobs').insert({ job_type: jobType, payload, created_by: session.user.id }).select('id').single()
  if (ins.error) throw new Error(ins.error.message)
  const jobId = ins.data.id
  onStage?.('wyslane')
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ job_id: jobId }),
    })
  } catch {
    await supabase.from('jobs').update({ status: 'blad', error: 'Brak połączenia z n8n' }).eq('id', jobId).eq('status', 'w_kolejce')
    throw new Error(url === N8N_URL ? 'Brak połączenia z n8n. Sprawdź, czy workflow jest włączony.' : url === DATA_URL ? 'Brak połączenia z workflow „Studio – dane rynkowe”. Sprawdź w n8n, czy jest zaimportowany i włączony.' : url === LEADS_URL ? 'Brak połączenia z workflow „Studio – pozyskiwanie”. Sprawdź w n8n, czy jest zaimportowany i włączony.' : url === TITLES_URL ? 'Brak połączenia z workflow „Studio – tytuły”. Sprawdź w n8n, czy jest zaimportowany i włączony.' : 'Brak połączenia z workflow publikacji. Sprawdź, czy „AI Opisy – publikacja” jest włączony.')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    await supabase.from('jobs').update({ status: 'blad', error: body.error || `kod ${res.status}` }).eq('id', jobId).eq('status', 'w_kolejce')
    throw new Error(body.error || `n8n odrzucił zadanie (kod ${res.status}).`)
  }
  onStage?.('w_toku')
  for (let i = 0; i < timeoutSec / 2; i++) {
    await sleep(2000)
    const { data } = await supabase.from('jobs').select('status, result, error').eq('id', jobId).single()
    if (data?.status === 'gotowe') return data.result
    if (data?.status === 'blad') throw new Error(data.error || 'n8n zgłosił błąd zadania.')
  }
  await supabase.from('jobs').update({ status: 'blad', error: 'Przekroczony czas oczekiwania w aplikacji' }).eq('id', jobId).in('status', ['w_kolejce', 'w_toku'])
  throw new Error('n8n nie zakończył zadania w oczekiwanym czasie – prawdopodobnie zatrzymał się na błędzie. Otwórz Executions w n8n i sprawdź czerwony node.')
}

// Zleca zadanie i wraca od razu po przyjęciu przez n8n (postęp śledzimy po statusach opisów)
export async function startJob(jobType, payload) {
  if (!N8N_URL) throw new Error('Brakuje adresu n8n (zmienna VITE_N8N_WEBHOOK_URL).')
  const { data: { session } } = await supabase.auth.getSession()
  const ins = await supabase.from('jobs').insert({ job_type: jobType, payload, created_by: session.user.id }).select('id').single()
  if (ins.error) throw new Error(ins.error.message)
  let res
  try {
    res = await fetch(N8N_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ job_id: ins.data.id }) })
  } catch { throw new Error('Brak połączenia z n8n. Sprawdź, czy workflow jest włączony.') }
  if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || `n8n odrzucił zadanie (kod ${res.status}).`) }
  return ins.data.id
}
