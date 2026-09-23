import {
    Bell,
    AlertTriangle,
    ShieldAlert,
} from "lucide-react";

function AlertCard({ location, risk }) {
    const alertConfig = {
        LOW: {
            icon: Bell,
            color: "green",
            title: "Weather Conditions Stable",
            message:
                "Current weather conditions show relatively low risk in this area.",
            recommendation:
                "Continue normal activities while staying aware of weather updates.",
        },

        MODERATE: {
            icon: Bell,
            color: "yellow",
            title: "Weather Caution",
            message:
                "Weather conditions may cause minor disruption in the local area.",
            recommendation:
                "Stay updated with weather information and plan travel carefully.",
        },

        HIGH: {
            icon: AlertTriangle,
            color: "orange",
            title: "Heavy Weather Alert",
            message:
                "Current conditions indicate increased weather risk that may affect local travel and low-lying areas.",
            recommendation:
                "Avoid unnecessary travel and monitor official weather alerts.",
        },

        EXTREME: {
            icon: ShieldAlert,
            color: "red",
            title: "Extreme Weather Alert",
            message:
                "Severe weather conditions may create significant safety risks.",
            recommendation:
                "Move to a safer location when necessary and follow official emergency guidance.",
        },
    };

    const config =
        alertConfig[risk?.level] || alertConfig.MODERATE;

    const Icon = config.icon;

    const colorClasses = {
        green: {
            border: "border-green-500/20",
            bg: "bg-green-500/5",
            iconBg: "bg-green-500/10",
            text: "text-green-400",
        },

        yellow: {
            border: "border-yellow-500/20",
            bg: "bg-yellow-500/5",
            iconBg: "bg-yellow-500/10",
            text: "text-yellow-400",
        },

        orange: {
            border: "border-orange-500/20",
            bg: "bg-orange-500/5",
            iconBg: "bg-orange-500/10",
            text: "text-orange-400",
        },

        red: {
            border: "border-red-500/20",
            bg: "bg-red-500/5",
            iconBg: "bg-red-500/10",
            text: "text-red-400",
        },
    };

    const styles = colorClasses[config.color];

    return (
        <div
            className={`rounded-2xl border p-6 ${styles.border} ${styles.bg}`}
        >
            <div className="flex items-start gap-4">
                <div className={`rounded-xl p-3 ${styles.iconBg}`}>
                    <Icon className={styles.text} size={24} />
                </div>

                <div className="flex-1">
                    <p className="text-sm text-slate-400">
                        Weather Alert · {location}
                    </p>

                    <h2 className="mt-1 text-xl font-bold">
                        {config.title}
                    </h2>

                    <p className="mt-2 text-sm text-slate-400">
                        {config.message}
                    </p>

                    <div className="mt-4 rounded-xl bg-slate-950/50 p-4">
                        <p className="text-xs font-medium text-slate-500">
                            RECOMMENDED ACTION
                        </p>

                        <p className={`mt-1 text-sm font-medium ${styles.text}`}>
                            {config.recommendation}
                        </p>
                    </div>

                    <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                        <span>Risk Level:</span>

                        <span className={`font-semibold ${styles.text}`}>
                            {risk?.level || "UNKNOWN"}
                        </span>

                        <span>•</span>

                        <span>
                            Score: {risk?.score ?? "N/A"}/100
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AlertCard;