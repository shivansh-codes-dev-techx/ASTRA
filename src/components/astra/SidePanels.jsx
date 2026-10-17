import { useState } from 'react'
import { Database, ShieldAlert, Sparkles, Send, ArrowUpRight } from 'lucide-react'

export function WeatherIntelCard({ location }) {
  return (
    <section className="glass glass-hover rounded-3xl p-4" aria-label="Weather intelligence status">
      <div className="flex items-center gap-3">
        <span className="icon-btn h-11 w-11 text-[var(--mint)]"><Database size={18}/></span>
        <div><h3 className="font-medium leading-tight">Weather Intelligence</h3><p className="muted text-xs">{location}</p></div>
      </div>
      <dl className="mt-4 space-y-1 text-xs">
        <div className="flex justify-between"><dt className="muted">Data status</dt><dd className="text-[var(--mod)]">Demo data</dd></div>
        <div className="flex justify-between"><dt className="muted">Source</dt><dd>Not connected</dd></div>
        <div className="flex justify-between"><dt className="muted">Last update</dt><dd>Not available</dd></div>
      </dl>
    </section>
  )
}

export function EmergencyCard({ onOpen }) {
  return (
    <section id="emergency" className="glass glass-hover rounded-3xl p-4" aria-label="Emergency resources">
      <div className="flex items-center gap-3">
        <span className="icon-btn h-11 w-11 text-[var(--ext)]"><ShieldAlert size={18}/></span>
        <h3 className="font-medium leading-tight">Emergency Resources</h3>
      </div>
      <p className="muted mt-3 text-xs leading-snug">Guidance preview: move to higher ground in floods, stay indoors during lightning, keep a charged phone and basic supplies ready.</p>
      <button type="button" onClick={onOpen}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-red-400/40 bg-red-500/20 py-2.5 text-sm font-medium transition hover:bg-red-500/30 active:scale-[.98]">
        Emergency Mode <ArrowUpRight size={15}/>
      </button>
    </section>
  )
}

export function AssistantCard() {
  const [text, setText] = useState('')
  const [note, setNote] = useState(false)
  const submit = (e) => { e.preventDefault(); if (text.trim()) { setNote(true); setText('') } }
  return (
    <section className="glass rounded-3xl p-4" aria-label="ASTRA AI Assistant">
      <div className="flex items-center gap-3">
        <span className="icon-btn h-11 w-11 text-[var(--mint)]"><Sparkles size={18}/></span>
        <div><h3 className="font-medium leading-tight">ASTRA AI Assistant</h3><p className="muted text-xs">Prototype · not connected</p></div>
      </div>
      <div className="glass-deep mt-3 grid min-h-[72px] place-items-center rounded-2xl p-3 text-center text-xs">
        {note ? <p className="text-[var(--mod)]">The assistant isn't connected yet, so no reply was generated.</p>
              : <p className="muted">Ask about conditions, risk, or preparedness once the assistant is connected.</p>}
      </div>
      <form onSubmit={submit} className="mt-3 flex items-center gap-2">
        <input value={text} onChange={(e)=>setText(e.target.value)} placeholder="Ask about the weather…" aria-label="Message the assistant"
          className="glass-deep min-w-0 flex-1 rounded-full px-4 py-2.5 text-sm placeholder:text-[var(--sage)]/70 focus:outline-none"/>
        <button type="submit" aria-label="Send" className="icon-btn h-10 w-10 shrink-0"><Send size={15}/></button>
      </form>
    </section>
  )
}
