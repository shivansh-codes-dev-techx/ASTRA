import { ShieldAlert } from "lucide-react";

function RiskCard({ risk }) {
  const levelStyles = {
    LOW: "text-green-400 border-green-500/30",
    MODERATE: "text-yellow-400 border-yellow-500/30",
    HIGH: "text-orange-400 border-orange-500/30",
    EXTREME: "text-red-400 border-red-500/30",
  };

  const style =
    levelStyles[risk.level] ||
    levelStyles.MODERATE;

  return (
    <div
      className={`rounded-2xl border bg-slate-900 p-6 ${style}`}
    >
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">
            Current Risk
          </p>

          <h2 className="mt-1 text-2xl font-bold text-white">
            Weather Risk
          </h2>
        </div>

        <ShieldAlert size={34} />
      </div>

      <div className="flex items-center gap-5">
        <div
          className={`flex h-28 w-28 items-center justify-center rounded-full border-8 ${style}`}
        >
          <span className="text-4xl font-bold text-white">
            {risk.score}
          </span>
        </div>

        <div>
          <p className={`text-2xl font-bold ${style.split(" ")[0]}`}>
            {risk.level}
          </p>

          <p className="mt-2 text-sm text-slate-400">
            Weather risk assessment
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <p className="text-sm font-medium text-slate-300">
          Risk factors
        </p>

        {risk.factors.map((factor) => (
          <p
            key={factor}
            className="text-sm text-slate-400"
          >
            • {factor}
          </p>
        ))}
      </div>
    </div>
  );
}

export default RiskCard;