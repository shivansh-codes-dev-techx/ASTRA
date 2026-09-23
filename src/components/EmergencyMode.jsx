import { AlertTriangle, X, ShieldAlert } from "lucide-react";

function EmergencyMode({ risk, location, onClose }) {
  const riskLevel = risk?.level || "UNKNOWN";

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

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
      <div className="w-full max-w-lg rounded-3xl border border-red-500/30 bg-slate-950 p-6 shadow-2xl">
        
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-red-500/10 p-3">
              <ShieldAlert className="text-red-400" size={28} />
            </div>

            <div>
              <h2 className="text-xl font-bold">
                Emergency Mode
              </h2>

              <p className="text-sm text-slate-400">
                Safety guidance for {location}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-red-400" size={22} />

            <div>
              <p className="text-xs text-slate-500">
                CURRENT RISK
              </p>

              <p className="font-bold text-red-400">
                {riskLevel} · {risk?.score ?? "N/A"}/100
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-sm font-semibold">
            Immediate Safety Guidance
          </p>

          <div className="mt-3 space-y-3">
            {currentInstructions.map((instruction, index) => (
              <div
                key={index}
                className="flex gap-3 rounded-xl bg-slate-900 p-3"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-xs font-bold text-red-400">
                  {index + 1}
                </span>

                <p className="text-sm text-slate-300">
                  {instruction}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-slate-900 p-4">
          <p className="text-xs text-slate-500">
            IMPORTANT
          </p>

          <p className="mt-1 text-sm text-slate-300">
            ASTRA provides decision-support information.
            Follow instructions from official emergency
            authorities during an actual emergency.
          </p>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full rounded-xl bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400 transition hover:bg-red-500/20"
        >
          Exit Emergency Mode
        </button>
      </div>
    </div>
  );
}

export default EmergencyMode;