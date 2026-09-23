import heroAnimation from "../assets/astra-hero.mp4";

function Dashboard() {
  return (
    <div className="min-h-screen bg-[#05020f] text-white overflow-hidden">

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center px-6 py-10">

        {/* Ambient glow */}
        <div className="absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/10 blur-[120px]" />

        {/* Main content */}
        <div className="relative z-10 w-full max-w-7xl">

          {/* Top status */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <p className="text-sm tracking-[0.35em] text-violet-300 uppercase">
                Climate Risk Intelligence
              </p>

              <h1 className="mt-2 text-4xl font-bold tracking-tight md:text-6xl">
                ASTRA
              </h1>
            </div>

            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-xl">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" />
              <span className="text-sm text-slate-300">
                System Online
              </span>
            </div>
          </div>

          {/* Main HUD */}
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.5fr_1fr]">

            {/* Left information */}
            <div className="space-y-6">

              <div className="border-l border-violet-500/40 pl-5">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                  Current Location
                </p>

                <h2 className="mt-2 text-2xl font-semibold">
                  Ghaziabad
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Real-time environmental monitoring
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
                  <p className="text-xs text-slate-500">
                    Temperature
                  </p>
                  <p className="mt-2 text-2xl font-semibold">
                    33.9°C
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl">
                  <p className="text-xs text-slate-500">
                    Humidity
                  </p>
                  <p className="mt-2 text-2xl font-semibold">
                    45%
                  </p>
                </div>
              </div>

            </div>

            {/* Central animation */}
            <div className="relative flex items-center justify-center">

              <div className="relative w-full max-w-[620px] overflow-hidden rounded-[32px] border border-violet-400/20 bg-black shadow-[0_0_80px_rgba(124,58,237,0.18)]">

                <video
                  src={heroAnimation}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="block h-auto w-full object-cover"
                />

                {/* HUD overlay */}
                <div className="pointer-events-none absolute inset-0">
                  <div className="absolute left-5 top-5 h-10 w-10 border-l border-t border-cyan-400/60" />
                  <div className="absolute right-5 top-5 h-10 w-10 border-r border-t border-cyan-400/60" />
                  <div className="absolute bottom-5 left-5 h-10 w-10 border-b border-l border-cyan-400/60" />
                  <div className="absolute bottom-5 right-5 h-10 w-10 border-b border-r border-cyan-400/60" />
                </div>

              </div>

            </div>

            {/* Right risk information */}
            <div className="space-y-5">

              <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.04] p-6 backdrop-blur-xl">

                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                  Current Risk
                </p>

                <div className="mt-5 flex items-end gap-3">
                  <span className="text-6xl font-bold text-emerald-400">
                    7
                  </span>

                  <span className="mb-2 text-slate-500">
                    / 100
                  </span>
                </div>

                <p className="mt-2 text-xl font-semibold text-emerald-400">
                  LOW
                </p>

                <p className="mt-3 text-sm leading-6 text-slate-500">
                  No significant environmental risk detected at the
                  selected location.
                </p>

              </div>

              <div className="grid grid-cols-2 gap-3">

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs text-slate-500">
                    Wind
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    4.6 km/h
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-xs text-slate-500">
                    Rain
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    0%
                  </p>
                </div>

              </div>

            </div>

          </div>

          {/* Bottom message */}
          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-center md:flex-row md:text-left">

            <div>
              <p className="text-sm text-slate-400">
                Understand the risk.
              </p>

              <p className="text-sm text-slate-600">
                Prepare before it happens.
              </p>
            </div>

            <div className="text-xs uppercase tracking-[0.25em] text-slate-600">
              ASTRA • Live Environmental Intelligence
            </div>

          </div>

        </div>
      </section>
    </div>
  );
}

export default Dashboard;
