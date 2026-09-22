import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Circle,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";

function MapCard() {
    const userLocation = [28.6692, 77.4538];

    const riskZones = [
        {
            name: "High Risk Zone",
            position: [28.6692, 77.4538],
            radius: 2500,
            color: "#f97316",
            score: 78,
            level: "HIGH",
        },
        {
            name: "Moderate Risk Zone",
            position: [28.6900, 77.4200],
            radius: 1800,
            color: "#eab308",
            score: 54,
            level: "MODERATE",
        },
        {
            name: "Low Risk Zone",
            position: [28.6400, 77.4900],
            radius: 1500,
            color: "#22c55e",
            score: 28,
            level: "LOW",
        },
    ];

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">

            {/* Map Header */}
            <div className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">

                <div>
                    <p className="text-sm text-slate-400">
                        Interactive Risk Map
                    </p>

                    <h2 className="mt-1 text-2xl font-bold">
                        Local Weather Risk
                    </h2>
                </div>

                {/* Legend */}
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

                </div>
            </div>

            {/* Map */}
            <div className="h-[450px]">

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

                    {/* User Location */}
                    <Marker position={userLocation}>
                        <Popup>
                            <strong>Your Location</strong>
                            <br />
                            Ghaziabad
                            <br />
                            Current Risk: HIGH
                            <br />
                            Risk Score: 78
                        </Popup>
                    </Marker>

                    {/* Risk Zones */}
                    {riskZones.map((zone) => (
                        <Circle
                            key={zone.name}
                            center={zone.position}
                            radius={zone.radius}
                            pathOptions={{
                                color: zone.color,
                                fillColor: zone.color,
                                fillOpacity: 0.2,
                            }}
                        >
                            <Popup>
                                <strong>{zone.name}</strong>
                                <br />
                                Risk Level: {zone.level}
                                <br />
                                Risk Score: {zone.score}
                            </Popup>
                        </Circle>
                    ))}

                </MapContainer>

            </div>
        </div>
    );
}

export default MapCard;