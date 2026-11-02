import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase, configMissing } from './supabase.js'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Account from './pages/Account.jsx'
import Users from './pages/Users.jsx'
import Soon from './pages/Soon.jsx'
import Products from './pages/Products.jsx'
import Rules from './pages/Rules.jsx'
import Knowledge from './pages/Knowledge.jsx'
import Templates from './pages/Templates.jsx'
import Keywords from './pages/Keywords.jsx'
import Review from './pages/Review.jsx'
import Library from './pages/Library.jsx'
import Publish from './pages/Publish.jsx'
import BaseParams from './pages/BaseParams.jsx'
import Help from './pages/Help.jsx'
import Learning from './pages/Learning.jsx'
import Images from './pages/Images.jsx'
import StudioHome from './pages/StudioHome.jsx'
import ModulePage from './pages/ModulePage.jsx'
import Analytics from './pages/Analytics.jsx'
import Prices from './pages/Prices.jsx'
import PriceBase from './pages/PriceBase.jsx'
import Leads from './pages/Leads.jsx'
import Offer from './pages/Offer.jsx'
import Titles from './pages/Titles.jsx'
import Settings from './pages/Settings.jsx'
import QaRules from './pages/QaRules.jsx'
import Tree from './pages/Tree.jsx'
import DrainLoader from './components/DrainLoader.jsx'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    if (configMissing) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setProfile(null); return }
    supabase.from('profiles').select('id, email, full_name, role').eq('id', session.user.id).single()
      .then(({ data }) => setProfile(data))
  }, [session])

  if (configMissing) {
    return (
      <main className="center-screen">
        <div className="panel narrow">
          <h1>Brakuje konfiguracji</h1>
          <p>Strona nie zna adresu bazy. Dodaj w repozytorium GitHub zmienne <code>VITE_SUPABASE_URL</code> i <code>VITE_SUPABASE_ANON_KEY</code> (Settings → Secrets and variables → Actions → Variables), a potem uruchom wdrożenie ponownie.</p>
        </div>
      </main>
    )
  }
  if (session === undefined) return <main className="center-screen"><DrainLoader /></main>
  if (!session) return <Login />

  const soon = (title, stage) => <Soon title={title} stage={stage} />
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout profile={profile} />}>
          <Route index element={<StudioHome profile={profile} />} />
          <Route path="tresci" element={<Dashboard profile={profile} />} />
          <Route path="analityka" element={<Analytics profile={profile} />} />
          <Route path="oferta" element={<Offer profile={profile} />} />
          <Route path="tytuly" element={<Titles profile={profile} />} />
          <Route path="pozyskiwanie" element={<Leads profile={profile} />} />
          <Route path="ceny" element={<Prices profile={profile} />} />
          <Route path="ceny/cenniki" element={<PriceBase profile={profile} />} />
          <Route path="operacje" element={<ModulePage moduleKey="operacje" />} />
          <Route path="drzewo" element={<Tree />} />
          <Route path="produkty" element={<Products />} />
          <Route path="slownik" element={<Rules profile={profile} />} />
          <Route path="wiedza" element={<Knowledge profile={profile} />} />
          <Route path="szablony" element={<Templates profile={profile} />} />
          <Route path="szablony/:mp" element={<Templates profile={profile} />} />
          <Route path="szablony/:mp/:ch" element={<Templates profile={profile} />} />
          <Route path="szablony/:mp/:ch/:tid" element={<Templates profile={profile} />} />
          <Route path="frazy" element={<Keywords profile={profile} />} />
          <Route path="weryfikacja" element={<Review profile={profile} />} />
          <Route path="weryfikacja/:id" element={<Review profile={profile} />} />
          <Route path="biblioteka" element={<Library profile={profile} />} />
          <Route path="publikacja" element={<Publish profile={profile} />} />
          <Route path="parametry" element={<BaseParams profile={profile} />} />
          <Route path="pomoc" element={<Help />} />
          <Route path="nauka" element={<Learning profile={profile} />} />
          <Route path="grafiki" element={<Images profile={profile} />} />
          <Route path="ustawienia" element={!profile ? null : profile.role === 'admin' ? <Settings /> : <Navigate to="/" />} />
          <Route path="reguly" element={<QaRules profile={profile} />} />
          <Route path="uzytkownicy" element={!profile ? null : profile.role === 'admin' ? <Users /> : <Navigate to="/" />} />
          <Route path="konto" element={<Account profile={profile} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
