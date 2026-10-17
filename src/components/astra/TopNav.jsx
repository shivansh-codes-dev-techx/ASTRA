import { LayoutDashboard, CloudSun, Map, BellRing, ShieldAlert, Satellite, Settings } from 'lucide-react'
export const NAV = [
  { id:'dashboard', label:'Dashboard', icon:LayoutDashboard },
  { id:'live-weather', label:'Live Weather', icon:CloudSun },
  { id:'risk-map', label:'Risk Map', icon:Map },
  { id:'alerts', label:'Alerts', icon:BellRing },
  { id:'emergency', label:'Emergency', icon:ShieldAlert },
]
export default function TopNav({ active, onNavigate }) {
  return (
    <nav aria-label="Primary" className="flex items-center gap-3">
      <a href="#dashboard" onClick={(e)=>{e.preventDefault(); onNavigate('dashboard')}} className="flex shrink-0 items-center gap-2" aria-label="ASTRA home">
        <span className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-white/10 text-[var(--mint)]"><Satellite size={18}/></span>
        <span className="hidden text-lg font-medium tracking-[.25em] sm:block">ASTRA</span>
      </a>
      <ul className="no-scrollbar glass-deep mx-auto flex min-w-0 items-center gap-1 overflow-x-auto rounded-full p-1.5">
        {NAV.map(({ id, label, icon:Icon }) => (
          <li key={id} className="shrink-0">
            <button type="button" aria-current={active===id} aria-label={label} onClick={()=>onNavigate(id)}
              className="pill flex items-center gap-2 rounded-full px-3 py-2 text-sm sm:px-4">
              <Icon size={15}/><span className={active===id ? 'inline' : 'hidden md:inline'}>{label}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="hidden shrink-0 items-center gap-3 lg:flex">
        <div className="text-right leading-tight"><p className="text-xs font-medium">Demo mode</p><p className="muted text-[10px]">Sample data</p></div>
        <button type="button" disabled aria-label="Settings (coming soon)" title="Settings (coming soon)" className="icon-btn h-10 w-10 opacity-60"><Settings size={16}/></button>
      </div>
    </nav>
  )
}
