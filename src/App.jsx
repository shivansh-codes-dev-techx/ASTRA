import { useEffect, useState } from "react";

import {
  Activity,
  Bell,
  Bot,
  CloudRain,
  LayoutDashboard,
  Map,
  MapPin,
  Menu,
  Moon,
  Route,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";

import WeatherCard from "./components/WeatherCard";
import RiskCard from "./components/RiskCard";
import MapCard from "./components/MapCard";
import AlertCard from "./components/AlertCard";
import LoadingSkeleton from "./components/LoadingSkeleton";
import LocationSelector from "./components/LocationSelector";
import StatusMessage from "./components/StatusMessage";
import EmergencyMode from "./components/EmergencyMode";

import { getAssistantResponse } from "./services/assistantService";
import { getWeatherByCoordinates } from "./services/api";

function App() {
  /* ================================================= */
  /* LOCATION */
  /* ================================================= */

  const [location, setLocation] = useState("Ghaziabad");

  const locationCoordinates = {
    Ghaziabad: [28.6692, 77.4538],
    Delhi: [28.6139, 77.209],
    Noida: [28.5355, 77.391],
    Agra: [27.1767, 78.0081],
  };

  /* ================================================= */
  /* API STATE */
  /* ================================================= */

  const [weatherData, setWeatherData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* ================================================= */
  /* UI STATE */
  /* ================================================= */

  const [mobileMenuOpen, setMobileMenuOpen] =
    useState(false);

  const [activeSection, setActiveSection] =
    useState("dashboard");

  const [emergencyMode, setEmergencyMode] =
    useState(false);

  const [question, setQuestion] = useState("");

  const [assistantResponse, setAssistantResponse] =
    useState("");

  /* ================================================= */
  /* CURRENT DATA */
  /* ================================================= */

  const currentWeather =
    weatherData?.weather || null;

  const currentRisk =
    weatherData?.risk || null;

  // Keep a safe risk object for UI elements that may render
  // while the API response is still being populated.
  const safeRisk = {
    score: currentRisk?.score ?? 0,
    level: currentRisk?.level ?? "LOADING",
    factors: currentRisk?.factors ?? [],
  };

  const apiLocation =
    weatherData?.location || null;

  /* ================================================= */
  /* FETCH WEATHER + RISK */
  /* ================================================= */

  useEffect(() => {
    let cancelled = false;

    async function fetchWeather() {
      try {
        setLoading(true);
        setError("");

        const coordinates =
          locationCoordinates[location];

        if (!coordinates) {
          throw new Error(
            "Coordinates not available for this location."
          );
        }

        const [latitude, longitude] =
          coordinates;

        const data =
          await getWeatherByCoordinates(
            latitude,
            longitude
          );

        if (cancelled) return;

        setWeatherData(data);
      } catch (err) {
        if (cancelled) return;

        console.error(
          "Weather API error:",
          err
        );

        setError(
          err.message ||
            "Unable to load weather data."
        );

        setWeatherData(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchWeather();

    return () => {
      cancelled = true;
    };
  }, [location]);

  /* ================================================= */
  /* AI ASSISTANT */
  /* ================================================= */

  const handleAskAssistant = () => {
    if (
      !question.trim() ||
      !currentWeather ||
      !currentRisk
    ) {
      return;
    }

    const response =
      getAssistantResponse({
        question,
        location,
        weather: currentWeather,
        risk: currentRisk,
      });

    setAssistantResponse(response);
  };

  /* ================================================= */
  /* LOCATION CHANGE */
  /* ================================================= */

  const handleLocationChange = (
    newLocation
  ) => {
    setLocation(newLocation);
    setQuestion("");
    setAssistantResponse("");
    setError("");
  };

  /* ================================================= */
  /* NAVIGATION */
  /* ================================================= */

  const navigation = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: LayoutDashboard,
      target: "dashboard",
    },
    {
      id: "route",
      label: "Route Planner",
      icon: Route,
      target: "risk-map",
    },
    {
      id: "weather",
      label: "Weather",
      icon: CloudRain,
      target: "weather",
    },
    {
      id: "map",
      label: "Risk Map",
      icon: Map,
      target: "risk-map",
    },
    {
      id: "alerts",
      label: "Alerts",
      icon: Bell,
      target: "alerts",
    },
    {
      id: "emergency",
      label: "Emergency",
      icon: ShieldAlert,
      target: "emergency",
    },
    {
      id: "assistant",
      label: "AI Assistant",
      icon: Bot,
      target: "assistant",
    },
  ];

  const handleNavigation = (item) => {
    setActiveSection(item.id);
    setMobileMenuOpen(false);

    document
      .getElementById(item.target)
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  };

  /* ================================================= */
  /* LOADING STATE */
  /* ================================================= */

  if (
    loading &&
    !weatherData
  ) {
    return (
      <div className="min-h-screen bg-[#07051a] text-white">
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-3xl">

            <div className="mb-6 text-center">

              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-900/40">
                <CloudRain size={30} />
              </div>

              <h1 className="text-3xl font-bold">
                ASTRA
              </h1>

              <p className="mt-2 text-sm text-slate-500">
                Loading live weather & risk data...
              </p>

            </div>

            <LoadingSkeleton />

          </div>
        </div>
      </div>
    );
  }

  /* ================================================= */
  /* ERROR STATE */
  /* ================================================= */

  if (
    error &&
    !weatherData
  ) {
    return (
      <div className="min-h-screen bg-[#07051a] px-6 py-10 text-white">

        <div className="mx-auto flex min-h-[80vh] max-w-2xl items-center justify-center">

          <div className="glass w-full rounded-3xl p-8 text-center">

            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">

              <ShieldAlert
                size={30}
                className="text-red-400"
              />

            </div>

            <h1 className="text-2xl font-bold">
              Unable to load ASTRA data
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-400">
              {error}
            </p>

            <p className="mt-4 text-xs text-slate-600">
              Make sure the FastAPI backend is running
              on http://127.0.0.1:8000
            </p>

            <button
              onClick={() =>
                window.location.reload()
              }
              className="mt-6 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-6 py-3 text-sm font-semibold transition hover:scale-105"
            >
              Retry
            </button>

          </div>

        </div>

      </div>
    );
  }

  /* ================================================= */
  /* MAIN APP */
  /* ================================================= */

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#07051a] text-white">

      {/* ================================================= */}
      {/* BACKGROUND EFFECTS */}
      {/* ================================================= */}

      <div className="pointer-events-none fixed inset-0 overflow-hidden">

        <div className="absolute left-[10%] top-[10%] h-72 w-72 rounded-full bg-violet-600/10 blur-3xl animate-pulse-glow" />

        <div
          className="absolute right-[10%] top-[25%] h-96 w-96 rounded-full bg-indigo-600/10 blur-3xl animate-pulse-glow"
          style={{
            animationDelay: "1s",
          }}
        />

        <div
          className="absolute bottom-[5%] left-[40%] h-80 w-80 rounded-full bg-fuchsia-600/10 blur-3xl animate-pulse-glow"
          style={{
            animationDelay: "2s",
          }}
        />

      </div>

      {/* ================================================= */}
      {/* MOBILE OVERLAY */}
      {/* ================================================= */}

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() =>
            setMobileMenuOpen(false)
          }
        />
      )}

      {/* ================================================= */}
      {/* SIDEBAR */}
      {/* ================================================= */}

      <aside
        className={`
          glass fixed left-4 top-4 bottom-4 z-50
          flex w-64 flex-col
          rounded-3xl
          p-4
          transition-transform duration-300
          lg:translate-x-0
          ${
            mobileMenuOpen
              ? "translate-x-0"
              : "-translate-x-[120%]"
          }
        `}
      >

        {/* Logo */}

        <div className="mb-8 flex items-center gap-3 px-2">

          <div className="relative">

            <div className="absolute inset-0 rounded-2xl bg-violet-500/40 blur-lg" />

            <div className="relative rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 p-3">

              <CloudRain size={24} />

            </div>

          </div>

          <div>

            <h1 className="text-xl font-bold">
              ASTRA
            </h1>

            <p className="text-[10px] text-slate-400">
              Climate Risk Intelligence
            </p>

          </div>

        </div>

        {/* Navigation */}

        <div className="space-y-2">

          <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Navigation
          </p>

          {navigation.map((item) => {

            const Icon = item.icon;

            const active =
              activeSection === item.id;

            return (
              <button
                key={item.id}
                onClick={() =>
                  handleNavigation(item)
                }
                className={`
                  group flex w-full items-center gap-3
                  rounded-xl px-3 py-3
                  text-left text-sm
                  transition-all duration-300
                  ${
                    active
                      ? "bg-gradient-to-r from-violet-600/80 to-indigo-600/70 text-white shadow-lg shadow-violet-900/30"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }
                `}
              >

                <Icon
                  size={18}
                  className={
                    active
                      ? "text-white"
                      : "text-slate-500 group-hover:text-violet-300"
                  }
                />

                <span>
                  {item.label}
                </span>

              </button>
            );
          })}

        </div>

        {/* Sidebar bottom */}

        <div className="mt-auto">

          <div className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-600/20 to-indigo-600/10 p-4">

            <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-violet-500/20 blur-2xl" />

            <Sparkles
              size={18}
              className="mb-3 text-violet-300"
            />

            <p className="text-xs leading-5 text-slate-400">
              Safer rides.
              <br />
              Smarter decisions.
              <br />
              A safer tomorrow.
            </p>

          </div>

        </div>

      </aside>

      {/* ================================================= */}
      {/* MAIN */}
      {/* ================================================= */}

      <div className="relative lg:pl-72">

        {/* ================================================= */}
        {/* TOP NAVBAR */}
        {/* ================================================= */}

        <header className="sticky top-0 z-30 px-4 pt-4 sm:px-6 lg:px-8">

          <div className="glass mx-auto flex max-w-[1500px] items-center justify-between rounded-2xl px-4 py-3 sm:px-5">

            {/* Mobile Menu */}

            <button
              onClick={() =>
                setMobileMenuOpen(true)
              }
              className="rounded-xl border border-white/10 bg-white/5 p-2 lg:hidden"
            >
              <Menu size={20} />
            </button>

            {/* Desktop brand */}

            <div className="hidden items-center gap-3 lg:flex">

              <div className="rounded-xl bg-violet-500/15 p-2">

                <Activity
                  size={19}
                  className="text-violet-300"
                />

              </div>

              <div>

                <p className="text-sm font-semibold">
                  ASTRA Dashboard
                </p>

                <p className="text-[10px] text-slate-500">
                  Real-time climate awareness
                </p>

              </div>

            </div>

            {/* Mobile logo */}

            <div className="flex items-center gap-2 lg:hidden">

              <div className="rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 p-2">

                <CloudRain size={18} />

              </div>

              <span className="font-bold">
                ASTRA
              </span>

            </div>

            {/* Right Controls */}

            <div className="ml-auto flex items-center gap-2 sm:gap-3">

              {/* Location */}

              <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 sm:flex">

                <MapPin
                  size={15}
                  className="text-violet-300"
                />

                <span className="text-xs">
                  {location}
                </span>

              </div>

              {/* Theme */}

              <button
                className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
              >
                <Moon size={17} />
              </button>

              {/* Notifications */}

              <button
                className="relative rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
              >

                <Bell size={17} />

                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-pink-400" />

              </button>

              {/* User */}

              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-indigo-600 text-sm font-bold shadow-lg shadow-violet-900/30">
                R
              </div>

              {/* Mobile close */}

              {mobileMenuOpen && (
                <button
                  onClick={() =>
                    setMobileMenuOpen(false)
                  }
                  className="rounded-xl border border-white/10 bg-white/5 p-2 lg:hidden"
                >
                  <X size={18} />
                </button>
              )}

            </div>

          </div>

        </header>

        {/* ================================================= */}
        {/* CONTENT */}
        {/* ================================================= */}

        <main
          id="dashboard"
          className="mx-auto max-w-[1500px] px-4 pb-10 pt-8 sm:px-6 lg:px-8"
        >

          {/* ================================================= */}
          {/* HERO */}
          {/* ================================================= */}

          <section className="mb-8 grid gap-6 xl:grid-cols-[1fr_360px]">

            <div className="relative overflow-hidden rounded-3xl p-2">

              <div className="pointer-events-none absolute left-0 top-0 h-40 w-80 rounded-full bg-violet-600/20 blur-3xl" />

              <div className="relative py-5">

                <div className="mb-3 flex items-center gap-2 text-sm text-slate-400">

                  <span className="animate-float">
                    👋
                  </span>

                  Good evening, Rider!

                </div>

                <h2 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">

                  Understand the risk.

                  <br />

                  <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-300 bg-clip-text text-transparent">
                    Prepare before it happens.
                  </span>

                </h2>

                <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">

                  ASTRA combines weather information,
                  route intelligence and risk analysis
                  to help riders make safer decisions
                  before and during their journey.

                </p>

              </div>

            </div>

            {/* System status */}

            <div className="glass glass-hover glow-purple rounded-3xl p-5">

              <div className="flex items-start justify-between">

                <div>

                  <div className="flex items-center gap-2">

                    <span className="h-3 w-3 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/60" />

                    <span className="font-semibold text-emerald-300">
                      System Online
                    </span>

                  </div>

                  <p className="mt-2 text-xs text-slate-500">
                    Live weather & risk data
                  </p>

                </div>

                <div className="rounded-2xl bg-white/5 p-3">

                  <CloudRain
                    size={25}
                    className="text-cyan-300"
                  />

                </div>

              </div>

              <div className="mt-5 flex items-end justify-between">

                <div>

                  <p className="text-4xl font-bold">
                    {currentWeather?.temperature ?? "--"}°
                  </p>

                  <p className="mt-1 text-xs text-slate-400">
                    Current temperature
                  </p>

                </div>

                <div className="text-right">

                  <p className="text-sm text-slate-300">
                    {currentWeather?.rainProbability ?? "--"}%
                  </p>

                  <p className="text-[10px] text-slate-500">
                    Rain probability
                  </p>

                </div>

              </div>

            </div>

          </section>

          {/* ================================================= */}
          {/* API STATUS */}
          {/* ================================================= */}

          {loading && (
            <div className="mb-6">
              <StatusMessage
                type="loading"
                message={`Updating live weather and risk data for ${location}...`}
              />
            </div>
          )}

          {error && weatherData && (
            <div className="mb-6">
              <StatusMessage
                type="error"
                message={error}
              />
            </div>
          )}

          {/* ================================================= */}
          {/* LOCATION */}
          {/* ================================================= */}

          <section className="mb-6">

            <div className="glass rounded-2xl p-3">

              <LocationSelector
                location={location}
                onLocationChange={
                  handleLocationChange
                }
              />

            </div>

          </section>

          {/* ================================================= */}
          {/* TOP METRIC CARDS */}
          {/* ================================================= */}

          {loading && !weatherData ? (

            <LoadingSkeleton />

          ) : currentWeather && currentRisk ? (

            <section
              id="weather"
              className="mb-6 grid gap-5 md:grid-cols-2 xl:grid-cols-4"
            >

              {/* Weather */}

              <div className="glass glass-hover glow-cyan relative overflow-hidden rounded-3xl p-5">

                <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-cyan-400/10 blur-2xl" />

                <div className="flex items-start justify-between">

                  <div>

                    <p className="text-xs text-slate-500">
                      Current Weather
                    </p>

                    <p className="mt-2 text-3xl font-bold">
                      {currentWeather.temperature}°C
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      {location}
                    </p>

                  </div>

                  <div className="rounded-2xl bg-cyan-400/10 p-3">

                    <CloudRain
                      size={23}
                      className="text-cyan-300"
                    />

                  </div>

                </div>

                <div className="mt-5">

                  <div className="mb-2 flex justify-between text-xs">

                    <span className="text-slate-500">
                      Rain Probability
                    </span>

                    <span className="text-cyan-300">
                      {currentWeather.rainProbability}%
                    </span>

                  </div>

                  <div className="h-1.5 overflow-hidden rounded-full bg-white/5">

                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500"
                      style={{
                        width: `${currentWeather.rainProbability}%`,
                      }}
                    />

                  </div>

                </div>

              </div>

              {/* Risk */}

              <div className="glass glass-hover relative overflow-hidden rounded-3xl p-5">

                <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-amber-400/10 blur-2xl" />

                <div className="flex items-start justify-between">

                  <div>

                    <p className="text-xs text-slate-500">
                      Risk Level
                    </p>

                    <p className="mt-2 text-2xl font-bold text-amber-300">
                      {safeRisk.level}
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      Risk Score {safeRisk.score}/100
                    </p>

                  </div>

                  <div className="rounded-2xl bg-amber-400/10 p-3">

                    <ShieldAlert
                      size={23}
                      className="text-amber-300"
                    />

                  </div>

                </div>

                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/5">

                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500"
                    style={{
                      width: `${safeRisk.score}%`,
                    }}
                  />

                </div>

              </div>

              {/* Humidity */}

              <div className="glass glass-hover relative overflow-hidden rounded-3xl p-5">

                <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-fuchsia-500/10 blur-2xl" />

                <div className="flex items-start justify-between">

                  <div>

                    <p className="text-xs text-slate-500">
                      Humidity
                    </p>

                    <p className="mt-2 text-3xl font-bold">
                      {currentWeather.humidity}%
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      Atmospheric moisture
                    </p>

                  </div>

                  <div className="rounded-2xl bg-fuchsia-500/10 p-3 text-xl">
                    💧
                  </div>

                </div>

                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/5">

                  <div
                    className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-violet-500"
                    style={{
                      width: `${currentWeather.humidity}%`,
                    }}
                  />

                </div>

              </div>

              {/* AI Assistant */}

              <div
                id="assistant"
                className="glass glass-hover glow-purple relative overflow-hidden rounded-3xl p-5"
              >

                <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-violet-500/20 blur-2xl" />

                <div className="flex items-center gap-3">

                  <div className="rounded-2xl bg-violet-500/15 p-3">

                    <Bot
                      size={22}
                      className="text-violet-300"
                    />

                  </div>

                  <div>

                    <p className="font-semibold">
                      AI Assistant
                    </p>

                    <p className="text-[10px] text-slate-500">
                      Ask ASTRA
                    </p>

                  </div>

                </div>

                <div className="mt-4 flex gap-2">

                  <input
                    value={question}
                    onChange={(e) =>
                      setQuestion(e.target.value)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleAskAssistant();
                      }
                    }}
                    placeholder="Is it safe to travel?"
                    className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs outline-none placeholder:text-slate-600 focus:border-violet-500"
                  />

                  <button
                    onClick={handleAskAssistant}
                    className="rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-3 text-sm font-bold transition hover:scale-105"
                  >
                    →
                  </button>

                </div>

              </div>

            </section>

          ) : null}

          {/* ================================================= */}
          {/* ASSISTANT RESPONSE */}
          {/* ================================================= */}

          {assistantResponse && (

            <section className="glass mb-6 rounded-2xl border-violet-500/20 p-4">

              <div className="flex gap-3">

                <div className="rounded-xl bg-violet-500/10 p-2">

                  <Bot
                    size={18}
                    className="text-violet-300"
                  />

                </div>

                <div>

                  <p className="text-xs font-semibold text-violet-300">
                    ASTRA Assistant
                  </p>

                  <p className="mt-1 text-sm leading-6 text-slate-300">
                    {assistantResponse}
                  </p>

                </div>

              </div>

            </section>

          )}

          {/* ================================================= */}
          {/* ROUTE + ALERTS */}
          {/* ================================================= */}

          {currentWeather && currentRisk && (

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">

              {/* Route Planner */}

              <div
                id="risk-map"
                className="animate-fade-up"
              >

                <MapCard
                  location={location}
                  risk={currentRisk}
                  coordinates={
                    locationCoordinates[location]
                  }
                />

              </div>

              {/* Alerts */}

              <div
                id="alerts"
                className="space-y-6"
              >

                <div className="glass rounded-3xl p-5">

                  <div className="mb-4 flex items-center justify-between">

                    <div className="flex items-center gap-3">

                      <div className="rounded-xl bg-pink-500/10 p-2">

                        <Bell
                          size={18}
                          className="text-pink-300"
                        />

                      </div>

                      <div>

                        <h2 className="font-bold">
                          Latest Alerts
                        </h2>

                        <p className="text-[10px] text-slate-500">
                          Weather intelligence
                        </p>

                      </div>

                    </div>

                    <span className="rounded-lg bg-white/5 px-2 py-1 text-[10px] text-slate-400">
                      LIVE
                    </span>

                  </div>

                  <AlertCard
                    location={location}
                    risk={currentRisk}
                  />

                </div>

                {/* Quick weather */}

                <div className="glass rounded-3xl p-5">

                  <h3 className="font-semibold">
                    Weather Overview
                  </h3>

                  <div className="mt-4 grid grid-cols-2 gap-3">

                    <div className="rounded-xl bg-white/5 p-3">

                      <p className="text-[10px] text-slate-500">
                        Rainfall
                      </p>

                      <p className="mt-1 font-bold">
                        {currentWeather.rainfall} mm
                      </p>

                    </div>

                    <div className="rounded-xl bg-white/5 p-3">

                      <p className="text-[10px] text-slate-500">
                        Wind
                      </p>

                      <p className="mt-1 font-bold">
                        {currentWeather.windSpeed} km/h
                      </p>

                    </div>

                  </div>

                </div>

              </div>

            </section>

          )}

          {/* ================================================= */}
          {/* DETAILED WEATHER / RISK */}
          {/* ================================================= */}

          {currentWeather && currentRisk && (

            <section className="mt-6 grid gap-6 lg:grid-cols-2">

              <div id="weather-details">

                <WeatherCard
                  weather={{
                    ...currentWeather,
                    location,
                  }}
                />

              </div>

              <RiskCard
                risk={currentRisk}
              />

            </section>

          )}

          {/* ================================================= */}
          {/* EMERGENCY MODE */}
          {/* ================================================= */}

          <section
            id="emergency"
            className="mt-6"
          >

            {!emergencyMode ? (

              <div className="glass relative overflow-hidden rounded-3xl border border-red-500/20 p-6">

                <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-red-500/10 blur-3xl" />

                <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">

                  <div>

                    <div className="flex items-center gap-3">

                      <div className="rounded-xl bg-red-500/10 p-3">

                        <ShieldAlert
                          size={24}
                          className="text-red-400"
                        />

                      </div>

                      <div>

                        <h2 className="text-xl font-bold">
                          Emergency Mode
                        </h2>

                        <p className="text-xs text-slate-500">
                          Safety guidance during severe weather
                        </p>

                      </div>

                    </div>

                  </div>

                  <button
                    onClick={() =>
                      setEmergencyMode(true)
                    }
                    className="rounded-xl bg-red-500/10 px-5 py-3 font-semibold text-red-300 transition-all hover:bg-red-500/20"
                  >
                    Activate Emergency Mode
                  </button>

                </div>

              </div>

            ) : (

              <EmergencyMode
                risk={safeRisk}
                location={location}
                onClose={() =>
                  setEmergencyMode(false)
                }
              />

            )}

          </section>

          {/* ================================================= */}
          {/* FOOTER */}
          {/* ================================================= */}

          <footer className="mt-10 border-t border-white/5 py-6 text-center">

            <p className="text-sm font-semibold">
              ASTRA
            </p>

            <p className="mt-1 text-xs text-slate-600">
              Climate Risk Awareness & Rider Decision-Support Platform
            </p>

          </footer>

        </main>

      </div>

    </div>
  );
}

export default App;