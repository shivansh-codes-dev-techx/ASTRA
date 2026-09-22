import {
  CloudRain,
  Droplets,
  Wind,
  CloudSun,
} from "lucide-react";

function WeatherCard({ weather }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">
            Current Weather
          </p>

          <h2 className="mt-1 text-2xl font-bold">
            {weather.location}
          </h2>
        </div>

        <CloudRain
          size={36}
          className="text-cyan-400"
        />
      </div>

      <div className="mb-6">
        <span className="text-5xl font-bold">
          {weather.temperature}°
        </span>

        <span className="ml-2 text-slate-400">
          Current
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">

        <WeatherStat
          icon={<Droplets size={18} />}
          label="Rainfall"
          value={`${weather.rainfall} mm`}
        />

        <WeatherStat
          icon={<CloudSun size={18} />}
          label="Rain Probability"
          value={`${weather.rainProbability}%`}
        />

        <WeatherStat
          icon={<Wind size={18} />}
          label="Wind"
          value={`${weather.windSpeed} km/h`}
        />

        <WeatherStat
          icon={<Droplets size={18} />}
          label="Humidity"
          value={`${weather.humidity}%`}
        />

      </div>
    </div>
  );
}

function WeatherStat({ icon, label, value }) {
  return (
    <div className="rounded-xl bg-slate-800 p-3">
      <div className="flex items-center gap-2 text-slate-400">
        {icon}

        <span className="text-xs">
          {label}
        </span>
      </div>

      <p className="mt-2 font-semibold">
        {value}
      </p>
    </div>
  );
}

export default WeatherCard;