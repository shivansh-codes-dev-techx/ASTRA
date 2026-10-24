export type Location = {
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
};

export type WeatherSnapshot = {
  time: string;
  temperatureC: number;
  humidityPercent: number;
  precipitationMm: number;
  windSpeedKph: number;
  weatherCode: number;
  precipitationProbability?: number;
};

export type BackendRiskResponse = {
  location: {
    latitude: number;
    longitude: number;
  };
  weather: {
    temperature: number;
    humidity: number;
    wind_speed: number;
    rainfall: number;
    rain_probability: number;
  };
  risk: {
    score: number;
    level: "LOW" | "MODERATE" | "HIGH" | "EXTREME";
    factors: string[];
  };
  provider: string;
};

export type RoutePlan = {
  origin: Location;
  destination: Location;
  distanceMeters: number;
  durationSeconds: number;
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
};

export type SavedRide = {
  id: string;
  name: string;
  createdAt: string;
  rideDate?: string;
  plan: RoutePlan;
};

export type RideGroup = {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: string;
  riderNames: string[];
};

export type GeoResult = Location & { id: number };

const GEOCODING_URL =
  "https://geocoding-api.open-meteo.com/v1/search";

const FORECAST_URL =
  "https://api.open-meteo.com/v1/forecast";

const OSRM_URL =
  "https://router.project-osrm.org/route/v1/driving";

const configuredApiUrl = import.meta.env.VITE_ASTRA_API_URL?.trim();

function getProductionApiUrl(value: string | undefined): string {
  if (!value) {
    throw new Error(
      "Production requires VITE_ASTRA_API_URL=/api. Set this in the Vercel frontend build environment to use the same-origin Render API proxy.",
    );
  }

  if (value.replace(/\/+$/, "") !== "/api") {
    throw new Error(
      "Production VITE_ASTRA_API_URL must be /api so browser requests use the same-origin Vercel proxy to the HTTPS backend.",
    );
  }

  return "/api";
}

// Keep the API host consistent with the browser's login cookie host.
// If a local .env file still specifies 127.0.0.1, normalize it to localhost.
export const ASTRA_API_URL = import.meta.env.PROD
  ? getProductionApiUrl(configuredApiUrl)
  : (configuredApiUrl || "http://localhost:8000")
      .replace("://127.0.0.1", "://localhost")
      .replace(/\/+$/, "");

export type OfficialAlert = {
  title?: string;
  headline?: string;
  event?: string;
  area_description?: string;
  description?: string;
  sent?: string;
  effective?: string;
  expires?: string;
  detail_status?: string;
  verification_status:
    | "details_pending"
    | "official_cap_current"
    | "expired_or_inactive"
    | "activity_unknown";
  is_active: boolean | null;
};

export type OfficialAlertsResponse = {
  source: string;
  provider: string;
  source_status: string;
  checked_at: string | null;
  cache_age_seconds: number | null;
  count: number;
  error: string | null;
  alerts: OfficialAlert[];
};

export async function fetchOfficialAlerts(
  signal?: AbortSignal,
): Promise<OfficialAlertsResponse> {
  const response = await fetch(`${ASTRA_API_URL}/official-alerts`, {
    signal,
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Official alerts request failed (${response.status}).`);
  }

  return response.json() as Promise<OfficialAlertsResponse>;
}

export async function searchLocations(
  query: string,
  signal?: AbortSignal,
): Promise<GeoResult[]> {
  const params = new URLSearchParams({
    name: query,
    count: "6",
    language: "en",
    format: "json",
  });

  const response = await fetch(
    `${GEOCODING_URL}?${params}`,
    { signal },
  );

  if (!response.ok) {
    throw new Error("Location search is temporarily unavailable.");
  }

  const result = (await response.json()) as {
    results?: GeoResult[];
  };

  return result.results ?? [];
}

export async function fetchWeather(
  location: Location,
  signal?: AbortSignal,
): Promise<WeatherSnapshot[]> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    hourly:
      "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code,precipitation_probability",
    forecast_days: "2",
    timezone: "auto",
  });

  const response = await fetch(
    `${FORECAST_URL}?${params}`,
    { signal },
  );

  if (!response.ok) {
    throw new Error("Weather service could not return a forecast.");
  }

  const json = (await response.json()) as {
    hourly?: {
      time: string[];
      temperature_2m: number[];
      relative_humidity_2m: number[];
      precipitation: number[];
      wind_speed_10m: number[];
      weather_code: number[];
      precipitation_probability?: number[];
    };
  };

  const hourly = json.hourly;

  if (!hourly) {
    throw new Error("Weather service returned an incomplete forecast.");
  }

  return hourly.time.map((time, index) => ({
    time,
    temperatureC: hourly.temperature_2m[index],
    humidityPercent: hourly.relative_humidity_2m[index],
    precipitationMm: hourly.precipitation[index],
    windSpeedKph: hourly.wind_speed_10m[index],
    weatherCode: hourly.weather_code[index],
    precipitationProbability:
      hourly.precipitation_probability?.[index],
  }));
}

/**
 * Fetches the current weather and experimental risk-model result
 * from the ASTRA FastAPI backend.
 *
 * Configure VITE_ASTRA_API_URL for a deployed backend.
 */
export async function fetchBackendRisk(
  location: Location,
  signal?: AbortSignal,
): Promise<BackendRiskResponse> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
  });

  const response = await fetch(
    `${ASTRA_API_URL}/weather?${params}`,
    {
      signal,
      headers: {
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      response.status === 503
        ? "ASTRA weather service is temporarily unavailable."
        : `ASTRA risk service returned an error (${response.status}).`,
    );
  }

  const data =
    (await response.json()) as BackendRiskResponse;

  if (
    !data.weather ||
    !data.risk ||
    typeof data.risk.score !== "number" ||
    !Array.isArray(data.risk.factors)
  ) {
    throw new Error(
      "ASTRA backend returned an incomplete risk response.",
    );
  }

  return data;
}

export async function fetchRoute(
  origin: Location,
  destination: Location,
  signal?: AbortSignal,
): Promise<RoutePlan> {
  const coords =
    `${origin.longitude},${origin.latitude};` +
    `${destination.longitude},${destination.latitude}`;

  const response = await fetch(
    `${OSRM_URL}/${coords}?overview=full&geometries=geojson`,
    { signal },
  );

  if (!response.ok) {
    throw new Error(
      "The public routing service could not calculate this route.",
    );
  }

  const json = (await response.json()) as {
    code: string;
    routes?: Array<{
      distance: number;
      duration: number;
      geometry: RoutePlan["geometry"];
    }>;
  };

  const route = json.routes?.[0];

  if (json.code !== "Ok" || !route) {
    throw new Error(
      "No driving route was found between those locations.",
    );
  }

  return {
    origin,
    destination,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    geometry: route.geometry,
  };
}

export function formatDistance(meters: number): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km`
    : `${Math.round(meters)} m`;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  return hours
    ? `${hours} hr ${minutes} min`
    : `${minutes} min`;
}

export function describeWeather(code: number): string {
  if (code === 0) return "Clear sky";
  if ([1, 2].includes(code)) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if ([45, 48].includes(code)) return "Fog";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67].includes(code)) return "Rain";
  if ([71, 73, 75, 77].includes(code)) return "Snow";
  if ([80, 81, 82].includes(code)) return "Rain showers";
  if ([85, 86].includes(code)) return "Snow showers";
  if ([95, 96, 99].includes(code)) return "Thunderstorm";

  return "Conditions not described";
}

const RIDES_KEY = "astra:saved-rides:v1";
const GROUP_KEY = "astra:ride-groups:v1";
const ACTIVE_KEY = "astra:active-ride:v1";

function readList<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);

    if (!raw) return [];

    const value: unknown = JSON.parse(raw);

    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export const getSavedRides = (): SavedRide[] =>
  readList<SavedRide>(RIDES_KEY);

export const getRideGroups = (): RideGroup[] =>
  readList<RideGroup>(GROUP_KEY);

export const getActiveRide = (): RoutePlan | null => {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY);

    return raw ? (JSON.parse(raw) as RoutePlan) : null;
  } catch {
    return null;
  }
};

export function saveRide(ride: SavedRide): SavedRide[] {
  const rides = [
    ride,
    ...getSavedRides().filter((item) => item.id !== ride.id),
  ];

  localStorage.setItem(RIDES_KEY, JSON.stringify(rides));

  return rides;
}

export function deleteRide(id: string): SavedRide[] {
  const rides = getSavedRides().filter((ride) => ride.id !== id);

  localStorage.setItem(RIDES_KEY, JSON.stringify(rides));

  return rides;
}

export function setActiveRide(plan: RoutePlan): void {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(plan));
}

export function saveGroup(group: RideGroup): RideGroup[] {
  const groups = [
    group,
    ...getRideGroups().filter((item) => item.id !== group.id),
  ];

  localStorage.setItem(GROUP_KEY, JSON.stringify(groups));

  return groups;
}

export function deleteGroup(id: string): RideGroup[] {
  const groups = getRideGroups().filter((group) => group.id !== id);

  localStorage.setItem(GROUP_KEY, JSON.stringify(groups));

  return groups;
}

/** Account-based Saved Rides API. Existing localStorage helpers remain unchanged. */

export async function fetchAccountRides(): Promise<SavedRide[]> {
  const response = await fetch(`${ASTRA_API_URL}/rides`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  });

  if (response.status === 401) {
    throw new Error("Please log in to view your account rides.");
  }

  if (!response.ok) {
    throw new Error(`Could not load account rides (${response.status}).`);
  }

  const data = (await response.json()) as { rides: SavedRide[] };
  return data.rides;
}

export async function saveAccountRide(
  ride: SavedRide,
): Promise<void> {
  const response = await fetch(`${ASTRA_API_URL}/rides`, {
    method: "POST",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(ride),
  });

  if (response.status === 401) {
    throw new Error("Please log in before saving a ride.");
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      data?.detail || `Could not save ride (${response.status}).`,
    );
  }
}

export async function deleteAccountRide(id: string): Promise<void> {
  const response = await fetch(
    `${ASTRA_API_URL}/rides/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    },
  );

  if (response.status === 401) {
    throw new Error("Please log in to delete an account ride.");
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      data?.detail || `Could not delete ride (${response.status}).`,
    );
  }
}
