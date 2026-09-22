import { useEffect, useState } from "react";

import {
  CloudRain,
  ShieldAlert,
  Bot,
} from "lucide-react";

import StatusMessage from "./components/StatusMessage";
import WeatherCard from "./components/WeatherCard";
import RiskCard from "./components/RiskCard";
import MapCard from "./components/MapCard";
import AlertCard from "./components/AlertCard";
import LoadingSkeleton from "./components/LoadingSkeleton";
import LocationSelector from "./components/LocationSelector";

import { getAssistantResponse } from "./services/assistantService";

import {
  mockWeatherData,
  mockRiskData,
} from "./data/mockData";

function App() {
  const [emergencyMode, setEmergencyMode] = useState(false);

  const [question, setQuestion] = useState("");
  const [assistantResponse, setAssistantResponse] = useState("");

  const [menuOpen, setMenuOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error] = useState(false);

  const [location, setLocation] = useState("Ghaziabad");

  const currentWeather = mockWeatherData[location];
  const currentRisk = mockRiskData[location];

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  const handleLocationChange = (newLocation) => {
    setLocation(newLocation);

    // Clear old assistant conversation
    setAssistantResponse("");
    setQuestion("");

    // Close mobile menu if needed
    setMenuOpen(false);
  };

  const handleAskAssistant = () => {
    if (!question.trim()) {
      return;
    }

    const response = getAssistantResponse({
      question,
      location,
      weather: currentWeather,
      risk: currentRisk,
    });

    setAssistantResponse(response);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-950 text-white">

      {/* ==================== NAVBAR ==================== */}

      <nav className="relative border-b border-slate-800 bg-slate-950/95">

        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">

          {/* Logo */}

          <div className="flex items-center gap-3">

            <div className="rounded-xl bg-cyan-500/10 p-2">
              <CloudRain
                className="text-cyan-400"
                size={24}
              />
            </div>

            <div>
              <h1 className="text-xl font-bold">
                ASTRA
              </h1>

              <p className="hidden text-xs text-slate-400 sm:block">
                Climate Risk Intelligence
              </p>
            </div>

          </div>

          {/* Desktop Navigation */}

          <div className="hidden gap-6 text-sm text-slate-300 md:flex">

            <a
              href="#weather"
              className="transition hover:text-cyan-400"
            >
              Weather
            </a>

            <a
              href="#risk-map"
              className="transition hover:text-cyan-400"
            >
              Risk Map
            </a>

            <a
              href="#alerts"
              className="transition hover:text-cyan-400"
            >
              Alerts
            </a>

            <a
              href="#emergency"
              className="transition hover:text-cyan-400"
            >
              Emergency
            </a>

          </div>

          {/* Mobile Menu Button */}

          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle navigation menu"
            className="rounded-lg border border-slate-700 p-2 transition hover:border-cyan-500 hover:text-cyan-400 md:hidden"
          >
            <span className="text-xl">
              {menuOpen ? "✕" : "☰"}
            </span>
          </button>

        </div>

        {/* Mobile Navigation */}

        {menuOpen && (
          <div className="absolute left-0 right-0 top-full z-50 border-b border-slate-800 bg-slate-950 p-4 shadow-xl md:hidden">

            <div className="flex flex-col gap-2 text-sm text-slate-300">

              <a
                href="#weather"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-3 transition hover:bg-slate-800 hover:text-cyan-400"
              >
                Weather
              </a>

              <a
                href="#risk-map"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-3 transition hover:bg-slate-800 hover:text-cyan-400"
              >
                Risk Map
              </a>

              <a
                href="#alerts"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-3 transition hover:bg-slate-800 hover:text-cyan-400"
              >
                Alerts
              </a>

              <a
                href="#emergency"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-3 transition hover:bg-slate-800 hover:text-cyan-400"
              >
                Emergency
              </a>

            </div>

          </div>
        )}

      </nav>

      {/* ==================== MAIN ==================== */}

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">

        {/* ==================== SYSTEM STATUS ==================== */}

        <section className="mb-6">

          <StatusMessage
            type="success"
            message="ASTRA weather monitoring system is online."
          />

          <p className="mt-3 text-xs leading-5 text-slate-500">
            Weather and risk information is currently displayed using
            frontend mock data. Backend integration will be added after
            the final API contract is confirmed.
          </p>

        </section>

        {/* ==================== HERO ==================== */}

        <section className="mb-8 sm:mb-10">

          <p className="mb-2 text-sm font-medium text-cyan-400">
            WEATHER & DISASTER AWARENESS
          </p>

          <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl md:text-5xl">

            Understand the risk.
            <br />

            Prepare before it happens.

          </h2>

          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">

            ASTRA combines weather information and risk analysis
            to help communities understand changing weather conditions.

          </p>

        </section>

        {/* ==================== LOCATION SELECTOR ==================== */}

        <section className="mb-6">

          <LocationSelector
            location={location}
            onLocationChange={handleLocationChange}
          />

        </section>

        {/* ==================== WEATHER + RISK ==================== */}

        <section id="weather">

          {loading ? (

            <LoadingSkeleton />

          ) : error ? (

            <StatusMessage
              type="error"
              message="Unable to load weather and risk information."
            />

          ) : (

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">

              {/* Weather Card */}

              <WeatherCard
                weather={currentWeather}
              />

              {/* Risk Card */}

              <RiskCard
                risk={currentRisk}
              />

            </div>

          )}

        </section>

        {/* ==================== RISK MAP ==================== */}

        <section
          id="risk-map"
          className="mt-5 sm:mt-6"
        >

          <MapCard
            location={location}
            risk={currentRisk}
          />

        </section>

        {/* ==================== DYNAMIC ALERTS ==================== */}

        <section
          id="alerts"
          className="mt-5 sm:mt-6"
        >

          <AlertCard
            location={location}
            risk={currentRisk}
          />

        </section>

        {/* ==================== EMERGENCY MODE ==================== */}

        <section
          id="emergency"
          className="mt-5 rounded-2xl border border-red-500/20 bg-red-500/5 p-5 sm:mt-6 sm:p-6"
        >

          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">

            {/* Emergency Information */}

            <div>

              <div className="flex items-center gap-3">

                <ShieldAlert
                  className="shrink-0 text-red-400"
                  size={26}
                />

                <h2 className="text-xl font-bold">
                  Emergency Mode
                </h2>

              </div>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Access important safety guidance during severe
                weather conditions.
              </p>

            </div>

            {/* Emergency Button */}

            <button
              onClick={() =>
                setEmergencyMode(!emergencyMode)
              }
              className="w-full rounded-xl bg-red-500 px-5 py-3 font-semibold transition hover:bg-red-400 sm:w-auto"
            >

              {emergencyMode
                ? "Deactivate Emergency Mode"
                : "Activate Emergency Mode"}

            </button>

          </div>

          {/* Emergency Guidance */}

          {emergencyMode && (

            <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-5">

              <h3 className="font-bold text-red-400">
                Emergency Safety Guidance
              </h3>

              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-300">

                <li>
                  • Move to a safer and elevated location if flooding is occurring.
                </li>

                <li>
                  • Avoid flooded roads and fast-moving water.
                </li>

                <li>
                  • Keep your phone charged and monitor official alerts.
                </li>

                <li>
                  • Follow instructions from local emergency authorities.
                </li>

              </ul>

            </div>

          )}

        </section>

        {/* ==================== AI ASSISTANT ==================== */}

        <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:mt-6 sm:p-6">

          {/* Assistant Header */}

          <div className="flex items-center gap-3">

            <div className="shrink-0 rounded-xl bg-cyan-500/10 p-3">

              <Bot
                className="text-cyan-400"
                size={24}
              />

            </div>

            <div>

              <p className="text-sm text-slate-400">
                ASTRA Assistant
              </p>

              <h2 className="text-lg font-bold sm:text-xl">
                Ask about your weather risk
              </h2>

            </div>

          </div>

          {/* Current Context */}

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">

            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
              Current Weather Context
            </p>

            <div className="flex flex-wrap gap-2">

              <span className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300">
                📍 {location}
              </span>

              <span className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300">
                🌡️ {currentWeather.temperature}°C
              </span>

              <span className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300">
                🌧️ {currentWeather.rainProbability}% rain
              </span>

              <span className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300">
                ⚠️ {currentRisk.level} risk
              </span>

            </div>

          </div>

          {/* Question Input */}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">

            <input
              type="text"
              value={question}
              onChange={(e) =>
                setQuestion(e.target.value)
              }
              onKeyDown={(e) => {

                if (e.key === "Enter") {
                  handleAskAssistant();
                }

              }}
              placeholder="Example: Is it safe to travel today?"
              className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none transition placeholder:text-slate-500 focus:border-cyan-500"
            />

            <button
              onClick={handleAskAssistant}
              className="w-full rounded-xl bg-cyan-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400 sm:w-auto"
            >
              Ask ASTRA
            </button>

          </div>

          {/* Assistant Response */}

          {assistantResponse && (

            <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">

              <div className="flex items-center gap-2">

                <Bot
                  className="text-cyan-400"
                  size={18}
                />

                <p className="text-xs font-medium text-cyan-400">
                  ASTRA
                </p>

              </div>

              <p className="mt-2 text-sm leading-6 text-slate-300">
                {assistantResponse}
              </p>

            </div>

          )}

        </section>

      </main>

      {/* ==================== FOOTER ==================== */}

      <footer className="border-t border-slate-800 px-4 py-6 text-center text-xs text-slate-500 sm:px-6 sm:text-sm">

        <p>
          ASTRA — Climate Risk Awareness Platform
        </p>

        <p className="mt-1 text-slate-600">
          Weather awareness and decision-support prototype
        </p>

      </footer>

    </div>
  );
}

export default App;