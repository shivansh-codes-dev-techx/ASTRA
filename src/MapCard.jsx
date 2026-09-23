import { useEffect, useState } from "react";
import L from "leaflet";

import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Circle,
    Polyline,
    useMap,
} from "react-leaflet";

import "leaflet/dist/leaflet.css";


/* ============================================================
   ASTRA LOCATION MARKER
============================================================ */

const astraLocationIcon = L.divIcon({
    className: "astra-location-marker",
    html: `
        <div style="
            position: relative;
            width: 34px;
            height: 42px;
            display: flex;
            align-items: center;
            justify-content: center;
        ">
            <div style="
                position: absolute;
                width: 34px;
                height: 34px;
                border-radius: 50% 50% 50% 0;
                background: linear-gradient(135deg, #22d3ee, #8b5cf6);
                transform: rotate(-45deg);
                box-shadow:
                    0 0 18px rgba(34, 211, 238, 0.65),
                    0 0 30px rgba(139, 92, 246, 0.35);
            "></div>

            <div style="
                position: relative;
                z-index: 2;
                width: 11px;
                height: 11px;
                border-radius: 50%;
                background: white;
                box-shadow: 0 0 8px rgba(255,255,255,0.9);
            "></div>
        </div>
    `,
    iconSize: [34, 42],
    iconAnchor: [17, 42],
    popupAnchor: [0, -42],
});

/* ============================================================
   CITY COORDINATES
============================================================ */

const cityCoordinates = {
    Ghaziabad: [28.6692, 77.4538],
    Delhi: [28.6139, 77.209],
    Noida: [28.5355, 77.391],
    Agra: [27.1767, 78.0081],
};

/* ============================================================
   POPULAR RIDER ROUTES
============================================================ */

const routes = [
    {
        id: "delhi-leh",
        name: "Delhi → Leh → Ladakh",
        distance: "1,050 km",
        duration: "22–24 hrs riding",

        stops: [
            "Delhi",
            "Manali",
            "Sissu",
            "Jispa",
            "Sarchu",
            "Leh",
            "Ladakh",
        ],

        coordinates: [
            [28.6139, 77.209],
            [28.4595, 77.0266],
            [30.901, 76.9182],
            [31.1048, 77.1734],
            [31.9584, 77.1101],
            [32.738, 77.546],
            [34.1526, 77.5771],
        ],
    },

    {
        id: "delhi-manali",
        name: "Delhi → Manali",
        distance: "540 km",
        duration: "12–14 hrs riding",

        stops: [
            "Delhi",
            "Chandigarh",
            "Bilaspur",
            "Mandi",
            "Kullu",
            "Manali",
        ],

        coordinates: [
            [28.6139, 77.209],
            [30.7333, 76.7794],
            [31.529, 76.532],
            [31.5892, 76.9182],
            [32.2396, 77.1887],
            [32.2432, 77.1892],
        ],
    },

    {
        id: "delhi-spiti",
        name: "Delhi → Spiti Valley",
        distance: "750 km",
        duration: "18–20 hrs riding",

        stops: [
            "Delhi",
            "Shimla",
            "Narkanda",
            "Kinnaur",
            "Nako",
            "Tabo",
            "Kaza",
        ],

        coordinates: [
            [28.6139, 77.209],
            [30.726, 77.148],
            [31.256, 77.463],
            [31.593, 78.098],
            [31.883, 78.416],
            [32.1, 78.383],
            [32.227, 78.071],
        ],
    },

    {
        id: "delhi-srinagar-leh",
        name: "Delhi → Srinagar → Leh",
        distance: "1,100 km",
        duration: "24–26 hrs riding",

        stops: [
            "Delhi",
            "Amritsar",
            "Jammu",
            "Srinagar",
            "Sonamarg",
            "Kargil",
            "Leh",
        ],

        coordinates: [
            [28.6139, 77.209],
            [31.634, 74.8723],
            [32.7266, 74.857],
            [34.0837, 74.7973],
            [34.3029, 75.2937],
            [34.561, 76.126],
            [34.1526, 77.5771],
        ],
    },

    {
        id: "delhi-badrinath",
        name: "Delhi → Rishikesh → Badrinath → Mana",
        distance: "550 km",
        duration: "14–16 hrs riding",

        stops: [
            "Delhi",
            "Haridwar",
            "Rishikesh",
            "Devprayag",
            "Joshimath",
            "Badrinath",
            "Mana",
        ],

        coordinates: [
            [28.6139, 77.209],
            [29.9457, 78.1642],
            [30.0869, 78.2676],
            [30.1467, 78.5976],
            [30.5536, 79.5644],
            [30.7433, 79.4938],
            [30.7733, 79.491],
        ],
    },
];

/* ============================================================
   MAP RECENTER
============================================================ */

function MapRecenter({ position }) {
    const map = useMap();

    useEffect(() => {
        if (!position) return;

        map.flyTo(position, 11, {
            duration: 1.2,
        });
    }, [position, map]);

    return null;
}

/* ============================================================
   ROUTE FIT
============================================================ */

function RouteFitBounds({ coordinates }) {
    const map = useMap();

    useEffect(() => {
        if (!coordinates?.length) {
            return;
        }

        map.fitBounds(coordinates, {
            padding: [40, 40],
        });
    }, [coordinates, map]);

    return null;
}

/* ============================================================
   MAP CARD
============================================================ */

function MapCard({
  location,
  risk,
  coordinates,
}) {
    const userLocation =
  coordinates ||
  cityCoordinates[location] ||
  cityCoordinates.Ghaziabad;
    const [selectedRoute, setSelectedRoute] =
        useState(routes[0]);

    /* ============================================================
       RISK COLORS
    ============================================================ */

    const riskColors = {
        LOW: "#22c55e",
        MODERATE: "#eab308",
        HIGH: "#f97316",
        EXTREME: "#ef4444",
    };

    const normalizedScore = Math.max(
        0,
        Math.min(100, Number(risk?.score ?? 0))
    );

    const riskColor =
        riskColors[risk?.level] ||
        riskColors.MODERATE;

    const riskDescription = {
        LOW: "Environmental conditions are currently within the lower-risk range.",
        MODERATE: "Changing environmental conditions are being monitored.",
        HIGH: "Elevated environmental risk is currently detected.",
        EXTREME: "Severe environmental conditions are currently detected.",
    }[risk?.level] || "Waiting for live risk assessment.";

    /* ============================================================
       ROUTE CHANGE
    ============================================================ */

    const handleRouteChange = (event) => {
        const route = routes.find(
            (item) =>
                item.id === event.target.value
        );

        if (route) {
            setSelectedRoute(route);
        }
    };

    return (
        <div className="glass glass-hover overflow-hidden rounded-3xl">

            {/* ======================================================
          HEADER
      ====================================================== */}

            <div className="p-5 sm:p-6">

                <div className="flex flex-col gap-5">

                    <div>

                        <div className="flex items-center gap-2">

                            <span className="rounded-lg bg-violet-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
                                Rider Intelligence
                            </span>

                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50" />

                            <span className="text-[10px] text-emerald-400">
                                LIVE
                            </span>

                        </div>

                        <h2 className="mt-3 text-xl font-bold sm:text-2xl">
                            Interactive Risk & Rider Map
                        </h2>

                        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
                            Explore popular long-distance motorcycle
                            routes and monitor weather risk along your
                            journey.
                        </p>

                    </div>

                    {/* ==================================================
              ROUTE SELECTOR
          ================================================== */}

                    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">

                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

                            <div>

                                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                                    🏍️ Rider Route
                                </p>

                                <p className="mt-1 text-sm font-semibold text-slate-200">
                                    Select a route to explore
                                </p>

                            </div>

                            <select
                                value={selectedRoute.id}
                                onChange={handleRouteChange}
                                className="w-full rounded-xl border border-white/10 bg-[#121026] px-4 py-3 text-sm text-white outline-none transition focus:border-violet-500 lg:w-auto lg:min-w-[330px]"
                            >

                                {routes.map((route) => (
                                    <option
                                        key={route.id}
                                        value={route.id}
                                    >
                                        {route.name}
                                    </option>
                                ))}

                            </select>

                        </div>

                        {/* ==================================================
                ROUTE INFORMATION
            ================================================== */}

                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">

                            <div className="rounded-xl border border-cyan-500/10 bg-cyan-500/5 p-4">

                                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                                    Route Distance
                                </p>

                                <p className="mt-2 text-xl font-bold text-cyan-300">
                                    {selectedRoute.distance}
                                </p>

                            </div>

                            <div className="rounded-xl border border-violet-500/10 bg-violet-500/5 p-4">

                                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                                    Estimated Riding Time
                                </p>

                                <p className="mt-2 text-xl font-bold text-violet-300">
                                    {selectedRoute.duration}
                                </p>

                            </div>

                        </div>

                        {/* ==================================================
                ROUTE STOPS
            ================================================== */}

                        <div className="mt-5">

                            <div className="mb-3 flex items-center justify-between">

                                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                                    Route Stops
                                </p>

                                <span className="text-[10px] text-slate-600">
                                    {selectedRoute.stops.length} stops
                                </span>

                            </div>

                            <div className="flex flex-wrap gap-2">

                                {selectedRoute.stops.map(
                                    (stop, index) => (
                                        <div
                                            key={stop}
                                            className="flex items-center gap-2 rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs text-slate-300"
                                        >

                                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-500/15 text-[9px] text-violet-300">
                                                {index + 1}
                                            </span>

                                            {stop}

                                        </div>
                                    )
                                )}

                            </div>

                        </div>

                    </div>

                    {/* ==================================================
              RISK LEGEND
          ================================================== */}

                    <div className="flex flex-wrap gap-4">

                        <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
                            Low
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                            Moderate
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span className="h-2.5 w-2.5 rounded-full bg-orange-400" />
                            High
                        </div>

                        <div className="flex items-center gap-2 text-xs text-slate-400">
                            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                            Extreme
                        </div>

                    </div>

                </div>

            </div>

            {/* ======================================================
          MAP
      ====================================================== */}

            <div className="h-[350px] sm:h-[400px] lg:h-[450px]">

                <MapContainer
                    center={userLocation}
                    zoom={6}
                    scrollWheelZoom={true}
                    className="h-full w-full"
                >

                    <TileLayer
                        attribution="&copy; OpenStreetMap contributors"
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {/* LIVE RISK STATUS */}
                    <div
                        className="pointer-events-none absolute left-4 top-4 z-[1000] w-[240px] rounded-2xl border border-white/10 bg-black/70 p-4 shadow-2xl backdrop-blur-xl"
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[9px] uppercase tracking-[0.25em] text-slate-500">
                                    Live Risk
                                </p>
                                <p
                                    className="mt-1 text-sm font-bold"
                                    style={{ color: riskColor }}
                                >
                                    {risk?.level || "LOADING"}
                                </p>
                            </div>

                            <div className="text-right">
                                <p
                                    className="text-3xl font-black"
                                    style={{ color: riskColor }}
                                >
                                    {risk?.score ?? "--"}
                                </p>
                                <p className="text-[9px] text-slate-500">/ 100</p>
                            </div>
                        </div>

                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{
                                    width: `${normalizedScore}%`,
                                    backgroundColor: riskColor,
                                }}
                            />
                        </div>

                        <p className="mt-3 text-[10px] leading-4 text-slate-400">
                            {riskDescription}
                        </p>
                    </div>

                    {/* Current location */}

                    <MapRecenter
                        position={userLocation}
                    />

                    {/* Selected route */}

                    <RouteFitBounds
                        coordinates={
                            selectedRoute.coordinates
                        }
                    />

                    {/* ==================================================
              CURRENT LOCATION MARKER
          ================================================== */}

                    <Marker
                        position={userLocation}
                        icon={astraLocationIcon}
                    >

                        <Popup>

                            <strong>{location}</strong>

                            <br />

                            Current Risk:{" "}
                            {risk?.level || "N/A"}

                            <br />

                            Risk Score:{" "}
                            {risk?.score ?? "N/A"}/100

                        </Popup>

                    </Marker>

                    {/* ==================================================
              RISK ZONE
          ================================================== */}

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

                            <strong>
                                {location} Risk Zone
                            </strong>

                            <br />

                            Risk Level:{" "}
                            {risk?.level || "N/A"}

                            <br />

                            Risk Score:{" "}
                            {risk?.score ?? "N/A"}/100

                        </Popup>

                    </Circle>

                    {/* ==================================================
              RIDER ROUTE
          ================================================== */}

                    <Polyline
                        positions={
                            selectedRoute.coordinates
                        }
                        pathOptions={{
                            color: "#8b5cf6",
                            weight: 5,
                            opacity: 0.9,
                            lineCap: "round",
                            lineJoin: "round",
                        }}
                    >

                        <Popup>

                            <strong>
                                🏍️ {selectedRoute.name}
                            </strong>

                            <br />

                            Distance:{" "}
                            {selectedRoute.distance}

                            <br />

                            Estimated Time:{" "}
                            {selectedRoute.duration}

                        </Popup>

                    </Polyline>

                    {/* ==================================================
              ROUTE STOP MARKERS
          ================================================== */}

                    {selectedRoute.coordinates.map(
                        (coordinate, index) => (

                            <Marker
                                key={`${selectedRoute.id}-${index}`}
                                position={coordinate}
                                icon={astraLocationIcon}
                            >

                                <Popup>

                                    <strong>
                                        🏍️{" "}
                                        {selectedRoute.stops[index]}
                                    </strong>

                                    <br />

                                    Route Stop {index + 1}

                                    <br />

                                    {selectedRoute.name}

                                </Popup>

                            </Marker>

                        )
                    )}

                </MapContainer>

            </div>

            {/* LIVE RISK FACTORS */}
            {risk?.factors?.length > 0 && (
                <div className="border-t border-white/5 bg-black/20 px-4 py-4 sm:px-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <p className="text-[9px] uppercase tracking-[0.25em] text-slate-500">
                                Current Risk Contributors
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                                Reported by the ASTRA risk engine for {location}.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {risk.factors.map((factor, index) => (
                                <span
                                    key={`${factor}-${index}`}
                                    className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px] text-slate-300"
                                >
                                    {factor}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ======================================================
          ROUTE FOOTER
      ====================================================== */}

            <div className="border-t border-white/5 bg-black/10 p-4">

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

                    <div>

                        <p className="text-sm font-semibold text-white">
                            🏍️ {selectedRoute.name}
                        </p>

                        <p className="mt-1 text-xs text-slate-500">
                            Route visualization for ASTRA rider
                            weather awareness.
                        </p>

                    </div>

                    <div className="flex flex-wrap gap-2">

                        <span className="rounded-lg bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-300">
                            📍 {selectedRoute.distance}
                        </span>

                        <span className="rounded-lg bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-300">
                            ⏱️ {selectedRoute.duration}
                        </span>

                    </div>

                </div>

            </div>

        </div>
    );
}

export default MapCard;