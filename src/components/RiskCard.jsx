import { ShieldAlert, AlertTriangle } from "lucide-react";

function RiskCard({ risk }) {
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
    };

    const style = levelStyles[risk.level] || levelStyles.MODERATE;

    return (
        <div
            className={`rounded-2xl border bg-slate-900 p-6 ${style.border}`}
        >
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <p className="text-sm text-slate-400">
                        Current Risk
                    </p>

                    <h2 className="mt-1 text-2xl font-bold">
                        Weather Risk
                    </h2>
                </div>

                <div className={`rounded-xl ${style.track} p-3`}>
                    <ShieldAlert
                        size={28}
                        className={style.text}
                    />
                </div>
            </div>

            {/* Score */}
            <div className="flex items-center gap-6">
                <div
                    className={`flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-8 ${style.border}`}
                >
                    <div className="text-center">
                        <span className="text-4xl font-bold">
                            {risk.score}
                        </span>

                        <p className="text-xs text-slate-500">
                            / 100
                        </p>
                    </div>
                </div>

                <div>
                    <p className={`text-2xl font-bold ${style.text}`}>
                        {risk.level}
                    </p>

                    <p className="mt-2 text-sm text-slate-400">
                        Current weather risk assessment
                    </p>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-6">
                <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                        Risk Score
                    </span>

                    <span className={style.text}>
                        {risk.score}%
                    </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div
                        className={`h-full rounded-full ${style.bg}`}
                        style={{ width: `${risk.score}%` }}
                    />
                </div>
            </div>

            {/* Risk Factors */}
            <div className="mt-6">
                <div className="mb-3 flex items-center gap-2">
                    <AlertTriangle
                        size={17}
                        className={style.text}
                    />

                    <p className="text-sm font-medium text-slate-300">
                        Risk Factors
                    </p>
                </div>

                <div className="space-y-2">
                    {risk.factors.map((factor) => (
                        <div
                            key={factor}
                            className="rounded-lg bg-slate-800/70 px-3 py-2 text-sm text-slate-300"
                        >
                            {factor}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default RiskCard;