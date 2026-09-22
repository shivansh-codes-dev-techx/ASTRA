import { useEffect } from "react";

import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Circle,
    useMap,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

const cityCoordinates = {
    Ghaziabad: [28.6692, 77.4538],
    Delhi: [28.6139, 77.209],
    Noida: [28.5355, 77.391],
    Agra: [27.1767, 78.0081],
};

function MapRecenter({ position }) {
    const map = useMap();

    useEffect(() => {
        map.flyTo(position, 11, {
            duration: 1.2,
        });
    }, [position, map]);

    return null;
}

function MapCard({ location, risk }) {
    const userLocation =
        cityCoordinates[location] || cityCoordinates.Ghaziabad;

    const riskColors = {
        LOW: "#22c55e",
        MODERATE: "#eab308",
        HIGH: "#f97316",
        EXTREME: "#ef4444",
    };

    const riskColor = riskColors[risk?.level] || riskColors.MODERATE;

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
            {/* Map Header */}
            <div className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-sm text-slate-400">
                        Interactive Risk Map
                    </p>

                    <h2 className="mt-1 text-2xl font-bold">
                        {location} Weather Risk
                    </h2>

                    <p className="mt-1 text-sm text-slate-500">
                        Visual representation of the current weather risk zone.
                    </p>
                </div>

                {/* Risk Legend */}
                <div className="flex flex-wrap gap-3 text-xs">
                    <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-green-500" />
                        Low
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-yellow-500" />
                        Moderate
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-orange-500" />
                        High
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-red-500" />
                        Extreme
                    </div>
                </div>
            </div>

            {/* Map */}
            <div className="h-[350px] sm:h-[400px] lg:h-[450px]">
                <MapContainer
                    center={userLocation}
                    zoom={11}
                    scrollWheelZoom={true}
                    className="h-full w-full"
                >
                    <TileLayer
                        attribution="&copy; OpenStreetMap contributors"
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    <MapRecenter position={userLocation} />

                    {/* User Location */}
                    <Marker position={userLocation}>
                        <Popup>
                            <strong>{location}</strong>
                            <br />
                            Current Risk: {risk?.level || "N/A"}
                            <br />
                            Risk Score: {risk?.score ?? "N/A"}/100
                        </Popup>
                    </Marker>

                    {/* Risk Zone */}
                    <Circle
                        center={userLocation}
                        radius={2500}
                        pathOptions={{
                            color: riskColor,
                            fillColor: riskColor,
                            fillOpacity: 0.2,
                            weight: 2,
                        }}
                    >
                        <Popup>
                            <strong>{location} Risk Zone</strong>
                            <br />
                            Risk Level: {risk?.level || "N/A"}
                            <br />
                            Risk Score: {risk?.score ?? "N/A"}/100
                        </Popup>
                    </Circle>
                </MapContainer>
            </div>
        </div>
    );
}

export default MapCard;