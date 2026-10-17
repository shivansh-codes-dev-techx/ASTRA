
import { AlertTriangle, X, ShieldAlert, MapPin } from "lucide-react";

function EmergencyMode({ risk, location, onClose }) {
  const riskLevel = String(risk?.level || "UNKNOWN").toUpperCase();

  const parsedScore = Number(risk?.score ?? 0);
  const riskScore = Number.isFinite(parsedScore)
    ? Math.min(100, Math.max(0, parsedScore))
    : 0;

  const safeLocation =
    typeof location === "string" && location.trim()
      ? location.trim()
      : "your current area";

  const instructions = {
    EXTREME: [
      "Move to a safe and sheltered location.",
      "Avoid flooded roads and low-lying areas.",
      "Do not travel unless absolutely necessary.",
      "Follow instructions from local emergency authorities.",
    ],
    HIGH: [
      "Avoid unnecessary travel.",
      "Stay away from flooded or low-lying areas.",
      "Monitor official weather alerts.",
      "Keep your phone charged and emergency supplies ready.",
    ],
    MODERATE: [
      "Stay updated with weather conditions.",
      "Avoid risky routes during heavy rainfall.",
      "Keep emergency contacts accessible.",
    ],
    LOW: [
      "Continue normal activities with basic weather awareness.",
      "Keep monitoring weather updates.",
    ],
    UNKNOWN: [
      "Check the latest official weather updates.",
      "Use caution until reliable risk information is available.",
      "Follow local emergency authority instructions.",
    ],
  };

  const currentInstructions =
    instructions[riskLevel] || instructions.UNKNOWN;

  const riskStyles = {
    EXTREME: {
      border: "border-red-500/40",
      bg: "bg-red-500/10",
      text: "text-red-400",
      bar: "bg-red-500",
      label: "EXTREME RISK",
    },
    HIGH: {
      border: "border-orange-500/40",
      bg: "bg-orange-500/10",
      text: "text-orange-400",
      bar: "bg-orange-500",
      label: "HIGH RISK",
    },
    MODERATE: {
      border: "border-yellow-500/40",
      bg: "bg-yellow-500/10",
      text: "text-yellow-400",
      bar: "bg-yellow-500",
      label: "MODERATE RISK",
    },
    LOW: {
      border: "border-cyan-400/30",
      bg: "bg-cyan-400/10",
      text: "text-cyan-300",
      bar: "bg-cyan-400",
      label: "LOW RISK",
    },
    UNKNOWN: {
      border: "border-slate-500/30",
      bg: "bg-slate-500/10",
      text: "text-slate-400",
      bar: "bg-slate-500",
      label: "UNKNOWN RISK",
    },
  };

  const style = riskStyles[riskLevel] || riskStyles.UNKNOWN;
  const factors = Array.isArray(risk?.factors) ? risk.factors : [];

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-md sm:p-6"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose?.();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="emergency-mode-title"
        className={`my-auto w-full max-w-xl rounded-3xl border ${style.border} bg-slate-950 p-5 shadow-2xl shadow-black/40 sm:p-7`}
      >
        <header className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className={`shrink-0 rounded-xl ${style.bg} p-3`}>
              <ShieldAlert className={style.text} size={28} />
            </div>

            <div className="min-w-0">
              <h2
                id="emergency-mode-title"
                className="text-xl font-bold text-white sm:text-2xl"
              >
                Emergency Mode
              </h2>

              <p className="mt-1 flex items-center gap-1.5 break-words text-sm text-slate-400">
                <MapPin size={14} className="shrink-0" />
                Safety guidance for {safeLocation}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close emergency mode"
            className="shrink-0 rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-400"
          >
            <X size={20} />
          </button>
        </header>

        <div
          className={`mt-6 rounded-2xl border ${style.border} ${style.bg} p-4`}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className={style.text} size={22} />

            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium tracking-wider text-slate-400">
                CURRENT RISK
              </p>

              <p className={`mt-1 font-bold ${style.text}`}>
                {style.label} - {riskScore}/100
              </p>
            </div>
          </div>

          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800"
            role="progressbar"
            aria-label="Current weather risk score"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={riskScore}
          >
            <div
              className={`h-full rounded-full transition-all duration-700 ${style.bar}`}
              style={{ width: `${riskScore}%` }}
            />
          </div>
        </div>

        {factors.length > 0 && (
          <section className="mt-5" aria-labelledby="risk-contributors-title">
            <h3
              id="risk-contributors-title"
              className="text-sm font-semibold text-white"
            >
              Risk Contributors
            </h3>

            <div className="mt-3 flex flex-wrap gap-2">
              {factors.map((factor, index) => (
                <span
                  key={`${String(factor)}-${index}`}
                  className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300"
                >
                  {String(factor)}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="mt-6" aria-labelledby="safety-guidance-title">
          <h3
            id="safety-guidance-title"
            className="text-sm font-semibold text-white"
          >
            Immediate Safety Guidance
          </h3>

          <ol className="mt-3 space-y-3">
            {currentInstructions.map((instruction, index) => (
              <li
                key={instruction}
                className="flex gap-3 rounded-xl border border-slate-800/80 bg-slate-900 p-3"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${style.bg} text-xs font-bold ${style.text}`}
                >
                  {index + 1}
                </span>

                <p className="text-sm leading-6 text-slate-300">
                  {instruction}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <aside className="mt-6 rounded-xl border border-red-500/30 bg-red-500/[0.08] p-4">
          <p className="text-xs font-bold tracking-wider text-red-300">
            SOS NOT SENT
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-200">
            Emergency Mode displays safety guidance only. It does not send an
            SOS, share your location, or contact emergency services.
          </p>
          <a
            href="tel:112"
            className="mt-3 inline-flex rounded-lg border border-red-400/40 px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-400/10"
          >
            Call India emergency helpline: 112
          </a>
        </aside>

        <aside className="mt-3 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs font-semibold tracking-wider text-slate-400">
            IMPORTANT
          </p>

          <p className="mt-1 text-sm leading-6 text-slate-300">
            ASTRA provides decision-support information. During an actual
            emergency, follow instructions from official emergency authorities.
          </p>
        </aside>

        <button
          type="button"
          onClick={onClose}
          className={`mt-6 w-full rounded-xl ${style.bg} px-4 py-3.5 text-sm font-semibold ${style.text} transition hover:brightness-125 focus:outline-none focus:ring-2 focus:ring-slate-400`}
        >
          Exit Emergency Mode
        </button>
      </section>
    </div>
  );
}

export default EmergencyMode;
