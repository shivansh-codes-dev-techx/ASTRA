import RiskRing from './RiskRing'
import { FACTOR_WEIGHTS, LEVEL_TEXT, RISK_COLORS } from './data'
export default function RiskAnalysis({ data, level }) {
  const color = RISK_COLORS[level]
  return (
    <section aria-label="Risk analysis" className="glass rounded-3xl p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-medium">Risk Analysis</h2>
        <span className="rounded-full border px-3 py-1 text-xs" style={{ color, borderColor:color+'88', background:color+'1a' }}>{level}</span>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <RiskRing score={data.score} color={color} size={96} stroke={9}/>
        <p className="muted text-sm leading-snug">{LEVEL_TEXT[level]}</p>
      </div>
      <ul className="mt-5 space-y-3">
        {FACTOR_WEIGHTS.map(({ key, label, weight }) => (
          <li key={key}>
            <div className="mb-1 flex justify-between text-xs"><span>{label} <span className="muted">· {weight}%</span></span><span className="muted">{data.factors[key]}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={data.factors[key]} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
              <div className="h-full rounded-full" style={{ width:`${data.factors[key]}%`, background:color, transition:'width .7s ease' }}/>
            </div>
          </li>
        ))}
      </ul>
      <p className="muted mt-4 text-[11px]">Demonstration data · weights shown for layout only.</p>
    </section>
  )
}
