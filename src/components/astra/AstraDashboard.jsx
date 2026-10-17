import { useEffect, useState } from 'react'
import { Thermometer, CloudRain, Wind, Droplets, X, PhoneCall } from 'lucide-react'
import './astra.css'
import SnowRideBackground from './SnowRideBackground'
import TopNav from './TopNav'
import RiskRing from './RiskRing'
import MetricCard from './MetricCard'
import LocationPills from './LocationPills'
import RiskMap from './RiskMap'
import RiskAnalysis from './RiskAnalysis'
import Alerts from './Alerts'
import BottomStrip from './BottomStrip'
import { WeatherIntelCard, EmergencyCard, AssistantCard } from './SidePanels'
import { LOCATIONS, levelFor, RISK_COLORS } from './data'

function EmergencyDialog({ onClose }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Emergency Mode" onClick={(e)=>e.stopPropagation()} className="glass-shell max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[2rem] p-6">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-2xl font-light">Emergency Mode</h2><p className="muted text-xs">Preview · general guidance only</p></div>
          <button type="button" onClick={onClose} aria-label="Close emergency panel" className="icon-btn h-10 w-10"><X size={16}/></button>
        </div>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-snug">
          <li>Move to higher ground and avoid walking or driving through floodwater.</li>
          <li>Stay indoors during lightning; keep away from windows and metal objects.</li>
          <li>Keep your phone charged and basic supplies (water, torch, first aid) ready.</li>
          <li>Follow instructions from official local authorities.</li>
        </ul>
        <div className="glass-deep mt-5 flex items-center gap-3 rounded-2xl p-3 text-sm">
          <PhoneCall size={18} className="text-[var(--ext)]"/>
          <p>India's national emergency number: <strong>112</strong></p>
        </div>
        <p className="muted mt-4 text-[11px] leading-snug">ASTRA does not contact emergency services or share your location, and is not a substitute for official warnings.</p>
        <button type="button" onClick={onClose} className="pill mt-5 w-full rounded-full border border-white/15 py-2.5 text-sm" aria-pressed="false">Return to dashboard</button>
      </div>
    </div>
  )
}

export default function AstraDashboard() {
  const [loc, setLoc] = useState('Ghaziabad')
  const [active, setActive] = useState('dashboard')
  const [emergency, setEmergency] = useState(false)
  const d = LOCATIONS[loc], level = levelFor(d.score), color = RISK_COLORS[level]

  const go = (id) => {
    setActive(id)
    if (id === 'dashboard') window.scrollTo({ top:0, behavior:'smooth' })
    else document.getElementById(id)?.scrollIntoView({ behavior:'smooth', block:'start' })
  }

  return (
    <div className="astra-root relative isolate min-h-screen overflow-x-hidden">
      <SnowRideBackground/>
      <div id="dashboard" className="relative z-10 mx-auto max-w-[1280px] p-3 sm:p-6">
        <div className="glass-shell astra-in rounded-[2rem] p-4 sm:rounded-[2.75rem] sm:p-8">
          <TopNav active={active} onNavigate={go}/>

          <header id="live-weather" className="mt-8 flex scroll-mt-4 flex-col gap-6 xl:flex-row xl:items-center">
            <div className="flex items-center gap-5 xl:w-[44%]">
              <div>
                <h1 className="text-4xl font-light leading-[1.05] sm:text-5xl">Weather<br/>Intelligence</h1>
                <p className="muted mt-2 text-sm">From Weather Data to Actionable Risk.</p>
                <p className="mt-2 text-xs"><span className="muted">{loc}, India</span> <span className="ml-2 rounded-full border border-amber-300/40 px-2 py-0.5 text-[10px] text-[var(--mod)]">DEMO DATA</span></p>
              </div>
              <RiskRing score={d.score} color={color} size={92}/>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-3 xl:grid-cols-4">
              <MetricCard icon={Thermometer} label="Temperature" value={d.temp} unit="°C"/>
              <MetricCard icon={CloudRain} label="Rain probability" value={d.rain} unit="%"/>
              <MetricCard icon={Wind} label="Wind speed" value={d.wind} unit="km/h"/>
              <MetricCard icon={Droplets} label="Humidity" value={d.hum} unit="%"/>
            </div>
          </header>

          <div className="mt-6"><LocationPills locations={Object.keys(LOCATIONS)} selected={loc} onSelect={setLoc}/></div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="glass-deep space-y-4 rounded-[2rem] p-3 sm:p-4">
              <div className="grid gap-4 md:grid-cols-5">
                <div className="md:col-span-3"><RiskMap selected={loc} onSelect={setLoc}/></div>
                <div className="md:col-span-2"><RiskAnalysis data={d} level={level}/></div>
              </div>
              <Alerts location={loc}/>
            </div>
            <aside className="grid content-start gap-4 sm:grid-cols-3 lg:grid-cols-1">
              <WeatherIntelCard location={loc}/>
              <EmergencyCard onOpen={()=>{ setActive('emergency'); setEmergency(true) }}/>
              <AssistantCard/>
            </aside>
          </div>

          <BottomStrip location={loc} summary={d.summary} level={level} color={color}/>
        </div>
        <p className="muted py-4 text-center text-[11px]">ASTRA prototype · all values are demonstration data</p>
      </div>
      {emergency && <EmergencyDialog onClose={()=>setEmergency(false)}/>}
    </div>
  )
}
