import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function MapCard() {
  const position = [28.6692, 77.4538]; // Ghaziabad

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="p-6">
        <p className="text-sm text-slate-400">
          Interactive Risk Map
        </p>

        <h2 className="mt-1 text-2xl font-bold">
          Local Weather Risk
        </h2>
      </div>

      <div className="h-[400px]">
        <MapContainer
          center={position}
          zoom={11}
          scrollWheelZoom={true}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <Marker position={position}>
            <Popup>
              <strong>Ghaziabad</strong>
              <br />
              Current Risk: HIGH
              <br />
              Risk Score: 78
            </Popup>
          </Marker>
        </MapContainer>
      </div>
    </div>
  );
}

export default MapCard;