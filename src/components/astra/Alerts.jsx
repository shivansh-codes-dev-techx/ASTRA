import { SAMPLE_ALERTS, RISK_COLORS } from './data'
import { TriangleAlert } from 'lucide-react'
export default function Alerts({ location }) {
  return (
    <section id="alerts" aria-label="Recent alerts" className="glass rounded-3xl p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium">Recent Alerts <span className="muted text-sm font-normal">· {location}</span></h2>
        <span className="muted rounded-full border border-white/10 px-3 py-1 text-[11px]">Sample content — not official warnings</span>
      </div>
      <ul className="grid gap-3 md:grid-cols-3">
        {SAMPLE_ALERTS.map((a) => (
          <li key={a.id} className="glass-deep rounded-2xl p-3" style={{ borderLeft:`3px solid ${RISK_COLORS[a.severity]}` }}>
            <div className="flex items-center gap-2 text-sm font-medium"><TriangleAlert size={14} color={RISK_COLORS[a.severity]}/>{a.title}</div>
            <p className="muted mt-1 text-xs leading-snug">{a.text}</p>
            <p className="mt-2 text-[10px] tracking-wide" style={{ color:RISK_COLORS[a.severity] }}>{a.severity.toUpperCase()} · <span className="muted">{a.time}</span></p>
          </li>
        ))}
      </ul>
    </section>
  )
}
