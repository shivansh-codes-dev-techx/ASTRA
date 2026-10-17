import { MapPin } from 'lucide-react'
export default function LocationPills({ locations, selected, onSelect }) {
  return (
    <div role="group" aria-label="Select location" className="no-scrollbar flex items-center gap-1 overflow-x-auto">
      <MapPin size={16} className="muted mr-1 shrink-0"/>
      {locations.map((name) => (
        <button key={name} type="button" aria-pressed={selected===name} onClick={()=>onSelect(name)}
          className="pill shrink-0 rounded-full px-5 py-2.5 text-sm">{name}</button>
      ))}
    </div>
  )
}
