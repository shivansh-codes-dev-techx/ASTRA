export default function RiskRing({ score, color, size = 84, stroke = 8, label = true }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width:size, height:size }} role="img" aria-label={`Risk score ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score/100)} style={{ transition:'stroke-dashoffset .8s ease, stroke .4s ease' }}/>
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <div><span className="font-light" style={{ fontSize:size*.3 }}>{score}</span>{label && <span className="muted block text-[9px] tracking-widest">RISK</span>}</div>
      </div>
    </div>
  )
}
