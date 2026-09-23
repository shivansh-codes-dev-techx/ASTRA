import { MapPin } from "lucide-react";

function LocationSelector({ location, onLocationChange }) {
  const locations = [
    "Ghaziabad",
    "Delhi",
    "Noida",
    "Agra",
  ];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-cyan-500/10 p-3">
            <MapPin className="text-cyan-400" size={22} />
          </div>

          <div>
            <p className="text-xs text-slate-500">
              Selected Location
            </p>

            <p className="font-semibold">
              {location}
            </p>
          </div>
        </div>

        <select
          value={location}
          onChange={(e) => onLocationChange(e.target.value)}
          className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-cyan-500"
        >
          {locations.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export default LocationSelector;