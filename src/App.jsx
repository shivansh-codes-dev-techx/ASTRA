import { useState } from "react";
import {
  CloudRain,
  Map,
  Bell,
  ShieldAlert,
  Bot,
} from "lucide-react";
import StatusMessage from "./components/StatusMessage";
import WeatherCard from "./components/WeatherCard";
import RiskCard from "./components/RiskCard";
import MapCard from "./components/MapCard";

import {
  weatherData,
  riskData,
  alertData,
} from "./data/mockData";

function App() {
  const [emergencyMode, setEmergencyMode] = useState(false);
  const [question, setQuestion] = useState("");
  const [assistantResponse, setAssistantResponse] = useState("");

  return (
    <div className="min-h-screen bg-slate-950 text-white">

      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-slate-950/95">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">

          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan-500/10 p-2">
              <CloudRain className="text-cyan-400" size={24} />
            </div>

            <div>
              <h1 className="text-xl font-bold">ASTRA</h1>
              <p className="text-xs text-slate-400">
                Climate Risk Intelligence
              </p>
            </div>
          </div>

          <div className="hidden gap-6 text-sm text-slate-300 md:flex">
            <a href="#weather" className="hover:text-cyan-400">
              Weather
            </a>

            <a href="#map" className="hover:text-cyan-400">
              Risk Map
            </a>

            <a href="#alerts" className="hover:text-cyan-400">
              Alerts
            </a>

            <a href="#emergency" className="hover:text-cyan-400">
              Emergency
            </a>
          </div>

        </div>
      </nav>

      {/* Main */}
      <main className="mx-auto max-w-7xl px-6 py-10">

        {/* System Status */}
        <section className="mb-6">
          <StatusMessage
            type="success"
            message="ASTRA weather monitoring system is online."
          />

          <p className="mt-3 text-xs text-slate-500">
            Weather and risk information is currently displayed using
            frontend mock data. Backend integration will be added after
            the final API contract is confirmed.
          </p>
        </section>

        {/* Hero */}
        <section className="mb-10">
          <p className="mb-2 text-sm font-medium text-cyan-400">
            WEATHER & DISASTER AWARENESS
          </p>

          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
            Understand the risk.
            <br />
            Prepare before it happens.
          </h2>

          <p className="mt-4 max-w-2xl text-slate-400">
            ASTRA combines weather information and risk analysis
            to help communities understand changing weather conditions.
          </p>
        </section>

        {/* Weather + Risk */}
        <section
          id="weather"
          className="grid gap-6 lg:grid-cols-2"
        >
          <WeatherCard weather={weatherData} />

          <RiskCard risk={riskData} />
        </section>

        {/* Map */}
        <section id="map" className="mt-6">
          <MapCard />
        </section>

        {/* Alerts */}
        <section
          id="alerts"
          className="mt-6 rounded-2xl border border-orange-500/20 bg-slate-900 p-6"
        >
          <div className="flex items-start gap-4">

            <div className="rounded-xl bg-orange-500/10 p-3">
              <Bell className="text-orange-400" size={24} />
            </div>

            <div>
              <p className="text-sm text-slate-400">
                Weather Alert
              </p>

              <h2 className="mt-1 text-xl font-bold">
                {alertData.title}
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                {alertData.message}
              </p>

              <p className="mt-3 text-sm font-medium text-orange-400">
                Recommended action: {alertData.recommendation}
              </p>
            </div>

          </div>
        </section>

        {/* Emergency Mode */}
        <section
          id="emergency"
          className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-6"
        >
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">

            <div>
              <div className="flex items-center gap-3">
                <ShieldAlert className="text-red-400" size={26} />

                <h2 className="text-xl font-bold">
                  Emergency Mode
                </h2>
              </div>

              <p className="mt-2 max-w-2xl text-sm text-slate-400">
                Access important safety guidance during severe
                weather conditions.
              </p>
            </div>

            <button
              onClick={() => setEmergencyMode(!emergencyMode)}
              className="rounded-xl bg-red-500 px-5 py-3 font-semibold transition hover:bg-red-400"
            >
              {emergencyMode
                ? "Deactivate Emergency Mode"
                : "Activate Emergency Mode"}
            </button>
          </div>

          {emergencyMode && (
            <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-5">

              <h3 className="font-bold text-red-400">
                Emergency Safety Guidance
              </h3>

              <ul className="mt-3 space-y-2 text-sm text-slate-300">
                <li>• Move to a safer and elevated location if flooding is occurring.</li>
                <li>• Avoid flooded roads and fast-moving water.</li>
                <li>• Keep your phone charged and monitor official alerts.</li>
                <li>• Follow instructions from local emergency authorities.</li>
              </ul>

            </div>
          )}
        </section>

        {/* AI Assistant */}
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">

          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-cyan-500/10 p-3">
              <Bot className="text-cyan-400" size={24} />
            </div>

            <div>
              <p className="text-sm text-slate-400">
                ASTRA Assistant
              </p>

              <h2 className="text-xl font-bold">
                Ask about your weather risk
              </h2>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 md:flex-row">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Example: Is it safe to travel today?"
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none placeholder:text-slate-500 focus:border-cyan-500"
            />

            <button
              onClick={() => {
                if (!question.trim()) return;

                setAssistantResponse(
                  "Based on the current weather conditions, heavy rainfall may affect local travel. Consider avoiding unnecessary travel and monitor official weather alerts."
                );
              }}
              className="rounded-xl bg-cyan-500 px-6 py-3 font-semibold text-slate-950 hover:bg-cyan-400"
            >
              Ask ASTRA
            </button>
          </div>

          {assistantResponse && (
            <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
              <p className="text-xs font-medium text-cyan-400">
                ASTRA
              </p>

              <p className="mt-2 text-sm text-slate-300">
                {assistantResponse}
              </p>
            </div>
          )}

        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-6 py-6 text-center text-sm text-slate-500">
        ASTRA — Climate Risk Awareness Platform
      </footer>

    </div>
  );
}

export default App;