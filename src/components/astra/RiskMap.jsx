import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { LOCATIONS, levelFor, RISK_COLORS } from './data'

function FlyTo({ center }) {
  const map = useMap()
  useEffect(() => { map.flyTo(center, 9, { duration: 1 }) }, [center, map])
  return null
}
export default function RiskMap({ selected, onSelect }) {
  const sel = LOCATIONS[selected]
  return (
    <section id="risk-map" aria-label="Weather risk map" className="glass rounded-3xl p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">Weather Risk Map</h2>
        <ul className="muted flex flex-wrap gap-x-3 text-[11px]">
          {Object.entries(RISK_COLORS).map(([k, c]) => (
            <li key={k} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background:c }}/>{k}</li>
          ))}
        </ul>
      </div>
      <div className="astra-map h-[280px] overflow-hidden rounded-2xl border border-white/10 sm:h-[340px]">
        <MapContainer center={[sel.lat, sel.lng]} zoom={9} scrollWheelZoom={false} className="h-full w-full">
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
          <FlyTo center={[sel.lat, sel.lng]}/>
          {Object.entries(LOCATIONS).map(([name, d]) => {
            const lvl = levelFor(d.score), active = name === selected
            return (
              <CircleMarker key={name} center={[d.lat, d.lng]} radius={active ? 13 : 9}
                pathOptions={{ color:RISK_COLORS[lvl], fillColor:RISK_COLORS[lvl], fillOpacity: active ? .6 : .35, weight: active ? 3 : 2 }}
                eventHandlers={{ click: () => onSelect(name) }}>
                <Popup><strong>{name}</strong><br/>{lvl} risk · score {d.score}<br/><em>Demo data</em></Popup>
              </CircleMarker>
            )
          })}
        </MapContainer>
      </div>
      <p className="muted mt-2 text-[11px]">Marker colors use demo risk scores, not live data.</p>
    </section>
  )
}
