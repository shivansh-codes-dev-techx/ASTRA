const ROUTE_API =
  "https://router.project-osrm.org/route/v1/driving";

export async function getRoute(
  fromLatitude,
  fromLongitude,
  toLatitude,
  toLongitude
) {
  const url =
    `${ROUTE_API}/${fromLongitude},${fromLatitude};` +
    `${toLongitude},${toLatitude}` +
    `?overview=full&geometries=geojson&steps=true`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Route service failed with status ${response.status}`
    );
  }

  const data = await response.json();

  if (data.code !== "Ok" || !data.routes?.length) {
    throw new Error("No drivable route was found.");
  }

  const route = data.routes[0];

  return {
    distanceKm: route.distance / 1000,
    durationMinutes: route.duration / 60,
    geometry: route.geometry,
    steps: route.legs?.[0]?.steps || [],
  };
}
