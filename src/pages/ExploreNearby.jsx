import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from "react-leaflet";
import {
  ArrowUpRight,
  LocateFixed,
  MapPin,
  Fuel,
  HeartPulse,
  Wrench,
  Utensils,
  ParkingCircle,
  Search,
  LoaderCircle,
  RefreshCw,
  Navigation,
  Hotel,
  Landmark,
} from "lucide-react";
import "leaflet/dist/leaflet.css";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const categories = [
  { id: "all", label: "All places", icon: MapPin },
  { id: "fuel", label: "Fuel", icon: Fuel },
  { id: "health", label: "Healthcare", icon: HeartPulse },
  { id: "repair", label: "Repairs", icon: Wrench },
  { id: "food", label: "Food & cafes", icon: Utensils },
  { id: "parking", label: "Parking", icon: ParkingCircle },
  { id: "stays", label: "Hotels & stays", icon: Hotel },
  { id: "attractions", label: "Tourist attractions", icon: Landmark },
];

function getCategory(tags = {}) {
  const amenity = tags.amenity || "";
  const shop = tags.shop || "";
  const tourism = tags.tourism || "";
  const historic = tags.historic || "";

  if (amenity === "fuel") return "fuel";

  if (
    [
      "hotel", "motel", "guest_house", "hostel", "apartment",
      "chalet", "camp_site", "caravan_site",
    ].includes(tourism)
  ) {
    return "stays";
  }

  if (
    [
      "attraction", "museum", "viewpoint", "zoo",
      "theme_park", "gallery", "artwork",
    ].includes(tourism) ||
    ["monument", "castle", "ruins", "archaeological_site", "memorial"].includes(
      historic
    )
  ) {
    return "attractions";
  }
  if (["hospital", "clinic", "doctors", "pharmacy", "dentist"].includes(amenity)) {
    return "health";
  }
  if (
    ["car_repair", "car", "tyres", "car_parts"].includes(shop) ||
    amenity === "car_repair"
  ) {
    return "repair";
  }
  if (["restaurant", "cafe", "fast_food", "food_court"].includes(amenity)) {
    return "food";
  }
  if (amenity === "parking") return "parking";
  return "other";
}

function categoryLabel(category) {
  return categories.find((item) => item.id === category)?.label || "Nearby place";
}

function distanceBetween(a, b) {
  const radians = (degrees) => (degrees * Math.PI) / 180;
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function MapRecenter({ center }) {
  const map = useMap();

  useEffect(() => {
    if (center?.length === 2) {
      map.flyTo(center, 14, { duration: 0.8 });
    }
  }, [center, map]);

  return null;
}

function NearbyMap({ center, places, selectedPlace, onSelect }) {
  return (
    <MapContainer
      center={center}
      zoom={13}
      scrollWheelZoom
      className="h-full min-h-[440px] w-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapRecenter center={center} />

      <CircleMarker
        center={center}
        radius={9}
        pathOptions={{
          color: "#ffffff",
          weight: 3,
          fillColor: "#22d3ee",
          fillOpacity: 1,
        }}
      >
        <Popup>Search centre</Popup>
      </CircleMarker>

      {places.map((place) => (
        <CircleMarker
          key={place.id}
          center={place.coordinates}
          radius={selectedPlace?.id === place.id ? 9 : 6}
          eventHandlers={{ click: () => onSelect(place) }}
          pathOptions={{
            color: "#ffffff",
            weight: selectedPlace?.id === place.id ? 3 : 1,
            fillColor:
              place.category === "health"
                ? "#fb7185"
                : place.category === "fuel"
                  ? "#fbbf24"
                  : place.category === "repair"
                    ? "#a78bfa"
                    : "#22d3ee",
            fillOpacity: 0.95,
          }}
        >
          <Popup>
            <strong>{place.name}</strong>
            <br />
            {categoryLabel(place.category)}
            <br />
            {place.distanceKm.toFixed(1)} km away
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

export default function ExploreNearby() {
  const [center, setCenter] = useState([28.6692, 77.4538]);
  const [locationLabel, setLocationLabel] = useState("Ghaziabad");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [radius, setRadius] = useState("3000");

  const findNearby = useCallback(async () => {
    if (!center || center.length !== 2) {
      setError("Choose a location before searching for nearby places.");
      return;
    }

    setLoading(true);
    setError("");
    setSelectedPlace(null);

    const [lat, lon] = center;
    const metres = Number(radius);

    const query = `
      [out:json][timeout:25];
      (
        node(around:${metres},${lat},${lon})["amenity"~"fuel|hospital|clinic|doctors|pharmacy|dentist|restaurant|cafe|fast_food|food_court|parking|car_repair"];
        way(around:${metres},${lat},${lon})["amenity"~"fuel|hospital|clinic|doctors|pharmacy|dentist|restaurant|cafe|fast_food|food_court|parking|car_repair"];
        node(around:${metres},${lat},${lon})["shop"~"car_repair|car|tyres|car_parts"];
        way(around:${metres},${lat},${lon})["shop"~"car_repair|car|tyres|car_parts"];
        node(around:${metres},${lat},${lon})["tourism"~"hotel|motel|guest_house|hostel|apartment|chalet|camp_site|caravan_site|attraction|museum|viewpoint|zoo|theme_park|gallery|artwork"];
        way(around:${metres},${lat},${lon})["tourism"~"hotel|motel|guest_house|hostel|apartment|chalet|camp_site|caravan_site|attraction|museum|viewpoint|zoo|theme_park|gallery|artwork"];
        node(around:${metres},${lat},${lon})["historic"~"monument|castle|ruins|archaeological_site|memorial"];
        way(around:${metres},${lat},${lon})["historic"~"monument|castle|ruins|archaeological_site|memorial"];
      );
      out center 100;
    `;

    try {
      const response = await fetch(OVERPASS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: new URLSearchParams({ data: query }),
      });

      if (!response.ok) {
        throw new Error(
          response.status === 429
            ? "The map service is busy. Please wait before trying again."
            : `Nearby search failed (${response.status}).`
        );
      }

      const result = await response.json();

      const mapped = (result.elements || [])
        .map((item) => {
          const latitude = item.lat ?? item.center?.lat;
          const longitude = item.lon ?? item.center?.lon;

          if (
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude)
          ) {
            return null;
          }

          const coordinates = [latitude, longitude];

          return {
            id: `${item.type}-${item.id}`,
            name: item.tags?.name || item.tags?.brand || "Unnamed place",
            tags: item.tags || {},
            category: getCategory(item.tags),
            coordinates,
            distanceKm: distanceBetween(center, coordinates),
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.distanceKm - b.distanceKm);

      setPlaces(mapped);
    } catch (requestError) {
      console.error("Explore Nearby:", requestError);
      setError(
        requestError.message ||
          "Could not load nearby places. Check your connection and try again."
      );
      setPlaces([]);
    } finally {
      setLoading(false);
    }
  }, [center, radius]);

  useEffect(() => {
    findNearby();
  }, [findNearby]);

  const visiblePlaces = useMemo(() => {
    const term = search.trim().toLowerCase();

    return places.filter((place) => {
      const matchesCategory =
        category === "all" || place.category === category;
      const matchesSearch =
        !term ||
        place.name.toLowerCase().includes(term) ||
        Object.values(place.tags).some(
          (value) =>
            typeof value === "string" &&
            value.toLowerCase().includes(term)
        );

      return matchesCategory && matchesSearch;
    });
  }, [places, category, search]);

  const locateMe = () => {
    if (!navigator.geolocation) {
      setError("GPS is not supported by this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCenter([
          position.coords.latitude,
          position.coords.longitude,
        ]);
        setLocationLabel("Current GPS location");
        setError("");
      },
      () => {
        setError(
          "Location access was unavailable. Allow location permission or use your selected ASTRA location."
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  };

  return (
    <div className="relative min-h-[calc(100vh-73px)] overflow-hidden bg-[#030611] text-white">
      <div className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-cyan-500/[0.08] blur-[130px]" />
      <div className="pointer-events-none absolute right-0 top-20 h-96 w-96 rounded-full bg-violet-600/[0.08] blur-[130px]" />

      <main className="relative mx-auto max-w-[1700px] px-5 py-8 sm:px-8 lg:px-12">
        <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.4em] text-cyan-300">
              ASTRA · Local intelligence
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">
              Explore <span className="text-cyan-300">nearby.</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
              Discover fuel, repairs, healthcare, food, parking, hotels and
              tourist attractions around your location.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={locateMe}
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm transition hover:bg-white/[0.08]"
            >
              <LocateFixed size={16} className="text-cyan-300" />
              Use my GPS
            </button>
            <button
              onClick={findNearby}
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-3 text-sm font-bold transition hover:brightness-110 disabled:opacity-50"
            >
              {loading ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              Refresh places
            </button>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] px-4 py-3 text-xs text-slate-400 backdrop-blur-xl">
          <MapPin size={15} className="text-cyan-300" />
          <span>
            Search centred on <strong className="text-white">{locationLabel}</strong>
          </span>
          <span className="hidden text-slate-700 sm:inline">/</span>
          <label className="flex items-center gap-2">
            Radius
            <select
              value={radius}
              onChange={(event) => setRadius(event.target.value)}
              className="rounded-lg border border-white/10 bg-[#0b1020] px-2 py-1.5 text-white outline-none"
            >
              <option value="1000">1 km</option>
              <option value="3000">3 km</option>
              <option value="5000">5 km</option>
            </select>
          </label>
          <span className="text-[10px] text-slate-500">
            Place data from OpenStreetMap contributors
          </span>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="min-w-0 rounded-[28px] border border-white/10 bg-white/[0.025] p-4 backdrop-blur-xl sm:p-5">
            <div className="relative">
              <Search
                size={17}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search names or place details..."
                className="w-full rounded-xl border border-white/10 bg-black/20 py-3 pl-11 pr-4 text-sm outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40"
              />
            </div>

            <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
              {categories.map((item) => {
                const Icon = item.icon;
                const active = category === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => setCategory(item.id)}
                    className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-xs transition ${
                      active
                        ? "border-cyan-300/30 bg-cyan-300/10 text-cyan-200"
                        : "border-white/[0.08] bg-white/[0.02] text-slate-400 hover:bg-white/[0.06]"
                    }`}
                  >
                    <Icon size={14} />
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm font-semibold">Nearby places</p>
              <span className="text-xs text-slate-500">
                {visiblePlaces.length} results
              </span>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-3 text-xs leading-5 text-rose-200">
                {error}
              </div>
            )}

            <div className="mt-3 max-h-[540px] space-y-2 overflow-y-auto pr-1">
              {loading && places.length === 0 ? (
                <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-400">
                  <LoaderCircle size={18} className="animate-spin text-cyan-300" />
                  Searching the surrounding area...
                </div>
              ) : visiblePlaces.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-5 py-12 text-center">
                  <MapPin size={25} className="mx-auto text-slate-600" />
                  <p className="mt-4 text-sm font-semibold">
                    No matching places found
                  </p>
                  <p className="mx-auto mt-2 max-w-xs text-xs leading-5 text-slate-500">
                    Try another category or a larger radius. OpenStreetMap
                    coverage varies by area.
                  </p>
                </div>
              ) : (
                visiblePlaces.map((place) => {
                  const Icon =
                    categories.find((item) => item.id === place.category)?.icon ||
                    MapPin;

                  return (
                    <button
                      key={place.id}
                      onClick={() => setSelectedPlace(place)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        selectedPlace?.id === place.id
                          ? "border-cyan-300/30 bg-cyan-300/[0.06]"
                          : "border-white/[0.07] bg-black/10 hover:border-white/15 hover:bg-white/[0.035]"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06]">
                          <Icon size={18} className="text-cyan-300" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-100">
                            {place.name}
                          </p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {categoryLabel(place.category)}
                            {place.tags.opening_hours
                              ? ` · ${place.tags.opening_hours}`
                              : ""}
                          </p>
                          <p className="mt-2 text-xs text-cyan-200">
                            {place.distanceKm < 1
                              ? `${Math.round(place.distanceKm * 1000)} m away`
                              : `${place.distanceKm.toFixed(1)} km away`}
                          </p>
                        </div>
                        <ArrowUpRight size={16} className="shrink-0 text-slate-500" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-[28px] border border-white/10 bg-[#080d19]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-sm font-semibold">Area map</p>
                <p className="mt-1 text-[10px] text-slate-500">
                  Select a marker to inspect a place
                </p>
              </div>
              <Navigation size={18} className="text-cyan-300" />
            </div>
            <div className="h-[520px] sm:h-[650px]">
              <NearbyMap
                center={center}
                places={visiblePlaces}
                selectedPlace={selectedPlace}
                onSelect={setSelectedPlace}
              />
            </div>

            {selectedPlace && (
              <div className="border-t border-white/10 bg-black/20 p-5">
                <p className="text-sm font-semibold">{selectedPlace.name}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {categoryLabel(selectedPlace.category)} ·{" "}
                  {selectedPlace.distanceKm.toFixed(1)} km from search centre
                </p>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedPlace.coordinates[0]},${selectedPlace.coordinates[1]}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/[0.07] px-4 py-2.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-300/[0.12]"
                >
                  <Navigation size={14} />
                  Get directions
                  <ArrowUpRight size={13} />
                </a>
              </div>
            )}
          </section>
        </div>

        <p className="mt-5 text-center text-[10px] leading-5 text-slate-600">
          OpenStreetMap data may be incomplete or outdated. Confirm opening
          hours and essential services before relying on them. Directions open
          in Google Maps.
        </p>
      </main>
    </div>
  );
}
