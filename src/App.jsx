import { useEffect, useState } from "react";
import {
  Activity,
  Bell,
  Bot,
  CloudRain,
  Droplets,
  Globe2,
  Map,
  MapPin,
  Menu,
  Route,
  ShieldAlert,
  Thermometer,
  Wind,
  X,
  Navigation,
  AlertTriangle,
  CheckCircle2,
  Phone,
  Sparkles,
  ArrowRight,
  LocateFixed,
} from "lucide-react";
import {
  BrowserRouter,
  Routes,
  Route as RouterRoute,
  Link,
  useLocation,
} from "react-router-dom";

import heroAnimation from "./assets/astra-hero.mp4";
import tanmayPhoto from "./assets/tanmay.jpeg";
import rishavPhoto from "./assets/risabh.jpeg";
import shivanshPhoto from "./assets/shivansh.jpeg";
import { getWeatherByCoordinates } from "./services/api";
import { getAssistantResponse } from "./services/assistantService";
import { getRoute } from "./services/routeService";
import MapCard from "./components/MapCard";
import RouteMap from "./components/RouteMap";
import WeatherCard from "./components/WeatherCard";
import RiskCard from "./components/RiskCard";
import AlertCard from "./components/AlertCard";
import EmergencyMode from "./components/EmergencyMode";

const locations = {
  Ghaziabad: [28.6692, 77.4538],
  Delhi: [28.6139, 77.209],
  Noida: [28.5355, 77.391],
  Agra: [27.1767, 78.0081],

  // Additional real locations for broader live-weather testing
  Mumbai: [19.076, 72.8777],
  Bengaluru: [12.9716, 77.5946],
  Kolkata: [22.5726, 88.3639],
  Chennai: [13.0827, 80.2707],
  Hyderabad: [17.385, 78.4867],
  Jaipur: [26.9124, 75.7873],
  Lucknow: [26.8467, 80.9462],
  Guwahati: [26.1445, 91.7362],
  Bhubaneswar: [20.2961, 85.8245],
  Visakhapatnam: [17.6868, 83.2185],
  Hazaribag: [23.9925, 85.3637],
};

const navItems = [
  { label: "Dashboard", path: "/", icon: Activity },
  { label: "Route Planner", path: "/route-planner", icon: Route },
  { label: "Weather", path: "/weather", icon: CloudRain },
  { label: "Risk Map", path: "/risk-map", icon: Map },
  { label: "Alerts", path: "/alerts", icon: Bell },
  { label: "Emergency", path: "/emergency", icon: ShieldAlert },
  { label: "AI Assistant", path: "/assistant", icon: Bot },
  { label: "Developers", path: "/developers", icon: Sparkles },
];

function useAstraData() {
  const [location, setLocation] = useState("Ghaziabad");
  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        const [latitude, longitude] = locations[location];
        const data = await getWeatherByCoordinates(latitude, longitude);
        if (!cancelled) setWeatherData(data);
      } catch (error) {
        console.error("ASTRA API:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [location]);

  return {
    location,
    setLocation,
    weather: weatherData?.weather || null,
    risk: weatherData?.risk || null,
    coordinates: locations[location],
    loading,
  };
}

function AppShell({ children, data }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-[#03040b] text-white">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[#03040b]/80 px-4 py-3 backdrop-blur-2xl sm:px-6">
        <div className="mx-auto grid max-w-[1800px] grid-cols-[1fr_auto_1fr] items-center gap-3">
          <Link to="/" className="flex min-w-0 items-center gap-3 justify-self-start">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/30 bg-violet-500/15">
              <Globe2 size={21} className="text-violet-200" />
            </div>
            <div className="hidden sm:block">
              <p className="font-bold tracking-[0.2em]">ASTRA</p>
              <p className="text-[8px] uppercase tracking-[0.25em] text-slate-500">
                Climate Risk Intelligence
              </p>
            </div>
          </Link>

          <nav className="hidden items-center justify-center gap-0.5 rounded-2xl border border-white/10 bg-white/[0.025] p-1 shadow-[0_0_30px_rgba(34,211,238,0.04)] lg:flex">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-[11px] whitespace-nowrap transition-all ${
                    active
                      ? "border border-violet-400/20 bg-violet-500/20 text-white shadow-[0_0_18px_rgba(139,92,246,0.14)]"
                      : "border border-transparent text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon size={13} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 justify-self-end">
            <div className="hidden rounded-xl border border-emerald-400/20 bg-emerald-400/[0.04] px-3 py-2 xl:block">
              <p className="text-[9px] font-semibold text-emerald-300">● LIVE</p>
              <p className="text-[8px] text-slate-500">Real-time data</p>
            </div>

            {data && (
              <div className="relative hidden sm:block">
                <select
                  value={data.location}
                  onChange={(e) => data.setLocation(e.target.value)}
                  className="appearance-none rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-9 pr-8 text-xs outline-none"
                >
                  {Object.keys(locations).map((city) => (
                    <option key={city} value={city} className="bg-slate-950">
                      {city}
                    </option>
                  ))}
                </select>
                <MapPin
                  size={14}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cyan-300"
                />
              </div>
            )}

            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 lg:hidden"
            >
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="mx-auto mt-3 grid max-w-[1700px] gap-1 rounded-2xl border border-white/10 bg-black/90 p-2 backdrop-blur-xl lg:hidden">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${
                    active
                      ? "bg-violet-500/20 text-white"
                      : "text-slate-300 hover:bg-white/5"
                  }`}
                >
                  <Icon size={17} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>

      {children}
    </div>
  );
}

function PageHero({ eyebrow, title, subtitle, icon: Icon, children }) {
  return (
    <section className="relative overflow-hidden border-b border-white/5 px-5 py-14 sm:px-8 lg:px-12">
      <div className="pointer-events-none absolute left-1/3 top-0 h-80 w-80 rounded-full bg-violet-600/10 blur-[120px]" />
      <div className="relative mx-auto max-w-[1700px]">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div className="max-w-3xl">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-3">
                <Icon size={22} className="text-cyan-300" />
              </div>
              <p className="text-[10px] uppercase tracking-[0.35em] text-cyan-300">
                {eyebrow}
              </p>
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
              {title}
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
              {subtitle}
            </p>
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}

function Metric({ icon: Icon, label, value, color = "text-cyan-300" }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      <Icon size={19} className={color} />
      <p className="mt-5 text-2xl font-bold">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </p>
    </div>
  );
}

function AboutUs() {
  return (
    <section className="relative overflow-hidden border-t border-white/10 bg-[#030611] px-6 py-24">
      <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-cyan-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-violet-500/10 blur-[120px]" />
      <div className="relative mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/5 px-4 py-2 text-xs font-medium uppercase tracking-[0.25em] text-cyan-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />
            About ASTRA
          </div>
          <h2 className="text-4xl font-bold tracking-tight text-white md:text-5xl">
            Built for a <span className="bg-gradient-to-r from-cyan-300 to-violet-400 bg-clip-text text-transparent">safer tomorrow.</span>
          </h2>
          <p className="mt-6 text-base leading-8 text-slate-400 md:text-lg">
            ASTRA is an AI-powered extreme weather and disaster awareness platform designed to turn real-time environmental data into meaningful risk awareness and actionable guidance.
          </p>
        </div>
        <div className="mt-14 grid gap-6 md:grid-cols-2">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-8 shadow-2xl backdrop-blur-xl">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-xl">◈</div>
            <h3 className="text-xl font-semibold text-white">What is ASTRA?</h3>
            <p className="mt-4 leading-7 text-slate-400">
              ASTRA brings weather intelligence, risk assessment, interactive maps, route planning, emergency awareness, and contextual assistance together in one platform.
            </p>
            <p className="mt-4 leading-7 text-slate-400">
              Our goal is simple — help people understand environmental risk before it becomes an emergency.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-8 shadow-2xl backdrop-blur-xl">
            <h3 className="text-xl font-semibold text-white">What ASTRA brings together</h3>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                ["🌦️", "Real-time Weather"],
                ["⚠️", "Dynamic Risk Assessment"],
                ["🗺️", "Interactive Risk Maps"],
                ["🚗", "Route Planning"],
                ["🚨", "Emergency Awareness"],
                ["🤖", "AI Assistance"],
              ].map(([icon, title]) => (
                <div key={title} className="rounded-2xl border border-white/10 bg-black/20 p-4 transition hover:border-cyan-400/30 hover:bg-white/[0.05]">
                  <div className="text-xl">{icon}</div>
                  <p className="mt-2 text-sm font-medium text-slate-200">{title}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 rounded-3xl border border-cyan-400/20 bg-gradient-to-r from-cyan-400/[0.07] to-violet-500/[0.07] p-8 text-center backdrop-blur-xl">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Achievement</p>
          <h3 className="mt-3 text-2xl font-bold text-white">🏆 First Position — NEXXATHON 2026</h3>
          <p className="mt-3 text-sm text-slate-400">
            Developed by a student team at SRM Institute of Science &amp; Technology, Delhi-NCR Campus, Ghaziabad.
          </p>
        </div>
      </div>
    </section>
  );
}

function Dashboard() {
  const data = useAstraData();
  const { weather, risk, location } = data;

  return (
    <AppShell data={data}>
      <div className="relative min-h-[calc(100vh-73px)] overflow-hidden">
        <video
          src={heroAnimation}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(2,3,10,.35)_55%,rgba(2,3,10,.94)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#02030a]/95 via-transparent to-[#02030a]/80" />

        <main className="relative z-10 flex min-h-[calc(100vh-73px)] items-center px-7 py-16 sm:px-12 lg:px-20">
          <div className="w-full">
            <p className="text-xs uppercase tracking-[0.45em] text-cyan-300">
              A Safer Tomorrow
            </p>
            <h1 className="mt-4 text-7xl font-black tracking-tight sm:text-8xl lg:text-9xl">
              ASTRA
            </h1>
            <div className="mt-5 h-px w-24 bg-cyan-300" />
            <h2 className="mt-5 text-xl font-semibold uppercase tracking-[0.15em] sm:text-2xl">
              Understand the risk.
              <br />
              <span className="text-cyan-300">Prepare before it happens.</span>
            </h2>
            <p className="mt-6 max-w-xl text-sm leading-7 text-slate-400 sm:text-base">
              Real-time climate intelligence for safer journeys, better
              decisions and more resilient communities.
            </p>
            <div className="mt-8 flex items-center gap-3">
              <div className="rounded-full border border-cyan-400/30 bg-cyan-400/10 p-3">
                <Globe2 size={18} className="text-cyan-300" />
              </div>
              <div>
                <p className="text-sm font-medium">Monitoring Earth</p>
                <p className="text-[10px] text-slate-500">
                  {location} · Live environmental intelligence
                </p>
              </div>
            </div>
          </div>

          <aside className="absolute right-10 top-1/2 hidden -translate-y-1/2 space-y-5 xl:block">
            <Metric icon={Thermometer} label="Temperature" value={weather ? `${weather.temperature}°C` : "--"} />
            <Metric icon={Droplets} label="Rain Probability" value={weather ? `${weather.rainProbability}%` : "--"} />
            <Metric icon={Wind} label="Wind Speed" value={weather ? `${weather.windSpeed} km/h` : "--"} />
            <Metric icon={ShieldAlert} label="Risk Score" value={risk ? `${risk.score}/100` : "--"} color="text-emerald-300" />
          </aside>
        </main>

        <div className="absolute bottom-7 left-7 right-7 z-20 flex justify-between">
          <div className="rounded-2xl border border-violet-400/20 bg-black/30 px-5 py-4 backdrop-blur-xl">
            <p className="text-xs font-semibold">Live Global Monitoring</p>
            <p className="mt-1 text-[10px] text-slate-500">
              Weather · Risk · Real-time Insights
            </p>
          </div>
          <div className="hidden rounded-2xl border border-cyan-400/20 bg-black/30 px-5 py-4 backdrop-blur-xl sm:block">
            <p className="text-xs font-semibold">Cleaner Journeys</p>
            <p className="mt-1 text-[10px] text-slate-500">
              Safer Roads · Thriving Communities
            </p>
          </div>
        </div>
      </div>

      <AboutUs />
    </AppShell>
  );
}




function RoutePlanner() {
  const data = useAstraData();
  const [destination, setDestination] = useState("Delhi");
  const [route, setRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [destinationData, setDestinationData] = useState(null);
  const [destinationLoading, setDestinationLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadDestinationWeather() {
      setDestinationLoading(true);
      try {
        const [latitude, longitude] = locations[destination];
        const result = await getWeatherByCoordinates(latitude, longitude);
        if (!cancelled) setDestinationData(result);
      } catch (error) {
        console.error("Destination weather error:", error);
        if (!cancelled) setDestinationData(null);
      } finally {
        if (!cancelled) setDestinationLoading(false);
      }
    }

    loadDestinationWeather();

    return () => {
      cancelled = true;
    };
  }, [destination]);

  const analyseRoute = async () => {
    if (destination === data.location) {
      setRouteError("Choose a different destination.");
      setRoute(null);
      return;
    }

    setRouteLoading(true);
    setRouteError("");
    setRoute(null);

    try {
      const [fromLatitude, fromLongitude] = data.coordinates;
      const [toLatitude, toLongitude] = locations[destination];

      const result = await getRoute(
        fromLatitude,
        fromLongitude,
        toLatitude,
        toLongitude
      );

      setRoute(result);
    } catch (error) {
      console.error("Route Planner error:", error);
      setRouteError(error.message || "Unable to calculate the route.");
    } finally {
      setRouteLoading(false);
    }
  };

  const destinationCoordinates = locations[destination];

  return (
    <AppShell data={data}>
      <div className="relative min-h-[calc(100vh-73px)] overflow-hidden bg-[#030611]">
        <div className="pointer-events-none absolute -left-32 top-20 h-96 w-96 rounded-full bg-cyan-500/10 blur-[130px]" />
        <div className="pointer-events-none absolute right-0 top-0 h-96 w-96 rounded-full bg-violet-600/10 blur-[130px]" />

        <main className="relative mx-auto max-w-[1700px] px-5 py-10 sm:px-8 lg:px-12">
          <div className="grid min-h-[760px] gap-6 lg:grid-cols-[430px_1fr]">
            <section className="flex flex-col justify-between rounded-[36px] border border-cyan-400/15 bg-gradient-to-b from-cyan-400/[0.07] via-transparent to-violet-500/[0.04] p-7 sm:p-9">
              <div>
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10">
                  <Route className="text-cyan-300" size={25} />
                </div>

                <p className="mt-8 text-[10px] uppercase tracking-[0.4em] text-cyan-300">
                  ASTRA NAVIGATION
                </p>

                <h1 className="mt-3 text-5xl font-black tracking-tight">
                  Travel with
                  <br />
                  <span className="text-cyan-300">awareness.</span>
                </h1>

                <p className="mt-5 text-sm leading-7 text-slate-400">
                  Plan a journey, calculate the real road route and see the
                  current environmental context before you move.
                </p>
              </div>

              <div>
                <div className="rounded-3xl border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">FROM</span>
                    <MapPin size={16} className="text-cyan-300" />
                  </div>

                  <p className="mt-2 text-xl font-bold">{data.location}</p>

                  <div className="my-5 h-px bg-white/10" />

                  <span className="text-xs text-slate-500">TO</span>

                  <select
                    value={destination}
                    onChange={(e) => {
                      setDestination(e.target.value);
                      setRoute(null);
                      setRouteError("");
                    }}
                    className="mt-2 w-full appearance-none rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm outline-none"
                  >
                    {Object.keys(locations).map((city) => (
                      <option
                        key={city}
                        value={city}
                        className="bg-slate-950"
                      >
                        {city}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={analyseRoute}
                    disabled={routeLoading}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-5 py-3 text-sm font-bold transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {routeLoading ? (
                      "Calculating route..."
                    ) : (
                      <>
                        Analyse Journey <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </div>

                {routeError && (
                  <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/[0.04] p-4">
                    <p className="text-xs text-red-300">{routeError}</p>
                  </div>
                )}

                {route && (
                  <>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.04] p-4">
                        <p className="text-[9px] uppercase tracking-wider text-slate-500">
                          Distance
                        </p>
                        <p className="mt-2 text-2xl font-bold text-cyan-300">
                          {route.distanceKm.toFixed(1)} km
                        </p>
                      </div>

                      <div className="rounded-2xl border border-violet-400/15 bg-violet-400/[0.04] p-4">
                        <p className="text-[9px] uppercase tracking-wider text-slate-500">
                          ETA
                        </p>
                        <p className="mt-2 text-2xl font-bold text-violet-300">
                          {Math.round(route.durationMinutes)} min
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[9px] uppercase tracking-wider text-slate-500">
                            Route awareness
                          </p>
                          <p className="mt-1 text-sm font-semibold">
                            {destination} conditions
                          </p>
                        </div>
                        <ShieldAlert size={17} className="text-emerald-300" />
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-3">
                        <div>
                          <p className="text-[9px] text-slate-500">Origin risk</p>
                          <p className="mt-1 text-sm font-bold text-emerald-300">
                            {data.risk?.score ?? "--"}/100
                          </p>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-500">Destination risk</p>
                          <p className="mt-1 text-sm font-bold text-emerald-300">
                            {destinationLoading
                              ? "..."
                              : destinationData?.risk?.score ?? "--"}
                            {destinationData?.risk ? "/100" : ""}
                          </p>
                        </div>
                      </div>

                      <p className="mt-3 text-[10px] leading-5 text-slate-500">
                        Route distance and ETA come from live road routing.
                        Weather risk shown here is environmental context, not
                        an official travel-safety certification.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </section>

            <section className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[#070b17]">
              <div className="absolute left-6 top-6 z-20 rounded-2xl border border-white/10 bg-black/60 px-4 py-3 backdrop-blur-xl">
                <p className="text-[9px] uppercase tracking-widest text-slate-500">
                  LIVE ROUTE
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {data.location} → {destination}
                </p>
              </div>

              <div className="h-full min-h-[600px]">
                <RouteMap
                  from={data.coordinates}
                  to={destinationCoordinates}
                  route={route}
                />
              </div>

              <div className="absolute bottom-6 left-6 right-6 z-20 grid gap-3 sm:grid-cols-3">
                <Metric
                  icon={ShieldAlert}
                  label="Origin Risk"
                  value={data.risk ? `${data.risk.score}/100` : "--"}
                  color="text-emerald-300"
                />
                <Metric
                  icon={CloudRain}
                  label="Rain"
                  value={
                    data.weather
                      ? `${data.weather.rainProbability}%`
                      : "--"
                  }
                />
                <Metric
                  icon={Wind}
                  label="Wind"
                  value={
                    data.weather
                      ? `${data.weather.windSpeed} km/h`
                      : "--"
                  }
                />
              </div>
            </section>
          </div>
        </main>
      </div>
    </AppShell>
  );
}



function WeatherLoadingScreen() {
  return (
    <div className="relative flex min-h-[520px] items-center justify-center overflow-hidden rounded-[32px] border border-cyan-400/15 bg-[#040914] px-6 py-12">
      <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-cyan-500/10 blur-[110px]" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-violet-600/10 blur-[110px]" />

      <div className="relative z-10 w-full max-w-xl text-center">
        <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-full border border-cyan-300/20" />
          <div className="absolute inset-2 animate-[spin_8s_linear_infinite] rounded-full border border-dashed border-violet-400/25" />
          <div className="absolute inset-5 rounded-2xl border border-cyan-300/25 bg-cyan-400/10 shadow-[0_0_45px_rgba(34,211,238,.12)] backdrop-blur-xl" />
          <CloudRain size={27} className="relative z-10 animate-pulse text-cyan-300" />
        </div>

        <p className="mt-8 text-[10px] font-semibold uppercase tracking-[0.45em] text-cyan-300">
          ASTRA · Atmospheric Intelligence
        </p>

        <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
          Scanning the atmosphere
        </h2>

        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
          Fetching live environmental data and preparing the current risk assessment.
        </p>

        <div className="mx-auto mt-8 grid max-w-md grid-cols-3 gap-3">
          {[
            ["Temperature", Thermometer],
            ["Humidity", Droplets],
            ["Wind", Wind],
          ].map(([label, Icon], index) => (
            <div
              key={label}
              className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left shadow-[0_8px_30px_rgba(0,0,0,.16)] backdrop-blur-xl"
            >
              <Icon
                size={16}
                className="text-cyan-300"
                style={{
                  animation: `pulse ${1.4 + index * 0.25}s ease-in-out infinite`,
                }}
              />
              <p className="mt-3 text-[9px] uppercase tracking-wider text-slate-600">
                {label}
              </p>
              <div className="mt-2 h-5 w-12 animate-pulse rounded bg-white/10" />
            </div>
          ))}
        </div>

        <div className="mx-auto mt-7 h-1 max-w-md overflow-hidden rounded-full bg-white/5">
          <div className="h-full w-1/2 animate-[loadingbar_1.8s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-400 via-violet-400 to-cyan-400" />
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 text-[10px] text-slate-600">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
          Connecting to live weather intelligence
        </div>

        <style>{`
          @keyframes loadingbar {
            0% { transform: translateX(-110%); }
            50% { transform: translateX(40%); }
            100% { transform: translateX(210%); }
          }
        `}</style>
      </div>
    </div>
  );
}

function WeatherPage() {
  const data = useAstraData();
  const { weather, risk } = data;

  return (
    <AppShell data={data}>
      <div className="relative min-h-[calc(100vh-73px)] overflow-hidden bg-[#050914]">
        <div className="pointer-events-none absolute -right-40 top-0 h-[600px] w-[600px] rounded-full bg-cyan-500/10 blur-[150px]" />
        <div className="pointer-events-none absolute left-0 bottom-0 h-96 w-96 rounded-full bg-blue-600/10 blur-[130px]" />

        <main className="relative mx-auto max-w-[1700px] px-5 py-12 sm:px-8 lg:px-12">
          <div className="flex min-h-[260px] flex-col justify-center">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-cyan-400/10 p-3">
                <CloudRain className="text-cyan-300" size={24} />
              </div>
              <p className="text-[10px] uppercase tracking-[0.4em] text-cyan-300">
                Atmospheric Intelligence
              </p>
            </div>
            <h1 className="mt-5 max-w-4xl text-5xl font-black sm:text-7xl">
              The atmosphere,
              <br />
              <span className="text-cyan-300">decoded live.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400">
              ASTRA transforms live environmental measurements into a clean
              picture of what is happening around {data.location}.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={Thermometer} label="Temperature" value={weather ? `${weather.temperature}°C` : "--"} />
            <Metric icon={Droplets} label="Humidity" value={weather ? `${weather.humidity}%` : "--"} />
            <Metric icon={CloudRain} label="Rain Probability" value={weather ? `${weather.rainProbability}%` : "--"} />
            <Metric icon={Wind} label="Wind Speed" value={weather ? `${weather.windSpeed} km/h` : "--"} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
            <div className="rounded-[32px] border border-white/10 bg-white/[0.025] p-5 sm:p-7">
              {weather ? (
                <WeatherCard weather={{ ...weather, location: data.location }} />
              ) : (
                <WeatherLoadingScreen />
              )}
            </div>
            <div className="rounded-[32px] border border-cyan-400/15 bg-gradient-to-br from-cyan-400/[0.06] to-transparent p-6">
              <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Environmental state</p>
              <p className="mt-5 text-6xl font-black">{weather?.temperature ?? "--"}°</p>
              <p className="mt-2 text-sm text-slate-400">{data.location}</p>
              <div className="mt-10 border-t border-white/10 pt-5">
                <p className="text-xs text-slate-500">Current risk assessment</p>
                <p className="mt-2 text-3xl font-bold text-emerald-300">
                  {risk?.score ?? "--"} / 100
                </p>
                <p className="mt-1 text-xs text-emerald-300">{risk?.level || "LOADING"}</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </AppShell>
  );
}



function RiskMapPage() {
  const data = useAstraData();
  const score = data.risk?.score ?? 0;

  return (
    <AppShell data={data}>
      <div className="relative min-h-[calc(100vh-73px)] overflow-hidden bg-[#03050c]">
        <main className="mx-auto max-w-[1700px] px-5 py-10 sm:px-8 lg:px-12">
          <div className="mb-7 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="text-[10px] uppercase tracking-[0.4em] text-violet-300">Spatial Risk Intelligence</p>
              <h1 className="mt-3 text-5xl font-black sm:text-7xl">
                See the
                <br />
                <span className="text-violet-300">risk layer.</span>
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">
                A live geographic view of the environmental risk currently
                detected around {data.location}.
              </p>
            </div>

            <div className="rounded-3xl border border-emerald-400/20 bg-emerald-400/[0.04] px-6 py-5">
              <p className="text-[9px] uppercase tracking-widest text-slate-500">Current location</p>
              <div className="mt-2 flex items-end gap-3">
                <span className="text-4xl font-black">{score}</span>
                <span className="mb-1 text-xs text-slate-500">/ 100</span>
                <span className="mb-1 text-xs font-bold text-emerald-300">{data.risk?.level || "LOW"}</span>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[36px] border border-violet-400/15 bg-[#070b17]">
            <div className="absolute left-5 top-5 z-10 rounded-2xl border border-white/10 bg-black/60 px-4 py-3 backdrop-blur-xl">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                <p className="text-[10px] font-semibold">LIVE RISK MAP</p>
              </div>
              <p className="mt-1 text-[9px] text-slate-500">{data.location}</p>
            </div>

            <div className="min-h-[620px]">
              <MapCard
                location={data.location}
                risk={data.risk || { score: 0, level: "LOW", factors: [] }}
                coordinates={data.coordinates}
              />
            </div>

            <div className="grid gap-3 border-t border-white/5 bg-[#070b17] p-5 sm:grid-cols-3">
              <Metric
                icon={ShieldAlert}
                label="Risk Score"
                value={`${score}/100`}
                color="text-emerald-300"
              />

              <Metric
                icon={CloudRain}
                label="Rainfall"
                value={data.weather ? `${data.weather.rainfall} mm` : "--"}
              />

              <Metric
                icon={Wind}
                label="Wind"
                value={
                  data.weather
                    ? `${data.weather.windSpeed} km/h`
                    : "--"
                }
              />
            </div>
          </div>
        </main>
      </div>
    </AppShell>
  );
}



function AlertsPage() {
  const data = useAstraData();
  const factors = data.risk?.factors || [];
  const score = data.risk?.score ?? null;
  const level = data.risk?.level || null;

  const getAlertState = () => {
    if (score === null) {
      return {
        title: "CONNECTING TO ASTRA",
        message: "Waiting for live environmental data.",
        badge: "LOADING",
        tone: "cyan",
        icon: Activity,
      };
    }

    if (score <= 30) {
      return {
        title: "SYSTEM NORMAL",
        message: "No significant environmental risk is currently detected.",
        badge: "LOW RISK",
        tone: "emerald",
        icon: CheckCircle2,
      };
    }

    if (score <= 60) {
      return {
        title: "WEATHER ADVISORY",
        message: "Changing environmental conditions detected. Monitor the situation.",
        badge: "MODERATE",
        tone: "amber",
        icon: AlertTriangle,
      };
    }

    if (score <= 80) {
      return {
        title: "HIGH RISK ALERT",
        message: "Elevated environmental risk detected. Review current conditions before travelling.",
        badge: "HIGH",
        tone: "orange",
        icon: ShieldAlert,
      };
    }

    return {
      title: "EXTREME ALERT",
      message: "Severe environmental conditions detected. Exercise heightened caution and monitor updates.",
      badge: "EXTREME",
      tone: "red",
      icon: ShieldAlert,
    };
  };

  const alertState = getAlertState();
  const AlertIcon = alertState.icon;

  const toneClasses = {
    cyan: {
      border: "border-cyan-400/20",
      bg: "bg-cyan-400/[0.06]",
      text: "text-cyan-300",
      glow: "bg-cyan-500/10",
    },
    emerald: {
      border: "border-emerald-400/20",
      bg: "bg-emerald-400/[0.06]",
      text: "text-emerald-300",
      glow: "bg-emerald-500/10",
    },
    amber: {
      border: "border-amber-400/20",
      bg: "bg-amber-400/[0.06]",
      text: "text-amber-300",
      glow: "bg-amber-500/10",
    },
    orange: {
      border: "border-orange-400/20",
      bg: "bg-orange-400/[0.06]",
      text: "text-orange-300",
      glow: "bg-orange-500/10",
    },
    red: {
      border: "border-red-400/20",
      bg: "bg-red-400/[0.06]",
      text: "text-red-300",
      glow: "bg-red-500/10",
    },
  };

  const tone = toneClasses[alertState.tone];

  return (
    <AppShell data={data}>
      <div className="relative min-h-[calc(100vh-73px)] overflow-hidden bg-[#08050c]">
        <div
          className={`pointer-events-none absolute right-0 top-0 h-[520px] w-[520px] rounded-full ${tone.glow} blur-[140px]`}
        />

        <main className="relative mx-auto max-w-[1350px] px-5 py-14 sm:px-8">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3">
              <div className={`rounded-2xl ${tone.bg} p-3`}>
                <Bell className={tone.text} size={23} />
              </div>

              <p className={`text-[10px] uppercase tracking-[0.4em] ${tone.text}`}>
                Early Warning System
              </p>
            </div>

            <h1 className="mt-5 text-5xl font-black sm:text-7xl">
              Know before
              <br />
              <span className={tone.text}>it matters.</span>
            </h1>

            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400">
              ASTRA watches live environmental conditions and converts the
              current risk assessment into a clear alert state for {data.location}.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-[1fr_350px]">
            <section
              className={`rounded-[32px] border ${tone.border} bg-gradient-to-br from-white/[0.03] to-transparent p-7 sm:p-8`}
            >
              <div className="flex flex-col justify-between gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs text-slate-500">Live alert stream</p>
                  <h2 className="mt-1 text-xl font-bold">{data.location}</h2>
                </div>

                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                  <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-[10px] font-semibold text-emerald-300">
                    MONITORING
                  </span>
                </div>
              </div>

              <div
                className={`mt-6 rounded-[28px] border ${tone.border} ${tone.bg} p-6 sm:p-7`}
              >
                <div className="flex items-start gap-4">
                  <div className={`rounded-2xl ${tone.bg} p-3`}>
                    <AlertIcon className={tone.text} size={25} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-xl font-black tracking-tight sm:text-2xl">
                        {alertState.title}
                      </h3>

                      <span
                        className={`rounded-full border ${tone.border} ${tone.bg} px-3 py-1 text-[9px] font-bold uppercase tracking-wider ${tone.text}`}
                      >
                        {alertState.badge}
                      </span>
                    </div>

                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                      {alertState.message}
                    </p>
                  </div>
                </div>

                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-[9px] uppercase tracking-wider text-slate-500">
                      Risk score
                    </p>
                    <p className={`mt-2 text-3xl font-black ${tone.text}`}>
                      {score ?? "--"}
                      <span className="text-sm font-medium text-slate-500">/100</span>
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-[9px] uppercase tracking-wider text-slate-500">
                      Risk level
                    </p>
                    <p className={`mt-2 text-xl font-bold ${tone.text}`}>
                      {level || "LOADING"}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-[9px] uppercase tracking-wider text-slate-500">
                      Location
                    </p>
                    <p className="mt-2 truncate text-xl font-bold">
                      {data.location}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.25em] text-slate-500">
                      Risk contributors
                    </p>
                    <p className="mt-1 text-sm font-semibold">
                      Factors reported by the risk engine
                    </p>
                  </div>

                  <span className="text-[10px] text-slate-500">
                    {factors.length} factor{factors.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  {factors.length ? (
                    factors.map((factor, index) => (
                      <div
                        key={`${factor}-${index}`}
                        className="flex items-start gap-3 rounded-2xl border border-white/5 bg-black/20 p-4"
                      >
                        <AlertTriangle
                          size={16}
                          className={`mt-0.5 shrink-0 ${tone.text}`}
                        />
                        <p className="text-sm leading-6 text-slate-300">
                          {factor}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.03] p-4">
                      <CheckCircle2 size={17} className="text-emerald-300" />
                      <p className="text-sm text-slate-300">
                        No significant risk factors detected by the current risk engine.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <aside className="space-y-4">
              <div className={`rounded-[28px] border ${tone.border} ${tone.bg} p-6`}>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">
                    Current risk
                  </p>
                  <ShieldAlert size={17} className={tone.text} />
                </div>

                <p className="mt-4 text-6xl font-black">
                  {score ?? "--"}
                </p>

                <div className="mt-2 flex items-center justify-between">
                  <p className={`text-xs font-bold ${tone.text}`}>
                    {level || "LOADING"}
                  </p>
                  <p className="text-[10px] text-slate-500">0–100 scale</p>
                </div>

                <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${tone.bg.replace(
                      "/[0.06]",
                      ""
                    )}`}
                    style={{ width: `${Math.min(score ?? 0, 100)}%` }}
                  />
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-white/[0.025] p-6">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  What ASTRA monitors
                </p>

                <div className="mt-5 space-y-4">
                  {[
                    ["Rainfall", data.weather ? `${data.weather.rainfall} mm` : "--"],
                    [
                      "Rain probability",
                      data.weather ? `${data.weather.rainProbability}%` : "--",
                    ],
                    [
                      "Wind speed",
                      data.weather ? `${data.weather.windSpeed} km/h` : "--",
                    ],
                    ["Humidity", data.weather ? `${data.weather.humidity}%` : "--"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-4 text-sm"
                    >
                      <span className="text-slate-400">{label}</span>
                      <span className="font-semibold text-slate-200">
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/20 p-6">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  About this alert
                </p>
                <p className="mt-3 text-xs leading-6 text-slate-500">
                  This is an ASTRA prototype risk assessment based on live
                  environmental data. It is not an official government warning
                  or emergency certification.
                </p>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </AppShell>
  );
}


function EmergencyPage() {
  const data = useAstraData();
  const [active, setActive] = useState(false);

  return (
    <AppShell data={data}>
      <div className="relative min-h-[calc(100vh-73px)] overflow-hidden bg-[#090305]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,rgba(239,68,68,.12),transparent_35%)]" />

        <main className="relative mx-auto max-w-[1200px] px-5 py-14 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-3">
              <ShieldAlert className="text-red-300" size={25} />
            </div>
            <p className="text-[10px] uppercase tracking-[0.4em] text-red-300">
              Safety Response
            </p>
          </div>

          <h1 className="mt-6 text-5xl font-black sm:text-7xl">
            When conditions
            <br />
            <span className="text-red-300">change, act.</span>
          </h1>

          <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-400">
            A focused emergency interface designed to reduce distractions and
            keep the most important safety information visible.
          </p>

          <div className="mt-10 rounded-[36px] border border-red-400/20 bg-gradient-to-br from-red-500/[0.09] via-transparent to-transparent p-7 sm:p-10">
            {!active ? (
              <div className="flex flex-col justify-between gap-10 md:flex-row md:items-center">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="flex h-3 w-3 animate-pulse rounded-full bg-red-400 shadow-[0_0_18px_rgba(248,113,113,.9)]" />
                    <span className="text-xs font-semibold uppercase tracking-widest text-red-300">
                      Emergency interface ready
                    </span>
                  </div>
                  <h2 className="mt-5 text-3xl font-bold">{data.location}</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Current risk: {data.risk?.score ?? "--"}/100 · {data.risk?.level || "LOADING"}
                  </p>
                </div>
                <button
                  onClick={() => setActive(true)}
                  className="rounded-2xl bg-red-500 px-7 py-4 text-sm font-bold shadow-[0_0_35px_rgba(239,68,68,.18)] transition hover:bg-red-400"
                >
                  Activate Emergency Mode
                </button>
              </div>
            ) : (
              <EmergencyMode
                risk={data.risk || { score: 0, level: "LOW", factors: [] }}
                location={data.location}
                onClose={() => setActive(false)}
              />
            )}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-6">
              <Phone className="text-red-300" size={20} />
              <h3 className="mt-5 font-semibold">Emergency Services</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                Use local emergency services when immediate assistance is required.
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-6">
              <MapPin className="text-cyan-300" size={20} />
              <h3 className="mt-5 font-semibold">Your Location</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">{data.location}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.025] p-6">
              <ShieldAlert className="text-emerald-300" size={20} />
              <h3 className="mt-5 font-semibold">Risk State</h3>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {data.risk?.level || "Loading"}
              </p>
            </div>
          </div>
        </main>
      </div>
    </AppShell>
  );
}



function AssistantPage() {
  const data = useAstraData();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");

  const ask = () => {
    if (!question.trim() || !data.weather || !data.risk) return;
    setAnswer(
      getAssistantResponse({
        question,
        location: data.location,
        weather: data.weather,
        risk: data.risk,
      })
    );
  };

  const suggestions = [
    "Is it safe to travel?",
    "Should I carry an umbrella?",
    "What is causing the current risk?",
  ];

  return (
    <AppShell data={data}>
      <div className="relative min-h-[calc(100vh-73px)] overflow-hidden bg-[#05020f]">
        <div className="pointer-events-none absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-violet-600/15 blur-[150px]" />

        <main className="relative mx-auto max-w-[1200px] px-5 py-16 sm:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-violet-400/20 bg-violet-500/10">
              <Bot size={30} className="text-violet-300" />
            </div>
            <p className="mt-7 text-[10px] uppercase tracking-[0.45em] text-violet-300">
              ASTRA Intelligence
            </p>
            <h1 className="mt-4 text-5xl font-black sm:text-7xl">
              Ask the
              <br />
              <span className="text-violet-300">environment.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-slate-400">
              Ask ASTRA about the current conditions around {data.location}.
              The assistant uses the live weather and risk context available to the platform.
            </p>
          </div>

          <section className="mx-auto mt-10 max-w-4xl rounded-[36px] border border-violet-400/20 bg-gradient-to-br from-violet-500/[0.08] to-transparent p-6 shadow-[0_0_100px_rgba(124,58,237,.08)] sm:p-8">
            <div className="flex items-center justify-between border-b border-white/10 pb-5">
              <div>
                <p className="text-xs text-slate-500">Conversation context</p>
                <p className="mt-1 font-semibold">{data.location} · Live conditions</p>
              </div>
              <Sparkles className="text-violet-300" size={19} />
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {suggestions.map((item) => (
                <button
                  key={item}
                  onClick={() => setQuestion(item)}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-slate-300 transition hover:border-violet-400/30 hover:bg-violet-400/10"
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="mt-5 flex gap-2 rounded-2xl border border-white/10 bg-black/30 p-2">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ask()}
                placeholder="Ask ASTRA anything..."
                className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-slate-600"
              />
              <button
                onClick={ask}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500"
              >
                <ArrowRight size={18} />
              </button>
            </div>

            {answer ? (
              <div className="mt-5 rounded-2xl border border-violet-400/20 bg-violet-400/[0.04] p-5">
                <div className="flex gap-3">
                  <div className="rounded-xl bg-violet-500/10 p-2">
                    <Bot size={17} className="text-violet-300" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-violet-300">ASTRA</p>
                    <p className="mt-2 text-sm leading-7 text-slate-300">{answer}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <MiniInfo icon={CloudRain} label="Weather" value={data.weather ? "Live" : "Loading"} />
                <MiniInfo icon={ShieldAlert} label="Risk Engine" value={data.risk ? "Active" : "Loading"} />
                <MiniInfo icon={MapPin} label="Location" value={data.location} />
              </div>
            )}
          </section>
        </main>
      </div>
    </AppShell>
  );
}




function DevelopersPage() {
  const data = useAstraData();

  const developers = [
    {
      name: "Shivansh Tiwari",
      role: "Backend & System Integration Lead",
      photo: shivanshPhoto,
      bio:
        "Built and integrated the FastAPI backend, weather services, risk pipeline, routing services and production deployment flow.",
      contributions: [
        "FastAPI & REST APIs",
        "Open-Meteo Integration",
        "Frontend–Backend Integration",
        "Render & Vercel Deployment",
      ],
      stack: ["Python", "FastAPI", "REST APIs", "Git"],
    },
    {
      name: "Rishav Raj",
      role: "Frontend Developer",
      photo: rishavPhoto,
      bio:
        "Designed and developed ASTRA's interactive frontend experience, responsive interface and visual data presentation.",
      contributions: [
        "React + Vite Interface",
        "Responsive UI",
        "Leaflet Map Experience",
        "Dashboard & User Flows",
      ],
      stack: ["React", "Vite", "Tailwind CSS", "Leaflet"],
    },
    {
      name: "Tanmay Chaudhary",
      role: "AI/ML & Risk Engine Lead",
      photo: tanmayPhoto,
      bio:
        "Developed the risk-scoring engine that transforms weather parameters into an understandable prototype risk level.",
      contributions: [
        "Risk Engine Architecture",
        "Weighted Risk Scoring",
        "Risk Validation",
        "ML / Data Intelligence",
      ],
      stack: ["Python", "AI/ML", "Risk Engine", "Data Science"],
    },
  ];

  return (
    <AppShell data={data}>
      <div className="relative min-h-[calc(100vh-73px)] overflow-hidden bg-[#030611]">
      <div className="pointer-events-none absolute left-1/4 top-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-[140px]" />
      <div className="pointer-events-none absolute right-0 top-1/4 h-96 w-96 rounded-full bg-violet-600/10 blur-[140px]" />

      <main className="relative mx-auto max-w-[1500px] px-5 py-12 sm:px-8 lg:px-12 lg:py-16">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/5 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-300">
            <Sparkles size={13} />
            The Team Behind ASTRA
          </div>

          <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
            Meet the{" "}
            <span className="bg-gradient-to-r from-cyan-300 via-white to-violet-400 bg-clip-text text-transparent">
              Developers.
            </span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
            Three developers, three core disciplines, one mission — building
            ASTRA into a practical climate-risk intelligence platform.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {developers.map((developer) => (
            <article
              key={developer.name}
              className="group relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.035] shadow-2xl backdrop-blur-xl transition duration-500 hover:-translate-y-1 hover:border-cyan-400/25"
            >
              <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-cyan-400/[0.10] to-transparent opacity-70" />

              <div className="relative p-5">
                <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-black/30">
                  <img
                    src={developer.photo}
                    alt={developer.name}
                    className="h-80 w-full object-cover object-center grayscale-[10%] transition duration-700 group-hover:scale-[1.03] group-hover:grayscale-0"
                  />

                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent p-5 pt-20">
                    <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
                      ASTRA Developer
                    </span>
                  </div>
                </div>

                <div className="px-2 pb-2 pt-6">
                  <h2 className="text-2xl font-bold text-white">
                    {developer.name}
                  </h2>

                  <p className="mt-1 text-sm font-medium text-cyan-300">
                    {developer.role}
                  </p>

                  <p className="mt-5 text-sm leading-7 text-slate-400">
                    {developer.bio}
                  </p>

                  <div className="mt-6">
                    <p className="text-[9px] uppercase tracking-[0.25em] text-slate-500">
                      Core Contributions
                    </p>

                    <div className="mt-3 space-y-2">
                      {developer.contributions.map((item) => (
                        <div
                          key={item}
                          className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 px-3 py-2.5"
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                          <span className="text-xs text-slate-300">{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap gap-2">
                    {developer.stack.map((tech) => (
                      <span
                        key={tech}
                        className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] text-slate-400"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-8 rounded-[28px] border border-cyan-400/15 bg-gradient-to-r from-cyan-400/[0.06] via-white/[0.02] to-violet-500/[0.06] p-7 text-center backdrop-blur-xl sm:p-9">
          <p className="text-[9px] uppercase tracking-[0.35em] text-slate-500">
            Team Achievement
          </p>
          <h2 className="mt-3 text-2xl font-bold text-white sm:text-3xl">
            🏆 First Position — NEXXATHON 2026
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            ASTRA was developed as a collaborative project by this team at
            SRM Institute of Science &amp; Technology, Delhi-NCR Campus,
            Ghaziabad.
          </p>
        </div>
      </main>
      </div>
    </AppShell>
  );
}

function MiniInfo({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <Icon size={17} className="text-violet-300" />
      <p className="mt-3 text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <RouterRoute path="/" element={<Dashboard />} />
        <RouterRoute path="/route-planner" element={<RoutePlanner />} />
        <RouterRoute path="/weather" element={<WeatherPage />} />
        <RouterRoute path="/risk-map" element={<RiskMapPage />} />
        <RouterRoute path="/alerts" element={<AlertsPage />} />
        <RouterRoute path="/emergency" element={<EmergencyPage />} />
        <RouterRoute path="/assistant" element={<AssistantPage />} />
        <RouterRoute path="/developers" element={<DevelopersPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
