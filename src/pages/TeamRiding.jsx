import { useEffect, useMemo, useState } from "react";
import {
  Bike,
  CalendarDays,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

const RIDES_STORAGE_KEY = "astra-team-riding-rides";
const REQUESTS_STORAGE_KEY = "astra-team-riding-requests";

function readStoredArray(key) {
  if (typeof window === "undefined") return [];

  try {
    const stored = window.localStorage.getItem(key);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const inputClass =
  "mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/50";

function Field({ label, children }) {
  return (
    <label className="block text-sm text-slate-300">
      {label}
      {children}
    </label>
  );
}

function RideCard({ ride, onJoin, onDetails, onManage }) {
  return (
    <article className="group rounded-2xl border border-white/10 bg-white/[0.035] p-5 transition duration-300 hover:border-cyan-300/25 hover:bg-white/[0.055]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/10 p-3 text-cyan-200">
            <Bike size={21} />
          </div>
          <div>
            <h3 className="font-semibold text-white">{ride.name}</h3>
            <p className="mt-1 text-xs text-slate-400">
              Organised by {ride.organiser}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs text-emerald-200">
          {ride.status}
        </span>
      </div>

      <div className="my-5 grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-2 text-sm text-slate-300">
          <MapPin size={16} className="mt-0.5 shrink-0 text-cyan-200" />
          <span>{ride.from} <span className="text-slate-500">→</span> {ride.to}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <CalendarDays size={16} className="text-cyan-200" />
          {ride.date}
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Clock3 size={16} className="text-cyan-200" />
          {ride.time}
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Users size={16} className="text-cyan-200" />
          {ride.members}/{ride.capacity} riders
        </div>
      </div>

      <p className="mb-5 text-sm leading-6 text-slate-400">{ride.description}</p>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-4">
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          {ride.privacy === "Private" ? <LockKeyhole size={14} /> : <Users size={14} />}
          {ride.privacy} ride
        </span>
        <button
          type="button"
          disabled={ride.joined || ride.members >= ride.capacity}
          onClick={() => onJoin(ride.id)}
          className="rounded-xl border border-cyan-200/20 bg-cyan-200/10 px-4 py-2.5 text-sm font-medium text-cyan-100 transition hover:bg-cyan-200/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {ride.joined ? "Request submitted" : ride.members >= ride.capacity ? "Ride full" : "Request to join"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => onDetails(ride)}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5">
          View details
        </button>
        {ride.organiser === "You" && (
          <button type="button" onClick={() => onManage(ride)}
            className="rounded-lg border border-violet-200/20 bg-violet-200/[0.06] px-3 py-2 text-xs text-violet-100 hover:bg-violet-200/10">
            Manage requests
          </button>
        )}
      </div>
      {ride.joined && (
        <p className="mt-3 flex items-center gap-2 text-xs text-amber-200">
          <Clock3 size={14} /> Demo request recorded in this page only; organiser approval is not connected yet.
        </p>
      )}
    </article>
  );
}

export default function TeamRiding() {
  const [rides, setRides] = useState(() => readStoredArray(RIDES_STORAGE_KEY));
  const [activeTab, setActiveTab] = useState("discover");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState("");
  const [detailRide, setDetailRide] = useState(null);
  const [manageRide, setManageRide] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [pendingRequests, setPendingRequests] = useState(() =>
    readStoredArray(REQUESTS_STORAGE_KEY)
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(RIDES_STORAGE_KEY, JSON.stringify(rides));
    } catch {
      // Browser storage may be unavailable or full.
    }
  }, [rides]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        REQUESTS_STORAGE_KEY,
        JSON.stringify(pendingRequests)
      );
    } catch {
      // Browser storage may be unavailable or full.
    }
  }, [pendingRequests]);
  const [form, setForm] = useState({
    name: "",
    from: "",
    to: "",
    date: "",
    time: "06:30",
    capacity: "6",
    privacy: "Public",
    description: "",
  });

  const visibleRides = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rides.filter((ride) => {
      const matchesSearch = [ride.name, ride.from, ride.to, ride.organiser]
        .some((value) => value.toLowerCase().includes(query));
      const matchesTab =
        activeTab === "discover"
          ? ride.privacy === "Public"
          : activeTab === "mine"
            ? ride.joined || ride.organiser === "You"
            : ride.organiser === "You" &&
              pendingRequests.some((request) =>
                request.rideId === ride.id && request.status === "Pending"
              );
      return matchesSearch && matchesTab;
    });
  }, [rides, search, activeTab, pendingRequests]);

  function updateForm(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function createRide(event) {
    event.preventDefault();
    const ride = {
      ...form,
      id: Date.now(),
      organiser: "You",
      members: 1,
      capacity: Number(form.capacity),
      status: "Upcoming",
      joined: true,
      inviteCode: form.privacy === "Private"
        ? `ASTRA-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
        : "",
    };
    setRides((current) => [ride, ...current]);
    setActiveTab("mine");
    setShowCreate(false);
    setNotice(
      form.privacy === "Private"
        ? "Demo ride created locally. Private invite sharing needs backend support."
        : "Demo ride created locally. It is visible in this page only."
    );
    setForm({
      name: "",
      from: "",
      to: "",
      date: "",
      time: "06:30",
      capacity: "6",
      privacy: "Public",
      description: "",
    });
  }

  function requestJoin(id) {
    const ride = rides.find((item) => item.id === id);
    if (!ride) return;

    if (ride.organiser === "You") {
      setNotice("This is your ride. Another rider must join through the backend once it is connected.");
      return;
    }

    setNotice(
      "Join requests are not connected to a backend yet. No request was sent, and your membership status was not changed."
    );
  }

  function joinByInvite(event) {
    event.preventDefault();
    const code = inviteCodeInput.trim().toUpperCase();
    const target = rides.find(
      (ride) => ride.privacy === "Private" && ride.inviteCode === code
    );

    if (!target) {
      setNotice("No matching private ride was found in this page's local demo data.");
      return;
    }

    setRides((current) =>
      current.map((ride) => ride.id === target.id
        ? { ...ride, joined: true }
        : ride)
    );
    setShowInvite(false);
    setInviteCodeInput("");
    setActiveTab("mine");
    setNotice("Private demo ride opened locally. No server access check was performed.");
  }

  function updateRequest(requestId, status) {
    setPendingRequests((current) =>
      current.map((request) =>
        request.id === requestId ? { ...request, status } : request
      )
    );
    setNotice(`Demo request ${status.toLowerCase()} locally. No rider was notified.`);
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-900/50 p-6 shadow-2xl shadow-cyan-950/10 backdrop-blur-2xl sm:p-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-200/15 bg-cyan-200/[0.07] px-3 py-1.5 text-xs text-cyan-100">
              <Users size={14} /> Ride together, ride prepared
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Team <span className="text-cyan-200">Riding</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
              Find riding companions, plan a shared route, and keep ride details in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setNotice(""); setShowInvite(true); }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm font-medium text-white transition hover:bg-white/[0.08]"
            >
              <LockKeyhole size={16} /> Join by invite
            </button>
            <button
              type="button"
              onClick={() => { setNotice(""); setShowCreate(true); }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-200 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-100"
            >
              <Plus size={18} /> Create a ride
            </button>
          </div>
        </div>

        <div className="relative mt-7 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs text-slate-400">Discover</p>
            <p className="mt-1 text-xl font-semibold">{rides.filter((ride) => ride.privacy === "Public").length}</p>
            <p className="mt-1 text-xs text-slate-500">Public rides loaded</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs text-slate-400">Your activity</p>
            <p className="mt-1 text-xl font-semibold">{rides.filter((ride) => ride.joined || ride.organiser === "You").length}</p>
            <p className="mt-1 text-xs text-slate-500">Local prototype entries</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs text-slate-400">Ride status</p>
            <p className="mt-1 flex items-center gap-2 text-base font-semibold">
              <span className="h-2 w-2 rounded-full bg-amber-300" /> Upcoming
            </p>
            <p className="mt-1 text-xs text-slate-500">Live tracking is not active</p>
          </div>
        </div>
      </section>

      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200/15 bg-amber-200/[0.05] p-4 text-sm leading-6 text-amber-100/90">
        <ShieldCheck size={19} className="mt-0.5 shrink-0" />
        <p><strong>Prototype mode:</strong> displayed rides are sample data. Rides and request decisions are saved in this browser only. Cross-device sharing, secure invitations, server-backed organiser approvals, and live tracking require backend integration.</p>
      </div>

      {notice && (
        <div role="status" className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-cyan-200/15 bg-cyan-200/[0.06] p-4 text-sm text-cyan-100">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="Dismiss message"><X size={16} /></button>
        </div>
      )}

      <section className="mt-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 rounded-xl border border-white/10 bg-black/20 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("discover")}
              className={`rounded-lg px-4 py-2.5 text-sm transition ${activeTab === "discover" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
            >Discover rides</button>
            <button
              type="button"
              onClick={() => setActiveTab("mine")}
              className={`rounded-lg px-4 py-2.5 text-sm transition ${activeTab === "mine" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
            >My rides</button>
            <button
              type="button"
              onClick={() => setActiveTab("requests")}
              className={`rounded-lg px-4 py-2.5 text-sm transition ${activeTab === "requests" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}
            >Requests</button>
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3">
            <Search size={17} className="text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search routes or rides..."
              className="w-full bg-transparent py-3 text-sm text-white outline-none placeholder:text-slate-500 sm:w-64"
            />
          </label>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {visibleRides.map((ride) => (
            <RideCard
              key={ride.id}
              ride={ride}
              onJoin={requestJoin}
              onDetails={setDetailRide}
              onManage={setManageRide}
            />
          ))}
        </div>
        {visibleRides.length === 0 && (
          <div className="mt-5 rounded-2xl border border-dashed border-white/15 px-5 py-12 text-center">
            <Bike size={28} className="mx-auto text-slate-500" />
            <h2 className="mt-3 font-medium text-white">No rides found</h2>
            <p className="mt-1 text-sm text-slate-400">Try another search or create a ride to get started.</p>
          </div>
        )}
      </section>

      {detailRide && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-md"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailRide(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="ride-details-title"
            className="my-auto w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-cyan-200">Ride details</p>
                <h2 id="ride-details-title" className="mt-2 text-xl font-semibold">{detailRide.name}</h2>
              </div>
              <button type="button" onClick={() => setDetailRide(null)} aria-label="Close ride details"
                className="rounded-lg p-2 text-slate-400 hover:bg-white/10"><X size={18} /></button>
            </div>
            <div className="mt-5 space-y-3 text-sm text-slate-300">
              <p><span className="text-slate-500">Route:</span> {detailRide.from} → {detailRide.to}</p>
              <p><span className="text-slate-500">Departure:</span> {detailRide.date} at {detailRide.time}</p>
              <p><span className="text-slate-500">Organiser:</span> {detailRide.organiser}</p>
              <p><span className="text-slate-500">Riders:</span> {detailRide.members}/{detailRide.capacity}</p>
              <p><span className="text-slate-500">Visibility:</span> {detailRide.privacy}</p>
              <p className="leading-6 text-slate-400">{detailRide.description || "No extra ride notes provided."}</p>
              {detailRide.privacy === "Private" && detailRide.organiser === "You" && detailRide.inviteCode && (
                <div className="rounded-xl border border-violet-200/15 bg-violet-200/[0.06] p-4">
                  <p className="text-xs text-violet-200">Local demo invite code</p>
                  <p className="mt-1 font-mono text-lg font-semibold tracking-wider text-white">{detailRide.inviteCode}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">This code is stored in this browser only. It is not secure and cannot be used to find rides on other devices.</p>
                </div>
              )}
              <div className="rounded-xl border border-amber-200/15 bg-amber-200/[0.05] p-3 text-xs leading-5 text-amber-100">
                Upcoming only. Live tracking and verified rider details are not connected.
              </div>
            </div>
            <button type="button" onClick={() => setDetailRide(null)}
              className="mt-6 w-full rounded-xl border border-white/10 px-4 py-3 text-sm text-white hover:bg-white/5">Close details</button>
          </section>
        </div>
      )}

      {manageRide && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-md"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setManageRide(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="manage-requests-title"
            className="my-auto w-full max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-violet-200">Organiser tools · Demo</p>
                <h2 id="manage-requests-title" className="mt-2 text-xl font-semibold">Join requests</h2>
                <p className="mt-1 text-sm text-slate-400">{manageRide.name}</p>
              </div>
              <button type="button" onClick={() => setManageRide(null)} aria-label="Close requests"
                className="rounded-lg p-2 text-slate-400 hover:bg-white/10"><X size={18} /></button>
            </div>
            <div className="mt-5 space-y-3">
              {pendingRequests.filter((request) => request.rideId === manageRide.id).map((request) => (
                <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div>
                    <p className="text-sm font-medium">{request.name}</p>
                    <p className={`mt-1 text-xs ${request.status === "Pending" ? "text-amber-200" : request.status === "Approved" ? "text-emerald-200" : "text-rose-200"}`}>
                      {request.status}
                    </p>
                  </div>
                  {request.status === "Pending" && (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => updateRequest(request.id, "Approved")}
                        className="rounded-lg border border-emerald-200/20 bg-emerald-200/10 px-3 py-2 text-xs text-emerald-100">Approve</button>
                      <button type="button" onClick={() => updateRequest(request.id, "Declined")}
                        className="rounded-lg border border-rose-200/20 bg-rose-200/10 px-3 py-2 text-xs text-rose-100">Decline</button>
                    </div>
                  )}
                </div>
              ))}
              {!pendingRequests.some((request) => request.rideId === manageRide.id) && (
                <p className="rounded-xl border border-dashed border-white/15 p-6 text-center text-sm text-slate-400">No join requests are available. Server-backed requests are not connected.</p>
              )}
            </div>
            <p className="mt-4 text-xs leading-5 text-amber-100/80">Join requests are not connected to a server. No actual users are notified or approved from this prototype.</p>
            <button type="button" onClick={() => setManageRide(null)}
              className="mt-5 w-full rounded-xl border border-white/10 px-4 py-3 text-sm text-white hover:bg-white/5">Done</button>
          </section>
        </div>
      )}

      {showInvite && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setShowInvite(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="invite-title"
            className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="invite-title" className="text-xl font-semibold">Join a private ride</h2>
                <p className="mt-1 text-sm text-slate-400">Enter a code from a private ride organiser.</p>
              </div>
              <button type="button" onClick={() => setShowInvite(false)} aria-label="Close invite dialog"
                className="rounded-lg p-2 text-slate-400 hover:bg-white/10"><X size={18} /></button>
            </div>
            <form onSubmit={joinByInvite} className="mt-5">
              <label className="block text-sm text-slate-300">Invite code
                <input required value={inviteCodeInput} onChange={(event) => setInviteCodeInput(event.target.value)}
                  className={inputClass} placeholder="ASTRA-XXXXX" autoComplete="off" />
              </label>
              <p className="mt-3 text-xs leading-5 text-amber-100/80">Prototype only: codes are checked against rides saved in this browser, not a server.</p>
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => setShowInvite(false)}
                  className="rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-300">Cancel</button>
                <button type="submit" className="rounded-xl bg-cyan-200 px-5 py-3 text-sm font-semibold text-slate-950">Check code</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {showCreate && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-md"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="create-ride-title" className="my-auto w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="create-ride-title" className="text-xl font-semibold">Create a ride</h2>
                <p className="mt-1 text-sm text-slate-400">Add the essentials for your group ride.</p>
              </div>
              <button type="button" onClick={() => setShowCreate(false)} aria-label="Close dialog" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X size={19} /></button>
            </div>
            <form onSubmit={createRide} className="mt-6 space-y-4">
              <Field label="Ride name">
                <input required name="name" value={form.name} onChange={updateForm} className={inputClass} placeholder="e.g. Sunday morning ride" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Starting point">
                  <input required name="from" value={form.from} onChange={updateForm} className={inputClass} placeholder="City or meeting point" />
                </Field>
                <Field label="Destination">
                  <input required name="to" value={form.to} onChange={updateForm} className={inputClass} placeholder="Where are you going?" />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date">
                  <input required type="date" min={new Date().toISOString().slice(0, 10)} name="date" value={form.date} onChange={updateForm} className={inputClass} />
                </Field>
                <Field label="Departure time">
                  <input required type="time" name="time" value={form.time} onChange={updateForm} className={inputClass} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Maximum riders">
                  <select name="capacity" value={form.capacity} onChange={updateForm} className={inputClass}>
                    {[2, 3, 4, 5, 6, 8, 10, 12, 15, 20].map((count) => <option key={count} value={count}>{count} riders</option>)}
                  </select>
                </Field>
                <Field label="Visibility">
                  <select name="privacy" value={form.privacy} onChange={updateForm} className={inputClass}>
                    <option>Public</option>
                    <option>Private</option>
                  </select>
                </Field>
              </div>
              <Field label="Ride notes (optional)">
                <textarea name="description" value={form.description} onChange={updateForm} rows={3} maxLength={400} className={inputClass} placeholder="Meeting point, planned stops, or other details..." />
              </Field>
              {form.privacy === "Private" && (
                <p className="rounded-xl border border-violet-200/15 bg-violet-200/[0.06] p-3 text-xs leading-5 text-violet-100">
                  Private visibility is a prototype setting only. Secure invite codes and access control need backend support.
                </p>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-300 hover:bg-white/5">Cancel</button>
                <button type="submit" className="rounded-xl bg-cyan-200 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-100">
                  <span className="inline-flex items-center gap-2"><CheckCircle2 size={16} /> Create local ride</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
