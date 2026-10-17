export default function BottomStrip({ location, summary, level, color }) {
  const items = [['Location', location], ['Conditions', summary], ['Risk level', level], ['Data status', 'Demo data']]
  return (
    <div className="glass-deep mt-4 grid grid-cols-2 gap-x-4 gap-y-4 rounded-3xl p-5 lg:grid-cols-4">
      {items.map(([k, v]) => (
        <div key={k}>
          <p className="muted text-xs">{k}</p>
          <p className="mt-1 text-xl font-light sm:text-2xl" style={k==='Risk level' ? { color } : undefined}>{v}</p>
        </div>
      ))}
    </div>
  )
}
