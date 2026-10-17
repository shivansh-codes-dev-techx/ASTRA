import { useEffect, useRef } from 'react'

function Snow({ reduced }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current, ctx = c.getContext('2d')
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    let w = 0, h = 0, flakes = [], raf = 0, last = 0
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = 64
    const sg = sprite.getContext('2d'), g = sg.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(.3, 'rgba(210,242,255,.9)');
    g.addColorStop(.58, 'rgba(153,205,216,.48)');
    g.addColorStop(1, 'rgba(153,205,216,0)')
    sg.fillStyle = g; sg.fillRect(0, 0, 64, 64)
    const make = (spread) => ({ x: Math.random() * (w + 200) - 100, y: spread ? Math.random() * h : -40, z: Math.random(), ph: Math.random() * 6.28 })
    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      for (const f of flakes) {
        const s = 3 + f.z * f.z * 30
        ctx.globalAlpha = .3 + f.z * .55
        ctx.drawImage(sprite, f.x - s / 2, f.y - s / 2, s, s)
      }
    }
    const resize = () => {
      w = c.clientWidth; h = c.clientHeight; c.width = w * dpr; c.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      flakes = Array.from({ length: Math.min(340, Math.round(w * h / 4500)) }, () => make(true))
      if (reduced) draw()
    }
    const tick = (t) => {
      const dt = Math.min((t - (last || t)) / 1000, .05); last = t
      for (const f of flakes) {
        f.y += (50 + f.z * 190) * dt
        f.x += (-40 * f.z + Math.sin(t / 900 + f.ph) * 22) * dt
        if (f.y > h + 40 || f.x < -120) Object.assign(f, make(false))
      }
      draw(); raf = requestAnimationFrame(tick)
    }
    resize(); window.addEventListener('resize', resize)
    if (!reduced) raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
  }, [reduced])
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" style={{ filter: 'blur(.6px)' }} />
}

const DASHES = [0, 1, 2, 3, 4, 5]

export default function SnowRideBackground() {
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[#102552]">
      <style>{`
        @keyframes road-dash{from{transform:scale(.06);opacity:0}15%{opacity:.9}to{transform:scale(1.7);opacity:1}}
        .road-dash{transform-origin:720px 520px;animation:road-dash 2.4s linear infinite}
        @media (prefers-reduced-motion:reduce){.road-dash{animation:none;transform:scale(.7);opacity:.8}}
      `}</style>

      {/* Blurred rider-view scene */}
      <svg className="absolute -inset-6 h-[calc(100%+3rem)] w-[calc(100%+3rem)]" style={{ filter: 'blur(7px)' }} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#081329"/><stop offset=".6" stopColor="#102552"/><stop offset="1" stopColor="#242e49"/></linearGradient>
          <linearGradient id="mtF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#526b91"/><stop offset=".45" stopColor="#263e68"/><stop offset="1" stopColor="#152746"/></linearGradient>
          <linearGradient id="mtN" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#344d76"/><stop offset=".4" stopColor="#182b4c"/><stop offset="1" stopColor="#101d36"/></linearGradient>
          <linearGradient id="gnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#263e68"/><stop offset=".35" stopColor="#152746"/><stop offset="1" stopColor="#081329"/></linearGradient>
          <linearGradient id="fog" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#99cdd8" stopOpacity="0"/><stop offset=".6" stopColor="#99cdd8" stopOpacity=".55"/><stop offset="1" stopColor="#99cdd8" stopOpacity="0"/></linearGradient>
          <linearGradient id="beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#99cdd8" stopOpacity=".5"/><stop offset="1" stopColor="#99cdd8" stopOpacity="0"/></linearGradient>
        </defs>
        <rect width="1440" height="900" fill="url(#sky)"/>
        <path d="M0 530V430L90 380 170 430 260 340 350 420 430 370 520 440 620 330 720 420 810 360 900 440 1000 350 1100 430 1190 330 1280 410 1360 360 1440 420V530Z" fill="url(#mtF)"/>
        <rect y="400" width="1440" height="140" fill="url(#fog)"/>
        <path d="M0 545V470L120 410 220 480 330 390 440 490 560 430 660 500 760 465 870 500 980 410 1090 490 1200 420 1320 490 1440 440V545Z" fill="url(#mtN)"/>
        <rect y="440" width="1440" height="120" fill="url(#fog)"/>
        <rect y="518" width="1440" height="382" fill="url(#gnd)"/>
        {/* road */}
        <path d="M708 520H732L1560 900H-120Z" fill="#09152c"/>
        <path d="M708 520L-120 900M732 520L1560 900" stroke="#99cdd8" strokeOpacity=".7" strokeWidth="6" fill="none"/>
        {DASHES.map((i) => (
          <rect key={i} className="road-dash" x="710" y="900" width="20" height="130" rx="4" fill="#ffffff" style={{ animationDelay: `${-(i * 0.4)}s` }}/>
        ))}
        {/* headlight beam */}
        <path d="M690 880L420 900 600 540H840L1020 900 750 880Z" fill="url(#beam)" opacity=".55"/>
        {/* motorbike: handlebar, mirrors, tank edge */}
        <path d="M0 860C200 820 420 850 560 900H0Z M1440 860C1240 820 1020 850 880 900H1440Z" fill="#060d1d"/>
        <path d="M120 840L250 700M1320 840L1190 700" stroke="#050a0b" strokeWidth="12" strokeLinecap="round"/>
        <ellipse cx="260" cy="690" rx="62" ry="40" fill="#102552" transform="rotate(-18 260 690)"/>
        <ellipse cx="1180" cy="690" rx="62" ry="40" fill="#102552" transform="rotate(18 1180 690)"/>
        <ellipse cx="260" cy="690" rx="46" ry="28" fill="#99cdd8" opacity=".5" transform="rotate(-18 260 690)"/>
        <ellipse cx="1180" cy="690" rx="46" ry="28" fill="#99cdd8" opacity=".5" transform="rotate(18 1180 690)"/>
      </svg>

      <Snow reduced={reduced}/>

      {/* Midnight-blue tint and vignette for a snowy night atmosphere */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, rgba(16,37,82,.16) 0%, rgba(8,19,41,.68) 100%), linear-gradient(180deg, rgba(16,37,82,.25), rgba(8,19,41,.52))' }}/>
    </div>
  )
}
