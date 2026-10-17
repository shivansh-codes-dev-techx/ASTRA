
import { AlertTriangle, ShieldAlert } from "lucide-react";

function RiskCard({ risk }) {
  if (!risk) return null;

  const rawScore = Number(risk.score);
  const score = Number.isFinite(rawScore)
    ? Math.min(100, Math.max(0, rawScore))
    : 0;

  const level = String(risk.level || "UNKNOWN").toUpperCase();

  const levelStyles = {
    LOW: {
      text: "text-green-400",
      border: "border-green-500/30",
      bg: "bg-green-500",
      track: "bg-green-500/10",
    },
    MODERATE: {
      text: "text-yellow-400",
      border: "border-yellow-500/30",
      bg: "bg-yellow-500",
      track: "bg-yellow-500/10",
    },
    HIGH: {
      text: "text-orange-400",
      border: "border-orange-500/30",
      bg: "bg-orange-500",
      track: "bg-orange-500/10",
    },
    EXTREME: {
      text: "text-red-400",
      border: "border-red-500/30",
      bg: "bg-red-500",
      track: "bg-red-500/10",
    },
    UNKNOWN: {
      text: "text-slate-400",
      border: "border-slate-500/30",
      bg: "bg-slate-500",
      track: "bg-slate-500/10",
    },
  };

  const style = levelStyles[level] || levelStyles.UNKNOWN;
  const factors = Array.isArray(risk.factors)
    ? risk.factors
    : [];

  return (
    <section
      className={`rounded-2xl border bg-slate-900 p-6 ${style.border}`}
      aria-label="Weather risk assessment"
    >
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">Current Risk</p>
          <h2 className="mt-1 text-2xl font-bold text-white">
            Weather Risk
          </h2>
        </div>

        <div className={`rounded-xl p-3 ${style.track}`}>
          <ShieldAlert size={28} className={style.text} />
        </div>
      </div>

      <div className="flex items-center gap-5">
        <div
          className={`flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-8 ${style.border}`}
          aria-label={`Risk score ${score} out of 100`}
        >
          <div className="text-center">
            <p className="text-4xl font-bold text-white">
              {score}
            </p>
            <p className="text-xs text-slate-400">/ 100</p>
          </div>
        </div>

        <div className="min-w-0">
          <p className={`text-2xl font-bold ${style.text}`}>
            {level}
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Current weather risk assessment
          </p>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-slate-400">Risk Score</span>
          <span className={style.text}>{score}/100</span>
        </div>

        <div
          className="h-2 overflow-hidden rounded-full bg-slate-800"
          role="progressbar"
          aria-label="Weather risk score"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={score}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${style.bg}`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle size={17} className={style.text} />
          <h3 className="text-sm font-medium text-slate-200">
            Risk Factors
          </h3>
        </div>

        {factors.length > 0 ? (
          <ul className="space-y-2">
            {factors.map((factor, index) => (
              <li
                key={`${factor}-${index}`}
                className="rounded-lg border border-slate-700/60 bg-slate-800/70 px-3 py-2 text-sm text-slate-300"
              >
                {factor}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg bg-slate-800/70 px-3 py-3 text-sm text-slate-400">
            No specific risk factors available.
          </p>
        )}
      </div>
    </section>
  );
}

export default RiskCard;
