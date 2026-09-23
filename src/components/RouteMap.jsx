import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import { useEffect } from "react";
import "leaflet/dist/leaflet.css";

const startIcon = L.divIcon({
  className: "astra-route-marker",
  html: `<div style="
    width:18px;height:18px;border-radius:9999px;
    background:#22d3ee;border:3px solid white;
    box-shadow:0 0 18px rgba(34,211,238,.9);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

const endIcon = L.divIcon({
  className: "astra-route-marker",
  html: `<div style="
    width:18px;height:18px;border-radius:9999px;
    background:#a78bfa;border:3px solid white;
    box-shadow:0 0 18px rgba(167,139,250,.9);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function FitRoute({ coordinates }) {
  const map = useMap();

  useEffect(() => {
    if (!coordinates?.length) return;

    const bounds = L.latLngBounds(coordinates);

    map.fitBounds(bounds, {
      padding: [70, 70],
      maxZoom: 12,
      animate: true,
    });
  }, [map, coordinates]);

  return null;
}

function RouteMap({ from, to, route }) {
  const fallbackCenter = from || [28.6692, 77.4538];

  const routeCoordinates =
    route?.geometry?.coordinates?.map(
      ([longitude, latitude]) => [latitude, longitude]
    ) || [];

  const allCoordinates = [
    ...(from ? [from] : []),
    ...(to ? [to] : []),
    ...routeCoordinates,
  ];

  return (
    <MapContainer
      center={fallbackCenter}
      zoom={10}
      scrollWheelZoom
      className="h-full min-h-[600px] w-full"
    >
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {routeCoordinates.length > 1 && (
        <>
          <Polyline
            positions={routeCoordinates}
            pathOptions={{
              color: "#22d3ee",
              weight: 10,
              opacity: 0.18,
            }}
          />

          <Polyline
            positions={routeCoordinates}
            pathOptions={{
              color: "#67e8f9",
              weight: 4,
              opacity: 0.95,
            }}
          />
        </>
      )}

      {from && (
        <Marker position={from} icon={startIcon}>
          <Popup>Start location</Popup>
        </Marker>
      )}

      {to && (
        <Marker position={to} icon={endIcon}>
          <Popup>Destination</Popup>
        </Marker>
      )}

      {routeCoordinates.length > 1 && (
        <FitRoute coordinates={allCoordinates} />
      )}
    </MapContainer>
  );
}

export default RouteMap;
