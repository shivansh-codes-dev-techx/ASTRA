import { AlertTriangle, X, ShieldAlert } from "lucide-react";

function EmergencyMode({ risk, location, onClose }) {
  const riskLevel = risk?.level || "UNKNOWN";
  const riskScore = Math.min(100, Math.max(0, Number(risk?.score ?? 0)));

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
  };

  const currentInstructions =
    instructions[riskLevel] || instructions.MODERATE;

  const riskStyles = {
    EXTREME: {
      border: "border-red-500/40",
      bg: "bg-red-500/10",
      text: "text-red-400",
      label: "EXTREME RISK",
    },

    HIGH: {
      border: "border-orange-500/40",
      bg: "bg-orange-500/10",
      text: "text-orange-400",
      label: "HIGH RISK",
    },

    MODERATE: {
      border: "border-yellow-500/40",
      bg: "bg-yellow-500/10",
      text: "text-yellow-400",
      label: "MODERATE RISK",
    },

    LOW: {
      border: "border-emerald-500/30",
      bg: "bg-emerald-500/10",
      text: "text-emerald-400",
      label: "LOW RISK",
    },

    UNKNOWN: {
      border: "border-slate-500/30",
      bg: "bg-slate-500/10",
      text: "text-slate-400",
      label: "UNKNOWN RISK",
    },
  };

  const style = riskStyles[riskLevel] || riskStyles.UNKNOWN;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md">
      <div
        className={`w-full max-w-lg rounded-3xl border ${style.border} bg-slate-950 p-6 shadow-2xl`}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-xl ${style.bg} p-3`}>
              <ShieldAlert className={style.text} size={28} />
            </div>

            <div>
              <h2 className="text-xl font-bold text-white">
                Emergency Mode
              </h2>

              <p className="text-sm text-slate-400">
                Safety guidance for {location}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close emergency mode"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        {/* Risk Status */}
        <div
          className={`mt-6 rounded-2xl border ${style.border} ${style.bg} p-4`}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className={style.text} size={22} />

            <div className="flex-1">
              <p className="text-xs text-slate-500">
                CURRENT RISK
              </p>

              <p className={`font-bold ${style.text}`}>
                {style.label} · {riskScore}/100
              </p>
            </div>
          </div>

          {/* Risk Progress */}
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                riskLevel === "EXTREME"
                  ? "bg-red-500"
                  : riskLevel === "HIGH"
                  ? "bg-orange-500"
                  : riskLevel === "MODERATE"
                  ? "bg-yellow-500"
                  : "bg-emerald-500"
              }`}
              style={{ width: `${riskScore}%` }}
            />
          </div>
        </div>

        {/* Risk Factors */}
        {Array.isArray(risk?.factors) && risk.factors.length > 0 && (
          <div className="mt-5">
            <p className="text-sm font-semibold text-white">
              Risk Contributors
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              {risk.factors.map((factor, index) => (
                <span
                  key={index}
                  className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-300"
                >
                  {factor}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Instructions */}
        <div className="mt-6">
          <p className="text-sm font-semibold text-white">
            Immediate Safety Guidance
          </p>

          <div className="mt-3 space-y-3">
            {currentInstructions.map((instruction, index) => (
              <div
                key={index}
                className="flex gap-3 rounded-xl bg-slate-900 p-3"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${style.bg} text-xs font-bold ${style.text}`}
                >
                  {index + 1}
                </span>

                <p className="text-sm text-slate-300">
                  {instruction}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-6 rounded-xl bg-slate-900 p-4">
          <p className="text-xs font-semibold text-slate-500">
            IMPORTANT
          </p>

          <p className="mt-1 text-sm leading-6 text-slate-300">
            ASTRA provides decision-support information.
            Follow instructions from official emergency
            authorities during an actual emergency.
          </p>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className={`mt-6 w-full rounded-xl ${style.bg} px-4 py-3 text-sm font-semibold ${style.text} transition hover:brightness-125`}
        >
          Exit Emergency Mode
        </button>
      </div>
    </div>
  );
}

export default EmergencyMode;