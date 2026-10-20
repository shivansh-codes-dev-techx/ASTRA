import { useEffect, useRef } from "react";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RoutePlan } from "@/lib/astra";

type RiskMapSegment = {
  latitude: number;
  longitude: number;
  label: string;
  score: number;
  level: string;
  factors: string[];
};

type Props = { plan: RoutePlan | null; className?: string; riskSegments?: RiskMapSegment[] };

export function RouteMap({ plan, className = "", riskSegments = [] }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const planRef = useRef(plan);
  const riskRef = useRef(riskSegments);
  planRef.current = plan;
  riskRef.current = riskSegments;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initial = planRef.current;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: true,
    }).setView(
      initial ? [initial.origin.latitude, initial.origin.longitude] : [27.72, 85.32],
      initial ? 8 : 5,
    );
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(map);
    L.control.zoom({ position: "topright" }).addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    if (initial) drawRoute(map, routeLayerRef.current, initial, riskRef.current);
    return () => {
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const routeLayer = routeLayerRef.current;
    if (!map || !routeLayer) return;
    routeLayer.clearLayers();
    if (!plan) {
      map.setView([27.72, 85.32], 5, { animate: false });
      return;
    }
    drawRoute(map, routeLayer, plan, riskSegments);
  }, [plan, riskSegments]);

  return (
    <div
      className={`astra-map ${className}`}
      aria-label={plan ? `Map showing route from ${plan.origin.name} to ${plan.destination.name}${riskSegments.length ? " with analysed checkpoints" : ""}` : "Interactive map. Choose route locations to display a driving route."}
      role="region"
    >
      <div className="astra-map-canvas" ref={containerRef} />
    </div>
  );
}

function drawRoute(map: L.Map, routeLayer: L.LayerGroup, plan: RoutePlan, riskSegments: RiskMapSegment[]) {
  const coordinates = plan.geometry.coordinates.map(([longitude, latitude]) => L.latLng(latitude, longitude));
  if (!coordinates.length) return;
  L.polyline(coordinates, {
    color: "#0878dc",
    weight: 5,
    opacity: 0.92,
    lineCap: "round",
    lineJoin: "round",
  }).addTo(routeLayer);
  L.circleMarker(coordinates[0], {
    radius: 7, color: "#ffffff", weight: 3, fillColor: "#14527b", fillOpacity: 1,
  }).bindPopup(`<strong>Start</strong><br>${escapeHtml(plan.origin.name)}`).addTo(routeLayer);
  L.circleMarker(coordinates[coordinates.length - 1], {
    radius: 7, color: "#ffffff", weight: 3, fillColor: "#0878dc", fillOpacity: 1,
  }).bindPopup(`<strong>Destination</strong><br>${escapeHtml(plan.destination.name)}`).addTo(routeLayer);

  riskSegments.forEach((segment) => {
    const color = segment.level.toUpperCase() === "LOW" ? "#16a34a" : segment.level.toUpperCase() === "MODERATE" ? "#d97706" : "#dc2626";
    const marker = L.circleMarker([segment.latitude, segment.longitude], {
      radius: 9, color: "#ffffff", weight: 3, fillColor: color, fillOpacity: 0.96,
    });
    const factors = segment.factors.length ? `<ul>${segment.factors.map((factor) => `<li>${escapeHtml(factor)}</li>`).join("")}</ul>` : "<p>No factors listed by the model.</p>";
    marker.bindPopup(`<strong>${escapeHtml(segment.label)}</strong><br>Model score: ${segment.score}/100 (${escapeHtml(segment.level)})${factors}`).addTo(routeLayer);
  });

  const bounds = L.latLngBounds(coordinates);
  riskSegments.forEach((segment) => bounds.extend([segment.latitude, segment.longitude]));
  if (bounds.isValid()) map.fitBounds(bounds.pad(0.08), { animate: true, maxZoom: 12 });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}
