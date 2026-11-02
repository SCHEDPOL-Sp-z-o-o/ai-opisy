import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { MODULES, moduleOfPath, SCREENS, screenOfPath } from '../studio/modules.js'
import HelpDrawer from '../help/HelpDrawer.jsx'
import JobOverlay from './JobOverlay.jsx'
import { APP_VERSION } from '../version.js'
import { jobActivity, activeJobCount } from '../jobs.js'
import { supabase, ROLE_LABELS } from '../supabase.js'

// Menu modułu Generator Treści (w kolejności pracy). Ustawienia i Użytkownicy – Administracja całego Studio.
const GROUPS = [
  { label: 'Start', items: [{ to: '/tresci', label: 'Dashboard' }] },
  { label: 'Produkty', items: [{ to: '/drzewo', label: 'Drzewo produktów' }, { to: '/produkty', label: 'Produkty' }] },
  { label: 'Przygotowanie treści', items: [{ to: '/wiedza', label: 'Księga wiedzy' }, { to: '/frazy', label: 'Frazy kluczowe' }, { to: '/szablony', label: 'Szablony' }, { to: '/tytuly', label: 'Tytuły' }, { to: '/biblioteka', label: 'Biblioteka grafik' }, { to: '/grafiki', label: 'Grafiki na FTP' }] },
  { label: 'Kontrola i publikacja', items: [{ to: '/weryfikacja', label: 'Weryfikacja', badge: 'review' }, { to: '/nauka', label: 'Nauka z uwag', badge: 'learn' }, { to: '/publikacja', label: 'Publikacja' }, { to: '/parametry', label: 'Parametry Base' }] },
  { label: 'Konfiguracja', items: [{ to: '/slownik', label: 'Słownik importu', admin: true }, { to: '/reguly', label: 'Reguły QA' }] },
]
const ADMIN = [{ to: '/ustawienia', label: 'Ustawienia' }, { to: '/uzytkownicy', label: 'Użytkownicy' }]

export default function Layout({ profile }) {
  const [help, setHelp] = useState(false)
  const loc = useLocation()
  const [working, setWorking] = useState(activeJobCount())
  // licznik opisów czekających na weryfikację (odświeżany przy zmianie ekranu)
  const [review, setReview] = useState(0)
  const [learn, setLearn] = useState(0)
  // widoczność modułów dla zespołu (admin widzi wszystkie)
  const [vis, setVis] = useState({ tresci: true, analityka: true })
  const reloadVis = () => supabase.from('app_modules').select('key, team_visible').then(r => { if (!r.error) setVis(Object.fromEntries((r.data || []).map(x => [x.key, x.team_visible]))) })
  useEffect(() => { reloadVis(); document.title = 'SchedpolAI eCommerce Studio' }, [])
  const admin = profile?.role === 'admin'
  // dostęp do zakładek: tryb domyślny (wg roli i widoczności modułów) albo własna lista zakładek
  const [acc, setAcc] = useState({ custom: false, screens: new Set(), ready: false })
  useEffect(() => { if (!profile?.id) return; Promise.all([
    supabase.from('profiles').select('screens_custom').eq('id', profile.id).maybeSingle(),
    supabase.from('user_screens').select('screen').eq('user_id', profile.id),
  ]).then(([p, s]) => setAcc({ custom: !!p.data?.screens_custom && !p.error, screens: new Set((s.data || []).map(x => x.screen)), ready: true })) }, [profile?.id])
  const canSee = key => admin || !acc.custom || acc.screens.has(key)
  const canSeeModule = m => admin || (acc.custom ? SCREENS.some(x => x.module === m.key && acc.screens.has(x.key)) : !!vis[m.key])
  const mods = MODULES.filter(canSeeModule)
  const curScreen = screenOfPath(loc.pathname)
  const screenKeyOf = to => SCREENS.find(x => x.to === to)?.key
  const blocked = acc.ready && curScreen && !canSee(curScreen.key) || (acc.ready && ['/ustawienia', '/uzytkownicy'].some(x => loc.pathname.startsWith(x)) && !admin)
  const cur = moduleOfPath(loc.pathname)
  useEffect(() => {
    supabase.from('descriptions').select('id', { count: 'exact', head: true }).in('status', ['do_weryfikacji', 'poprawki']).then(r => setReview(r.count || 0))
    supabase.from('review_comments').select('id', { count: 'exact', head: true }).is('learned_at', null).then(r => setLearn(r.error ? 0 : r.count || 0))
  }, [loc.pathname])
  useEffect(() => { const f = e => setWorking(e.detail); jobActivity.addEventListener('change', f); return () => jobActivity.removeEventListener('change', f) }, [])
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className={working ? 'brand-mark flowing' : 'brand-mark'} aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <span className="sr-only" role="status">{working ? 'Trwa zadanie AI' : ''}</span>
          <NavLink to="/" className="brand-name" title={working ? `Trwa zadanie AI (${working})` : 'Pulpit Studio'}><strong>SchedpolAI</strong><small>eCommerce Studio</small></NavLink>
        </div>
        <nav aria-label="Moduły Studio" className="module-nav">
          <NavLink to="/" end className={({ isActive }) => 'nav-link module-link' + (isActive ? ' active' : '')}>Pulpit</NavLink>
          {mods.map(m => (
            <NavLink key={m.key} to={m.home} title={m.status !== 'aktywny' ? 'Moduł w budowie' : undefined} className={() => 'nav-link module-link' + (m.status !== 'aktywny' ? ' building' : '') + (cur?.key === m.key ? ' active' : '')}>
              {m.name}{m.status !== 'aktywny' && <span className="building-dot" aria-label="w budowie" />}
            </NavLink>
          ))}
        </nav>
        {cur?.key === 'tresci' && (
          <nav aria-label="Generator Treści" className="sub-nav">
            {GROUPS.map(g => ({ ...g, items: g.items.filter(n => (!n.admin || admin) && canSee(screenKeyOf(n.to))) })).filter(g => g.items.length).map(g => (
              <div key={g.label} className="nav-group">
                <span className="nav-group-label">{g.label}</span>
                {g.items.map(n => (
                  <NavLink key={n.to} to={n.to} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
                    {n.label}{n.badge === 'review' && review > 0 && <span className="nav-badge" aria-label={`${review} czeka na weryfikację`}>{review}</span>}{n.badge === 'learn' && learn > 0 && <span className="nav-badge soft" aria-label={`${learn} uwag czeka na naukę`}>{learn}</span>}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        )}
        {cur?.menu && (
          <nav aria-label={cur.name} className="sub-nav">
            <div className="nav-group">{cur.menu.filter(n => canSee(screenKeyOf(n.to))).map(n => <NavLink key={n.to} to={n.to} end={!!n.end} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>{n.label}</NavLink>)}</div>
          </nav>
        )}
        {admin && (
          <nav aria-label="Administracja" className="nav-group admin-nav">
            <span className="nav-group-label">Administracja</span>
            {ADMIN.map(n => <NavLink key={n.to} to={n.to} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>{n.label}</NavLink>)}
          </nav>
        )}
        <div className="help-links">
          <NavLink to="/pomoc" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Instrukcja</NavLink>
          {loc.pathname !== '/pomoc' && <button className="nav-link help-btn" onClick={() => setHelp(v => !v)} aria-expanded={help}>? Pomoc do tego ekranu</button>}
        </div>
        <div className="sidebar-foot">
          <span className="app-version" title="Wersja aplikacji">wersja {APP_VERSION}</span>
          <NavLink to="/konto" className="me">
            <span className="me-name">{profile?.full_name || profile?.email || '…'}</span>
            <span className="me-role">{ROLE_LABELS[profile?.role] || ''}</span>
          </NavLink>
          <button className="link-btn" onClick={() => supabase.auth.signOut()}>Wyloguj</button>
        </div>
      </aside>
      <main className="content">
        {blocked
          ? <section className="page"><h1>Brak dostępu</h1><p className="muted">Nie masz dostępu do zakładki „{curScreen?.label || 'Administracja'}”. Jeśli jest Ci potrzebna, poproś administratora o jej przyznanie (Użytkownicy → Dostęp do zakładek).</p></section>
          : <Outlet context={{ vis, reloadVis, canSeeModule }} />}
      </main>
      <HelpDrawer open={help && loc.pathname !== '/pomoc'} onClose={() => setHelp(false)} />
      <JobOverlay />
    </div>
  )
}
