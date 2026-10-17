export default function MetricCard({ icon:Icon, label, value, unit }) {
  return (
    <div className="glass glass-hover rounded-3xl p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="muted text-sm">{label}</p>
        <span className="icon-btn h-8 w-8 text-[var(--mint)]"><Icon size={15}/></span>
      </div>
      <p className="mt-2 text-4xl font-light leading-none sm:text-5xl">{value}<span className="sup-unit">{unit}</span></p>
    </div>
  )
}
