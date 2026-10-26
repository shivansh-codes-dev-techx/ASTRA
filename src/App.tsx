
import AuthPage from "./pages/AuthPage";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Route, Switch, useLocation, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  AlertTriangle, ArrowDownRight, ArrowRight, Bike, Bell, Check, ChevronDown, ChevronRight, CircleHelp,
  CloudSun, Compass, Copy, Crosshair, HeartPulse, MapPin, Mountain, Plus, RefreshCw, Route as RouteIcon,
  Save, Search, ShieldAlert, Trash2, UsersRound, Wind, X,
} from "lucide-react";
import { Form } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import {
  describeWeather, fetchBackendRisk, fetchRoute, fetchWeather, formatDistance,
  formatDuration, getActiveRide, getSavedRides,
  fetchAccountRides, saveAccountRide, deleteAccountRide,
  searchLocations, setActiveRide, fetchOfficialAlerts, ASTRA_API_URL, type OfficialAlert,
  type GeoResult, type Location, type RoutePlan, type SavedRide,
  type BackendRiskResponse, type WeatherSnapshot,
} from "@/lib/astra";
import NotFound from "@/pages/not-found";
import "./astra.css";

const RouteMap = lazy(() =>
  import("@/components/RouteMap").then(({ RouteMap: MapView }) => ({ default: MapView })),
);

const AUTH_API_BASE = ASTRA_API_URL;
const TEAM_API_BASE = AUTH_API_BASE;

type TeamRide = {
  id: number;
  name: string;
  origin: string;
  destination: string;
  route_display: string;
  departure_at: string;
  pace: string;
  meeting_point: string;
  notes: string;
  visibility: "public" | "private";
  max_riders: number;
  member_count: number;
  vacancies: number;
  start_latitude: number | null;
  start_longitude: number | null;
  created_at: string;
  invite_code?: string | null;
  is_member?: boolean;
  is_creator?: boolean;
  members?: { id: number; email: string; joined_at: string }[];
};

async function teamApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${TEAM_API_BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.detail || `Team Riding request failed (${response.status}).`);
  return payload as T;
}

function formatDeparture(value: string) {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}


type AuthUser = { id: number; email: string; name?: string | null };
type Notification = {
  id: number;
  title: string;
  message: string;
  notification_type: string;
  target_url: string;
  related_ride_id: number | null;
  is_read: number;
  created_at: string;
};
type NavEntry = { path: string; label: string; icon: typeof Compass };
const navItems: NavEntry[] = [
  { path: "/", label: "Dashboard", icon: Compass },
  { path: "/route-planner", label: "Route planner", icon: RouteIcon },
  { path: "/weather-alerts", label: "Weather & alerts", icon: CloudSun },
  { path: "/team-riding", label: "Team riding", icon: UsersRound },
  { path: "/my-rides", label: "My rides", icon: Bike },
  { path: "/ai-assistant", label: "AI assistant", icon: CircleHelp },
];
const queryClient = new QueryClient();

type RouteAnalysisPoint = {
  id: number;
  fraction: number;
  label: string;
  latitude: number;
  longitude: number;
  response: BackendRiskResponse;
};

type RouteAnalysisReport = {
  points: RouteAnalysisPoint[];
  score: number;
  level: string;
  checkedCount: number;
  totalCount: number;
  createdAt: string;
};

function haversineMeters(a: [number, number], b: [number, number]) {
  const toRad = (value: number) => value * Math.PI / 180;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function sampleRouteCheckpoints(plan: RoutePlan) {
  const coordinates = plan.geometry.coordinates;
  if (!coordinates.length) throw new Error("This route has no road geometry to analyse.");
  if (coordinates.length === 1) {
    return [{ fraction: 0, label: "Route start", coordinate: coordinates[0] }];
  }
  const cumulative = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulative.push(cumulative[index - 1] + haversineMeters(coordinates[index - 1], coordinates[index]));
  }
  const total = cumulative[cumulative.length - 1] || plan.distanceMeters || 1;
  const targets = [
    { fraction: 0, label: "Start" },
    { fraction: 0.25, label: "25% of route" },
    { fraction: 0.5, label: "Mid-route" },
    { fraction: 0.75, label: "75% of route" },
    { fraction: 1, label: "Destination" },
  ];
  const used = new Set<number>();
  return targets.map((target) => {
    const targetMeters = total * target.fraction;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    cumulative.forEach((distance, index) => {
      const delta = Math.abs(distance - targetMeters);
      if (delta < bestDistance && !used.has(index)) { bestDistance = delta; bestIndex = index; }
    });
    used.add(bestIndex);
    return { ...target, coordinate: coordinates[bestIndex] };
  });
}

function riskTone(level: string): "neutral" | "warning" | "ok" {
  return level.toUpperCase() === "LOW" ? "ok" : level.toUpperCase() === "MODERATE" ? "neutral" : "warning";
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (degrees: number) => degrees * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function locationLabel(location: Location) {
  return [location.name, location.admin1, location.country].filter(Boolean).join(", ");
}

function LocationPicker({ id, label, value, onChange, placeholder }: {
  id: string;
  label: string;
  value: Location | null;
  onChange: (location: Location | null) => void;
  placeholder: string;
}) {
  const [text, setText] = useState(value ? locationLabel(value) : "");
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (value) setText(locationLabel(value));
  }, [value]);

  useEffect(() => {
    const query = text.trim();
    if (value || query.length < 2) {
      setResults([]);
      setError("");
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        setResults(await searchLocations(query, controller.signal));
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Location search failed.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 320);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text, value]);

  return (
    <div className="astra-field location-field">
      <label htmlFor={id}>{label}</label>
      <div className="location-input-wrap">
        <MapPin size={15} aria-hidden="true" />
        <input
          id={id}
          data-testid={`input-${id}`}
          value={text}
          placeholder={placeholder}
          autoComplete="off"
          aria-autocomplete="list"
          aria-controls={`${id}-results`}
          aria-expanded={results.length > 0}
          onChange={(event) => { setText(event.target.value); onChange(null); }}
        />
        {value && <button className="icon-button field-clear" type="button" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => { onChange(null); setText(""); }}><X size={14} /></button>}
      </div>
      {loading && <p className="field-hint" role="status">Searching Open-Meteo locations…</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      {results.length > 0 && (
        <ul className="location-results" id={`${id}-results`} role="listbox" aria-label={`${label} suggestions`}>
          {results.map((result) => (
            <li key={result.id}>
              <button type="button" role="option" onClick={() => { onChange(result); setText(locationLabel(result)); setResults([]); }}>
                <MapPin size={14} aria-hidden="true" />
                <span><strong>{result.name}</strong><small>{[result.admin1, result.country].filter(Boolean).join(", ")}</small></span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && !error && text.trim().length >= 2 && !value && results.length === 0 && <p className="field-hint">No matching places yet. Try a nearby city or region.</p>}
    </div>
  );
}

function App() {
  const [path] = useLocation();

  useEffect(() => {
    const isLoginPage = window.location.pathname.replace(/\/+$/, "") === "/login";
    const selector = 'meta[name="robots"][data-astra-login-robots]';
    const existing = document.head.querySelector(selector);

    if (isLoginPage) {
      const robots = existing ?? document.createElement("meta");
      robots.setAttribute("name", "robots");
      robots.setAttribute("content", "noindex, nofollow");
      robots.setAttribute("data-astra-login-robots", "true");
      if (!existing) document.head.appendChild(robots);
    } else {
      existing?.remove();
    }
  }, [path]);

  if (path.replace(/\/+$/, "") === "/login") {
    return <AuthPage />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <RoutedErrorBoundary>
    <div className="astra-app">
      <img className="astra-landscape" src="/images/himalayan-road.png" alt="" aria-hidden="true" />
      <div className="astra-veil" aria-hidden="true" />
      <div className="astra-shell">
        <Header />
        <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/route-planner" component={RoutePlannerPage} />
          <Route path="/weather-alerts" component={WeatherPage} />
          <Route path="/team-riding" component={TeamRidingPage} />
          <Route path="/my-rides" component={MyRidesPage} />
          <Route path="/ai-assistant" component={AssistantPage} />
          <Route component={NotFound} />
        </Switch>
        <ServiceNotice />
      </div>
      <BottomNav />
      <ScrollHighway />
    </div>
          </RoutedErrorBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function ScrollHighway() {
  const [bikeTop, setBikeTop] = useState(72);

  useEffect(() => {
    let frame = 0;
    const updatePosition = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const progress = Math.min(1, Math.max(0, window.scrollY / maxScroll));
        const trackHeight = Math.max(180, window.innerHeight - 150);
        setBikeTop(72 + progress * trackHeight);
      });
    };
    updatePosition();
    window.addEventListener("scroll", updatePosition, { passive: true });
    window.addEventListener("resize", updatePosition);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updatePosition);
      window.removeEventListener("resize", updatePosition);
    };
  }, []);

  return (
    <aside className="scroll-highway" aria-label="Decorative highway with a bike following page scroll" aria-hidden="true">
      <div className="scroll-highway-road">
        <span className="scroll-road-edge scroll-road-edge-left" />
        <span className="scroll-road-edge scroll-road-edge-right" />
        <span className="scroll-road-centerline" />
        <span className="scroll-road-glow" />
      </div>
      <div className="scroll-highway-bike" style={{ top: `${bikeTop}px` }}>
        <span className="scroll-bike-aura" />
        <Bike size={25} strokeWidth={2.5} />
      </div>
    </aside>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function Header() {
  const [path, setLocation] = useLocation();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsError, setNotificationsError] = useState("");
  const [clearingNotifications, setClearingNotifications] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [logoutError, setLogoutError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const searchForm = useForm<{ search: string }>({ defaultValues: { search: "" } });
  const search = searchForm.watch("search");
  const matches = navItems.filter((item) => `${item.label} ${item.path}`.toLowerCase().includes(search.trim().toLowerCase()));
    useEffect(() => {
    if (!authUser) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    const controller = new AbortController();

    fetch(`${AUTH_API_BASE}/notifications`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not load notifications.");
        }
        return response.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unread_count ?? 0);
        setNotificationsError("");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setNotificationsError(
          error instanceof Error ? error.message : "Could not load notifications.",
        );
      });

    return () => controller.abort();
  }, [authUser]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${AUTH_API_BASE}/auth/me`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = await response.json();
        return data.user as AuthUser;
      })
      .then((user) => { if (!controller.signal.aborted) setAuthUser(user); })
      .catch(() => { if (!controller.signal.aborted) setAuthUser(null); })
      .finally(() => { if (!controller.signal.aborted) setAuthLoading(false); });
    return () => controller.abort();
  }, []);

  async function handleLogout() {
    setLogoutError("");
    try {
      const response = await fetch(`${AUTH_API_BASE}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Logout failed. Please try again.");
      setAuthUser(null);
      setProfileOpen(false);
      window.location.assign("/login");
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Could not log out.");
    }
  }

  async function clearNotifications() {
    if (!notifications.length || clearingNotifications) return;
    if (!window.confirm("Clear all notifications? This cannot be undone.")) return;

    setClearingNotifications(true);
    setNotificationsError("");
    try {
      const response = await fetch(`${AUTH_API_BASE}/notifications`, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || "Could not clear notifications.");
      }
      setNotifications([]);
      setUnreadCount(0);
    } catch (error) {
      setNotificationsError(
        error instanceof Error ? error.message : "Could not clear notifications.",
      );
    } finally {
      setClearingNotifications(false);
    }
  }

  const profileName = authUser?.name?.trim() || authUser?.email?.split("@")[0] || "Guest rider";
  const profileLabel = authUser ? profileName.split(/\s+/)[0] : "Guest rider";
  const profileInitials = authUser?.name?.trim()
    ? authUser.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
    : authUser?.email
      ? authUser.email.slice(0, 2).toUpperCase()
      : "?";

  return (
    <header className="astra-header">
      <Link href="/" className="astra-brand" aria-label="ASTRA dashboard">
        <span className="brand-mark"><Mountain size={20} strokeWidth={1.8} /></span><span>ASTRA</span>
      </Link>
      <div className="header-right">
        <Form {...searchForm}>
          <form
            className={`header-search${mobileSearch ? " header-search-open" : ""}`}
            role="search"
            onSubmit={searchForm.handleSubmit(({ search: query }) => {
              if (matches[0] && query.trim()) {
                setLocation(matches[0].path);
                setSearchOpen(false);
                setMobileSearch(false);
                searchForm.reset({ search: "" });
              }
            })}
          >
            <Search size={15} aria-hidden="true" />
            <button className="header-search-toggle" type="button" aria-label={mobileSearch ? "Close section search" : "Open section search"} onClick={() => { setMobileSearch((open) => !open); setSearchOpen(false); }} />
            <label className="sr-only" htmlFor="global-search">Find an ASTRA section</label>
            <input
              id="global-search"
              data-testid="input-global-search"
              placeholder="Find a section"
              autoComplete="off"
              {...searchForm.register("search", {
                onChange: () => setSearchOpen(true),
                onBlur: () => window.setTimeout(() => setSearchOpen(false), 140),
              })}
              onFocus={() => setSearchOpen(true)}
            />
            {searchOpen && search.trim() && <div className="header-search-results" role="listbox" aria-label="ASTRA sections">{matches.length ? matches.map((item) => <Link key={item.path} href={item.path} role="option" onClick={() => { setSearchOpen(false); searchForm.reset({ search: "" }); }}><item.icon size={14} /><span>{item.label}</span></Link>) : <span className="search-no-results">No matching ASTRA section</span>}</div>}
          </form>
        </Form>
        <Link href="/weather-alerts" className={`header-location-pill ${path === "/weather-alerts" ? "is-current" : ""}`} aria-label="Choose location and view weather" data-testid="link-header-location">
          <span className="header-location-icon"><MapPin size={19} fill="currentColor" /></span>
          <span className="header-location-copy"><strong>Ghaziabad, UP</strong><small>28.6692, 77.4538</small></span>
        </Link>
<div className="header-notification-wrap">
  <button
    type="button"
    className={`header-icon-button header-notification-button ${path === "/weather-alerts" ? "is-current" : ""}`}
    aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
    aria-expanded={notificationsOpen}
    data-testid="button-header-notifications"
    onClick={() => setNotificationsOpen((open) => !open)}
  >
    <Bell size={19} />
    {unreadCount > 0 && (
      <span className="header-notification-badge" aria-label={`${unreadCount} unread notifications`}>
        {unreadCount > 99 ? "99+" : unreadCount}
      </span>
    )}
  </button>

  {notificationsOpen && (
    <div className="header-notification-popover" role="dialog" aria-label="Notifications">
      <div className="header-notification-heading">
        <strong>Notifications</strong>
        <div className="header-notification-actions">
          <span>{unreadCount} unread</span>
          <button
            type="button"
            className="notification-clear-button"
            onClick={() => void clearNotifications()}
            disabled={notifications.length === 0 || clearingNotifications}
          >
            <Trash2 size={14} />
            {clearingNotifications ? "Clearing..." : "Clear all"}
          </button>
        </div>
      </div>

      {notificationsError && <p role="alert">{notificationsError}</p>}

      {!notificationsError && notifications.length === 0 && (
        <p className="header-notification-empty">No notifications yet.</p>
      )}

      {notifications.map((notification) => (
        <button
          type="button"
          key={notification.id}
          className={`header-notification-item ${notification.is_read ? "" : "is-unread"}`}
          onClick={async () => {
            try {
              if (!notification.is_read) {
                const response = await fetch(
                  `${AUTH_API_BASE}/notifications/${notification.id}/read`,
                  { method: "POST", credentials: "include" },
                );
                if (!response.ok) throw new Error("Could not mark notification as read.");
                setNotifications((items) =>
                  items.map((item) =>
                    item.id === notification.id ? { ...item, is_read: 1 } : item,
                  ),
                );
                setUnreadCount((count) => Math.max(0, count - 1));
              }
              setNotificationsOpen(false);
              setLocation(notification.target_url || "/weather-alerts");
            } catch (error) {
              setNotificationsError(
                error instanceof Error ? error.message : "Could not open notification.",
              );
            }
          }}
        >
          <strong>{notification.title}</strong>
          <span>{notification.message}</span>
          <small>{new Date(notification.created_at).toLocaleString()}</small>
        </button>
      ))}
    </div>
  )}
</div>
        <div className="header-profile-wrap">
          {authUser ? (
            <>
              <button className="header-profile-button" type="button" aria-label="Open account menu" aria-expanded={profileOpen} data-testid="button-header-profile" onClick={() => setProfileOpen((open) => !open)}>
                <span className="header-profile-initials">{profileInitials}</span>
                <span className="header-profile-name">{profileLabel}</span>
                <ChevronDown size={16} className={`header-profile-chevron${profileOpen ? " is-open" : ""}`} />
              </button>
              {profileOpen && (
                <div className="header-profile-popover" role="status">
                  <strong className="profile-display-name">{profileName}</strong>
                  <span className="profile-email">{authUser.email}</span>
                  <p style={{ margin: "6px 0 10px" }}>You are signed in to ASTRA.</p>
                  {logoutError && <p role="alert" style={{ margin: "0 0 8px" }}>{logoutError}</p>}
                  <button type="button" className="icon-button" onClick={handleLogout} data-testid="button-logout">Log out</button>
                </div>
              )}
            </>
          ) : (
            <Link href="/login" className="header-profile-button" data-testid="link-header-login">
              <span className="header-profile-initials">?</span>
              <span className="header-profile-name">{authLoading ? "Checking account…" : "Log in"}</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function PageHeading({ eyebrow, title, description, icon: Icon }: { eyebrow: string; title: ReactNode; description: string; icon: typeof Compass }) {
  return <div className="page-heading"><p className="eyebrow"><span className="eyebrow-rule" />{eyebrow}</p><div className="heading-row"><div><h1>{title}</h1><p className="page-description">{description}</p></div><span className="heading-emblem"><Icon size={22} /></span></div></div>;
}

function Panel({ children, className = "", title, kicker }: { children: ReactNode; className?: string; title?: string; kicker?: string }) {
  return <section className={`glass-panel ${className}`}>{(title || kicker) && <div className="panel-heading">{kicker && <p className="section-kicker">{kicker}</p>}{title && <h2>{title}</h2>}</div>}{children}</section>;
}

function StatusTag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "warning" | "ok" }) {
  return <span className={`status-tag status-${tone}`}><span className="status-dot" />{children}</span>;
}

function DashboardPage() {
  const [dashboardUser, setDashboardUser] = useState<AuthUser | null>(null);
  const [authAction, setAuthAction] = useState<string | null>(null);
  const [recent, setRecent] = useState(() => getSavedRides().slice(0, 2));
  const [plan, setPlan] = useState<RoutePlan | null>(() => getActiveRide());
  const [origin, setOrigin] = useState<Location | null>(() => getActiveRide()?.origin ?? null);
  const [destination, setDestination] = useState<Location | null>(() => getActiveRide()?.destination ?? null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [routeNotice, setRouteNotice] = useState("");
  const routeForm = useForm<{ rideDate: string }>({ defaultValues: { rideDate: "" } });
  const [weatherLocation, setWeatherLocation] = useState<Location | null>(() => getActiveRide()?.origin ?? { name: "Ghaziabad", latitude: 28.6692, longitude: 77.4538, admin1: "Uttar Pradesh", country: "India" });
  const [weatherForecast, setWeatherForecast] = useState<WeatherSnapshot[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState("");
  const [backendRisk, setBackendRisk] = useState<BackendRiskResponse | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState("");
  const [rideLocationMode, setRideLocationMode] = useState<"manual" | "gps">("manual");
  const [rideLocation, setRideLocation] = useState<Location | null>(() => ({ name: "Ghaziabad", latitude: 28.6692, longitude: 77.4538, admin1: "Uttar Pradesh", country: "India" }));
  const [rideRadius, setRideRadius] = useState(50);
  const [locationStatus, setLocationStatus] = useState("Choose Ghaziabad or another place to find nearby rides.");
  const [locationLoading, setLocationLoading] = useState(false);
  const [publicGroups, setPublicGroups] = useState<TeamRide[]>([]);
  const [publicGroupsError, setPublicGroupsError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    try {
      const action = window.sessionStorage.getItem("astra_auth_action");
      if (action) {
        setAuthAction(action);
        window.sessionStorage.removeItem("astra_auth_action");
      }
    } catch (_) {}

    fetch(`${AUTH_API_BASE}/auth/me`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = await response.json();
        return data.user as AuthUser;
      })
      .then((user) => {
        if (!controller.signal.aborted) setDashboardUser(user);
      })
      .catch(() => {
        if (!controller.signal.aborted) setDashboardUser(null);
      });

    return () => controller.abort();
  }, []);

  const dashboardDisplayName =
    dashboardUser?.name?.trim() ||
    dashboardUser?.email?.split("@")[0] ||
    "Rider";
  const dashboardFirstName = dashboardDisplayName.split(/\s+/)[0];
  const dashboardGreeting =
    authAction === "signup" ? "Welcome" : "Welcome back";

  function useCurrentRideLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("This browser does not support GPS. Choose a location manually.");
      return;
    }
    setLocationLoading(true);
    setLocationStatus("Requesting your location…");
    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude } = position.coords;
      setRideLocation({ name: "Your current location", latitude, longitude, admin1: "GPS location", country: "" });
      setRideLocationMode("gps");
      setLocationStatus("Using your current GPS location. Your exact location is not shown to other riders.");
      setLocationLoading(false);
    }, (error) => {
      setLocationStatus(error.code === error.PERMISSION_DENIED ? "Location permission was denied. Select a place manually instead." : "Could not get your location. Try again or choose a place manually.");
      setLocationLoading(false);
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
  }

  useEffect(() => {
    const controller = new AbortController();
    teamApi<{ rides: TeamRide[] }>("/team-rides", { signal: controller.signal })
      .then((data) => { setPublicGroups(data.rides); setPublicGroupsError(""); })
      .catch((caught) => { if (!controller.signal.aborted) setPublicGroupsError(caught instanceof Error ? caught.message : "Could not load public rides."); });
    return () => controller.abort();
  }, []);

  const nearbyPublicGroups = useMemo(() => {
    const openGroups = publicGroups.filter((group) => group.vacancies > 0);

    if (!rideLocation || typeof rideLocation.latitude !== "number" || typeof rideLocation.longitude !== "number") {
      return openGroups.map((group) => ({ ...group, nearbyDistance: null as number | null }));
    }

    const withCoordinates = openGroups
      .filter((group) => group.start_latitude != null && group.start_longitude != null)
      .map((group) => ({
        ...group,
        nearbyDistance: distanceKm(rideLocation.latitude, rideLocation.longitude, group.start_latitude!, group.start_longitude!),
      }))
      .filter((group) => group.nearbyDistance <= rideRadius)
      .sort((a, b) => a.nearbyDistance - b.nearbyDistance);

    const withoutCoordinates = openGroups
      .filter((group) => group.start_latitude == null || group.start_longitude == null)
      .map((group) => ({ ...group, nearbyDistance: null as number | null }));

    return [...withCoordinates, ...withoutCoordinates];
  }, [rideLocation, rideRadius, publicGroups]);

  useEffect(() => {
    if (!weatherLocation) {
      setWeatherForecast([]);
      setWeatherError("");
      setWeatherLoading(false);
      return;
    }
    const controller = new AbortController();
    setWeatherForecast([]);
    setWeatherError("");
    setWeatherLoading(true);
    fetchWeather(weatherLocation, controller.signal)
      .then(setWeatherForecast)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setWeatherError(caught instanceof Error ? caught.message : "Weather could not be loaded.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setWeatherLoading(false);
      });
    return () => controller.abort();
  }, [weatherLocation]);

  useEffect(() => {
    if (!weatherLocation) {
      setBackendRisk(null);
      setRiskError("");
      setRiskLoading(false);
      return;
    }
    const controller = new AbortController();
    setBackendRisk(null);
    setRiskError("");
    setRiskLoading(true);
    fetchBackendRisk(weatherLocation, controller.signal)
      .then(setBackendRisk)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setBackendRisk(null);
          setRiskError(caught instanceof Error ? caught.message : "Risk estimate could not be loaded.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setRiskLoading(false);
      });
    return () => controller.abort();
  }, [weatherLocation]);

  const currentWeather = useMemo(() => {
    const now = Date.now();
    return weatherForecast.find((item) => new Date(item.time).getTime() >= now - 60 * 60 * 1000) ?? weatherForecast[0];
  }, [weatherForecast]);

  async function planRide() {
    setRouteError("");
    setRouteNotice("");
    if (!origin || !destination) {
      setRouteError("Choose a matched starting point and destination before calculating a route.");
      return;
    }
    setRouteLoading(true);
    try {
      const route = await fetchRoute(origin, destination);
      setPlan(route);
      setActiveRide(route);
      setWeatherLocation(origin);
      setRouteNotice("Route returned by OSRM. Driving directions are not motorcycle-specific.");
    } catch (caught) {
      setRouteError(caught instanceof Error ? caught.message : "Unable to calculate this route.");
      setPlan(null);
    } finally {
      setRouteLoading(false);
    }
  }

  async function saveDashboardRide() {
    if (!plan) return;
    const ride: SavedRide = {
      id: `ride-${Date.now().toString(36)}`,
      name: `${plan.origin.name} to ${plan.destination.name}`,
      createdAt: new Date().toISOString(),
      rideDate: routeForm.getValues("rideDate") || undefined,
      plan,
    };
    setRouteNotice("Saving ride to your account…");
    try {
      await saveAccountRide(ride);
      setRecent((current) => [ride, ...current.filter((item) => item.id !== ride.id)].slice(0, 2));
      setRouteNotice("Ride saved to your ASTRA account.");
    } catch (caught) {
      setRouteNotice(caught instanceof Error ? caught.message : "Could not save ride. Please log in and try again.");
    }
  }

  return (
    <main className="page dashboard-page">
      <section className="dashboard-intro dashboard-welcome">
        <PageHeading eyebrow="YOUR ASTRA DASHBOARD" title={<>{dashboardGreeting}, {dashboardFirstName}!</>} description="Ready for your next ride? Check the weather, understand the experimental risk estimate, and find riders heading your way." icon={Mountain} />
        <p className="hero-note"><span className="hero-note-line" />Ride prepared. Stay aware. Make every journey count.</p>
      </section>
      <div className="dashboard-rail">
        <div className="dashboard-status-grid">
          <Panel className="status-panel">
            <div className="status-panel-head">
              <span className="status-title"><CloudSun size={17} />Current weather</span>
              <StatusTag tone={currentWeather ? "ok" : "neutral"}>{weatherLoading ? "Loading" : currentWeather ? "Forecast loaded" : weatherError ? "Unavailable" : "Choose location"}</StatusTag>
            </div>
            {weatherLoading && <p className="status-copy" role="status" data-testid="status-dashboard-weather-loading">Loading Open-Meteo forecast…</p>}
            {weatherError && <div className="inline-alert alert-error dashboard-weather-error" role="alert" data-testid="status-dashboard-weather-error">{weatherError}<button className="text-button" type="button" onClick={() => setWeatherLocation(weatherLocation ? { ...weatherLocation } : null)}>Retry</button></div>}
            {currentWeather && !weatherLoading && <div className="dashboard-weather-content" aria-live="polite" data-testid="status-dashboard-weather">
              <div className="dashboard-weather-lead"><strong>{Math.round(currentWeather.temperatureC)}°C</strong><span>{describeWeather(currentWeather.weatherCode)}</span></div>
              <div className="dashboard-weather-stats">
                <span><small>Humidity</small><strong>{currentWeather.humidityPercent}%</strong></span>
                <span><small>Wind</small><strong>{currentWeather.windSpeedKph} km/h</strong></span>
                <span><small>Rainfall</small><strong>{currentWeather.precipitationMm} mm</strong></span>
                <span><small>Rain chance</small><strong>{currentWeather.precipitationProbability == null ? "—" : `${currentWeather.precipitationProbability}%`}</strong></span>
              </div>
              <p className="status-copy">Forecast for {locationLabel(weatherLocation!)} · weather only, not a road-risk assessment.</p>
            </div>}
            {!weatherLocation && !weatherLoading && <p className="status-copy">Weather details are available on the Weather & Alerts page.</p>}
            <div className="dashboard-other-weather"><span>Want weather for another location?</span><Link href="/weather-alerts" className="text-link">Weather & Alerts <ArrowRight size={14} /></Link></div>
          </Panel>
          <Panel className="status-panel risk-panel">
            <div className="status-panel-head"><span className="status-title"><HeartPulse size={17} />Experimental risk estimate</span><StatusTag tone={backendRisk ? (backendRisk.risk.level === "LOW" ? "ok" : "warning") : "warning"}>{riskLoading ? "Loading" : backendRisk ? backendRisk.risk.level : "Unavailable"}</StatusTag></div>
            {riskLoading && <p className="status-copy" role="status">Loading experimental estimate from ASTRA backend…</p>}
            {riskError && <div className="inline-alert alert-error" role="alert">{riskError}<button className="text-button" type="button" onClick={() => setWeatherLocation(weatherLocation ? { ...weatherLocation } : null)}>Retry</button></div>}
            {backendRisk && !riskLoading && <>
  <div className={`risk-gauge-layout risk-level-${String(backendRisk.risk.level).toLowerCase()}`}>
    <div
      className="risk-gauge"
      role="progressbar"
      aria-label="Experimental risk score"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.max(0, Math.min(100, backendRisk.risk.score))}
      aria-valuetext={`${backendRisk.risk.score} out of 100, ${backendRisk.risk.level} risk`}
    >
      <svg className="risk-gauge-svg" viewBox="0 0 120 120" aria-hidden="true">
        <circle className="risk-gauge-track" cx="60" cy="60" r="49" />
        <circle
          className="risk-gauge-value"
          cx="60"
          cy="60"
          r="49"
          style={{ strokeDashoffset: `${308.08 * (1 - Math.max(0, Math.min(100, backendRisk.risk.score)) / 100)}` }}
        />
      </svg>
      <div className="risk-gauge-center">
        <strong>{backendRisk.risk.score}</strong>
        <span>of 100</span>
      </div>
    </div>

    <div className="risk-gauge-summary">
      <span className="risk-gauge-eyebrow">Current estimate</span>
      <strong className="risk-gauge-level">{backendRisk.risk.level}</strong>
      <p>Experimental model output</p>
      <small>Provider: {backendRisk.provider}</small>
    </div>
  </div>

  <div className="risk-factors-box">
    <strong className="risk-factors-heading">Model-reported factors</strong>
    {backendRisk.risk.factors.length > 0 ? (
      <ul className="risk-factor-list">
        {backendRisk.risk.factors.map((factor) => (
          <li key={factor}>{factor}</li>
        ))}
      </ul>
    ) : (
      <p className="status-copy">
        The model returned no listed risk factors.
      </p>
    )}
  </div>
</>}
            {!weatherLocation && !riskLoading && <p className="risk-notice"><ShieldAlert size={19} />Choose a location to request an experimental estimate.</p>}
            <p className="status-copy">Experimental model output only—not a validated road-safety rating or a guarantee that a route is safe. Road alerts are not connected.</p>
          </Panel>
        </div>
        <Panel className="public-rides-panel" kicker="Find your crew" title="Nearby public rides & open seats">
          <div className="public-rides-intro"><div><p>Choose your location to discover public ride groups starting within your search radius. Select a group to view details and join.</p><span className="demo-live-pill"><span />Live public groups · distance-filtered</span></div><Link href="/team-riding" className="text-link">Open Team Riding <ArrowRight size={15} /></Link></div>
          {publicGroupsError && <p className="field-error" role="alert">{publicGroupsError}</p>}
          <div className="nearby-ride-controls">
            <div className="nearby-location-controls">
              <div className="nearby-mode-switch" role="group" aria-label="Location selection method">
                <button type="button" className={rideLocationMode === "manual" ? "active" : ""} onClick={() => { setRideLocationMode("manual"); setRideLocation(null); setLocationStatus("Search and select a place to find nearby rides."); }}><MapPin size={15} /> Choose place</button>
                <button type="button" className={rideLocationMode === "gps" ? "active" : ""} onClick={useCurrentRideLocation} disabled={locationLoading}><Crosshair size={15} /> {locationLoading ? "Locating…" : "Use GPS"}</button>
              </div>
              {rideLocationMode === "manual" && <LocationPicker id="nearby-ride-location" label="Search starting area" value={rideLocation} onChange={(value) => { setRideLocation(value); setLocationStatus(value ? `Showing rides near ${locationLabel(value)}.` : "Select a suggested place to calculate distances."); }} placeholder="Search Ghaziabad, Delhi, or another place" />}
              {rideLocationMode === "gps" && rideLocation && <div className="nearby-selected-location"><MapPin size={16} /><span><strong>Current GPS location</strong><small>Used only to calculate nearby ride distances</small></span><button type="button" onClick={() => { setRideLocationMode("manual"); setRideLocation(null); setLocationStatus("Search and select a place to find nearby rides."); }}>Change</button></div>}
              <p className="nearby-location-status" role="status">{locationStatus}</p>
            </div>
            <div className="nearby-radius-control"><label htmlFor="nearby-ride-radius">Search radius <strong>{rideRadius} km</strong></label><input id="nearby-ride-radius" type="range" min="5" max="100" step="5" value={rideRadius} onChange={(event) => setRideRadius(Number(event.target.value))} /><div><span>5 km</span><span>50 km default</span><span>100 km</span></div></div>
          </div>
          {!rideLocation && <div className="nearby-empty-state"><MapPin size={24} /><strong>Set your location to see nearby rides</strong><p>Start with Ghaziabad, Uttar Pradesh, or search for another city or locality and select a suggestion.</p></div>}
          {rideLocation && nearbyPublicGroups.length === 0 && <div className="nearby-empty-state"><Search size={24} /><strong>No public rides with open seats within {rideRadius} km</strong><p>Try a larger radius or choose another starting location. Try a larger radius or choose another starting location.</p></div>}
          {rideLocation && nearbyPublicGroups.length > 0 && <div className="public-rides-grid">{nearbyPublicGroups.map((group) => <button key={group.id} type="button" className="public-ride-card" onClick={() => { window.location.href = `/team-riding?publicGroup=${group.id}`; }} aria-label={`View ${group.name} group details`}>
            <div className="public-ride-card-top"><span className="public-ride-route-icon"><Mountain size={17} /></span><span className={`vacancy-chip ${group.vacancies <= 2 ? "vacancy-low" : ""}`}>{group.vacancies} seats open</span></div>
            <h3>{group.name}</h3><p className="public-ride-route">{group.route_display}</p>
            <div className="public-ride-meta"><span><UsersRound size={14} />{group.member_count} riders</span><span><MapPin size={14} />{group.nearbyDistance == null ? "Distance unavailable" : `${Math.round(group.nearbyDistance)} km away`}</span></div>
            <div className="public-ride-footer"><span>{formatDeparture(group.departure_at)}</span><strong>View group <ArrowRight size={14} /></strong></div>
          </button>)}</div>}
          <p className="public-rides-disclaimer"><AlertTriangle size={14} />Nearby distance is calculated from each sample group’s starting coordinates. Listings are fetched from the ASTRA backend. Nearby filtering requires a group starting coordinate.</p>
        </Panel>
      </div>
    </main>
  );
}

function RoutePlannerPage() {
  const [origin, setOrigin] = useState<Location | null>(null);
  const [destination, setDestination] = useState<Location | null>(null);
  const [plan, setPlan] = useState<RoutePlan | null>(() => getActiveRide());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [analysis, setAnalysis] = useState<RouteAnalysisReport | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const analysisAbortRef = useRef<AbortController | null>(null);
  const rideForm = useForm<{ rideDate: string }>({ defaultValues: { rideDate: "" } });
  const [officialAlerts, setOfficialAlerts] = useState<OfficialAlert[]>([]);
  const [officialAlertsLoading, setOfficialAlertsLoading] = useState(false);
  const [officialAlertsError, setOfficialAlertsError] = useState("");
  const [officialAlertsSourceStatus, setOfficialAlertsSourceStatus] = useState("unknown");

useEffect(() => {
  const controller = new AbortController();

  setOfficialAlertsLoading(true);
  setOfficialAlertsError("");

  fetchOfficialAlerts(controller.signal)
    .then((result) => {
      setOfficialAlerts(result.alerts ?? []);
      setOfficialAlertsSourceStatus(result.source_status ?? "unknown");

      if (result.source_status !== "available") {
        setOfficialAlertsError(
          result.error || "The official alerts feed is currently unavailable.",
        );
      }
    })
    .catch((error: unknown) => {
      if (controller.signal.aborted) return;

      setOfficialAlertsError(
        error instanceof Error
          ? error.message
          : "Could not load official disaster alerts.",
      );
      setOfficialAlertsSourceStatus("unavailable");
    })
    .finally(() => {
      if (!controller.signal.aborted) {
        setOfficialAlertsLoading(false);
      }
    });

  return () => controller.abort();
}, []);


  useEffect(() => () => analysisAbortRef.current?.abort(), []);

  async function submit() {
    setError("");
    setNotice("");
    setAnalysis(null);
    setAnalysisError("");
    analysisAbortRef.current?.abort();
    setAnalysisLoading(false);
    if (!origin || !destination) {
      setError("Choose a matched location for both the starting point and destination.");
      return;
    }
    setLoading(true);
    try {
      const result = await fetchRoute(origin, destination);
      setPlan(result);
      setActiveRide(result);
      setNotice("Route calculated. Press Analyse Route when you are ready for the detailed report.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to calculate route.");
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }

  async function analyzeRoute() {
    if (!plan || analysisLoading) return;
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    setAnalysis(null);
    setAnalysisError("");
    setNotice("");
    setAnalysisLoading(true);
    try {
      const checkpoints = sampleRouteCheckpoints(plan);
      const results = await Promise.allSettled(checkpoints.map(async (checkpoint, index) => {
        const [longitude, latitude] = checkpoint.coordinate;
        const location: Location = {
          name: `Route checkpoint ${index + 1}`,
          admin1: checkpoint.label,
          latitude,
          longitude,
          country: plan.origin.country || plan.destination.country,
        };
        const response = await fetchBackendRisk(location, controller.signal);
        return {
          id: index + 1,
          fraction: checkpoint.fraction,
          label: checkpoint.label,
          latitude,
          longitude,
          response,
        } satisfies RouteAnalysisPoint;
      }));
      if (controller.signal.aborted) return;
      const points = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      if (!points.length) {
        const firstFailure = results.find((result) => result.status === "rejected");
        throw new Error(firstFailure?.status === "rejected" && firstFailure.reason instanceof Error
          ? firstFailure.reason.message
          : "No route checkpoints could be analysed. The weather/risk service may be unavailable.");
      }
      const peak = points.reduce((highest, point) => point.response.risk.score > highest.response.risk.score ? point : highest, points[0]);
      setAnalysis({
        points,
        score: peak.response.risk.score,
        level: peak.response.risk.level,
        checkedCount: points.length,
        totalCount: checkpoints.length,
        createdAt: new Date().toISOString(),
      });
      setNotice(points.length === checkpoints.length
        ? "Route analysis completed using the backend's experimental weather-risk model."
        : `Partial analysis: ${points.length} of ${checkpoints.length} checkpoints returned data.`);
    } catch (caught) {
      if (!controller.signal.aborted) {
        setAnalysisError(caught instanceof Error ? caught.message : "Route analysis could not be completed.");
      }
    } finally {
      if (!controller.signal.aborted) setAnalysisLoading(false);
    }
  }

  async function handleSave() {
    if (!plan) return;
    const ride: SavedRide = {
      id: `ride-${Date.now().toString(36)}`,
      name: `${plan.origin.name} to ${plan.destination.name}`,
      createdAt: new Date().toISOString(),
      rideDate: rideForm.getValues("rideDate") || undefined,
      plan,
    };
    setNotice("Saving ride to your account…");
    try {
      await saveAccountRide(ride);
      setNotice("Ride saved to your ASTRA account.");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Could not save ride. Please log in and try again.");
    }
  }

  const mapRiskSegments = useMemo(() => (analysis?.points ?? []).map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
    label: point.label,
    score: point.response.risk.score,
    level: point.response.risk.level,
    factors: point.response.risk.factors,
  })), [analysis]);

  return (
    <main className="page inner-page route-intelligence-page">
      <PageHeading eyebrow="Route planning" title="Find your line." description="Calculate a route first, then run ASTRA Route Intelligence when you are ready." icon={RouteIcon} />
      <div className="planner-grid">
        <Panel className="planner-form-panel" kicker="A route to consider" title="Ride details">
          <Form {...rideForm}>
            <form className="planner-form" onSubmit={rideForm.handleSubmit(() => submit())}>
              <LocationPicker id="ride-origin" label="Starting point" value={origin} onChange={(value) => { setOrigin(value); setAnalysis(null); setAnalysisError(""); analysisAbortRef.current?.abort(); setAnalysisLoading(false); }} placeholder="Search a town or place" />
              <LocationPicker id="ride-destination" label="Destination" value={destination} onChange={(value) => { setDestination(value); setAnalysis(null); setAnalysisError(""); analysisAbortRef.current?.abort(); setAnalysisLoading(false); }} placeholder="Where are you headed?" />
              <div className="astra-field"><label htmlFor="ride-date">Ride date <span className="optional-label">optional</span></label><input id="ride-date" data-testid="input-ride-date" type="date" {...rideForm.register("rideDate")} /></div>
              <button className="primary-button wide-button" type="submit" disabled={loading}>{loading ? <><span className="button-loader" />Looking up route…</> : <>Explore route <ArrowRight size={15} /></>}</button>
            </form>
          </Form>
          {error && <div className="inline-alert alert-error" role="alert"><AlertTriangle size={16} />{error}</div>}
          {notice && <div className="inline-alert alert-success" role="status"><Check size={16} />{notice}</div>}
          <p className="small-note"><strong>Routing source:</strong> OSRM public route service. Driving directions are not motorcycle-specific; route availability, surface, closures, and suitability are not validated.</p>
          {plan && <div className="route-summary">
            <div className="summary-route"><span>{plan.origin.name}</span><ArrowDownRight size={15} /><span>{plan.destination.name}</span></div>
            <div className="summary-stats"><div><small>Distance</small><strong>{formatDistance(plan.distanceMeters)}</strong></div><div><small>Estimated driving time</small><strong>{formatDuration(plan.durationSeconds)}</strong></div></div>
            <div className="route-summary-actions">
              <button className="secondary-button save-route-button" type="button" onClick={handleSave}><Save size={15} />Save to My rides</button>
              <button className="primary-button analyse-route-button" type="button" onClick={analyzeRoute} disabled={analysisLoading || loading}>
                {analysisLoading ? <><span className="button-loader" />Analysing route…</> : <><ShieldAlert size={16} />Analyse Route</>}
              </button>
            </div>
            <p className="analysis-trigger-note">Detailed weather-risk checks run only when you press Analyse Route.</p>
          </div>}
        </Panel>
        <Panel className="map-panel" title="Route map">
          <Suspense fallback={<div className="astra-map map-loading" role="status">Loading interactive map…</div>}>
            <RouteMap plan={plan} riskSegments={mapRiskSegments} />
          </Suspense>
          <div className="map-caption"><span><span className="map-dot" />OSRM driving route</span><span>Map tiles: OpenFreeMap</span></div>
          {analysis && <div className="map-risk-legend"><span><i className="risk-map-dot" />Analysed checkpoint</span><small>{analysis.checkedCount}/{analysis.totalCount} points checked</small></div>}
        </Panel>
      </div>

      {analysisLoading && <Panel className="route-analysis-loading" kicker="Route Intelligence" title="Analysing your route…">
        <div className="analysis-progress-track"><span /></div>
        <p>ASTRA is checking weather and the backend's experimental risk estimate at up to five points along this route. This can take a little while if the service is waking up.</p>
      </Panel>}
      {analysisError && <div className="inline-alert alert-error route-analysis-error" role="alert"><AlertTriangle size={17} /><div><strong>Analysis unavailable</strong><p>{analysisError}</p><span>Try again shortly. No route-safety conclusion has been generated.</span></div></div>}

      {analysis && <section className="route-analysis-results" aria-label="ASTRA Route Intelligence report">
        <Panel className="route-overall-risk-panel" kicker="ASTRA Route Intelligence" title="Overall route risk">
          <div className="route-overall-risk-layout">
            <div className={`route-overall-score risk-level-${analysis.level.toLowerCase()}`}>
              <strong>{analysis.score}</strong><span>/100</span>
            </div>
            <div className="route-overall-copy">
              <StatusTag tone={riskTone(analysis.level)}>{analysis.level} · Peak checkpoint</StatusTag>
              <p>This score is the highest model score returned by the sampled checkpoints, so a higher-risk stretch is not hidden by averaging.</p>
              <small>Data coverage: {analysis.checkedCount} of {analysis.totalCount} checkpoints · Analysed {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(analysis.createdAt))}</small>
            </div>
          </div>
          {analysis.checkedCount < analysis.totalCount && <div className="inline-alert alert-error"><AlertTriangle size={15} />Partial coverage: some route checkpoints could not be checked. The displayed score is based only on successful points.</div>}
          <div className="route-analysis-limit"><ShieldAlert size={17} /><p><strong>Weather-risk estimate, not a guarantee of road safety.</strong> This first version uses the existing backend's experimental weather-risk model. Verified accident, road-closure, traffic, waterlogging and landslide feeds are not connected yet.</p></div>
        </Panel>

        <Panel className="route-segments-panel" kicker="Along your route" title="Checkpoint-by-checkpoint analysis">
          <div className="route-segment-list">{analysis.points.map((point) => <article className="route-segment-card" key={point.id}>
            <div className="route-segment-marker"><MapPin size={17} /></div>
            <div className="route-segment-main">
              <div className="route-segment-title-row"><div><h3>{point.label}</h3><p>{formatDistance(plan!.distanceMeters * point.fraction)} from the start · {point.latitude.toFixed(3)}, {point.longitude.toFixed(3)}</p></div><div className="route-segment-score"><strong>{point.response.risk.score}</strong><StatusTag tone={riskTone(point.response.risk.level)}>{point.response.risk.level}</StatusTag></div></div>
              {point.response.risk.factors.length > 0 ? <ul className="route-segment-factors">{point.response.risk.factors.map((factor) => <li key={factor}>{factor}</li>)}</ul> : <p className="route-segment-no-factors">No risk factors were listed by the model at this checkpoint.</p>}
              <small className="route-segment-provider">Risk source: backend model · Weather provider: {point.response.provider}</small>
            </div>
          </article>)}</div>
        </Panel>

        <div className="route-analysis-data-grid">

<Panel className="route-alerts-status-panel" kicker="Official disaster warnings" title="NDMA SACHET alerts">
  {(() => {
    const activeCount = officialAlerts.filter(
      (alert) => alert.verification_status === "official_cap_current",
    ).length;
    const pendingCount = officialAlerts.filter(
      (alert) => alert.verification_status === "details_pending",
    ).length;
    const inactiveCount = officialAlerts.filter(
      (alert) => alert.verification_status === "expired_or_inactive",
    ).length;

    return (
      <>
        <div className="analysis-source-status">
          <ShieldAlert size={20} />
          <div>
            <strong>
              {officialAlertsLoading
                ? "Loading official alerts..."
                : officialAlertsSourceStatus === "available"
                  ? "Official disaster feed available"
                  : "Official disaster feed unavailable"}
            </strong>
            <p>
              {officialAlertsError
                ? officialAlertsError
                : "India-wide disaster warnings. Route relevance has not been verified; these records do not confirm road closures."}
            </p>
          </div>
        </div>

        {!officialAlertsLoading && officialAlerts.length > 0 && (
          <>
            <div className="route-segment-list">
              <article className="route-segment-card">
                <div className="route-segment-marker">
                  <ShieldAlert size={17} />
                </div>
                <div className="route-segment-main">
                  <h3>Alert summary</h3>
                  <p>
                    {activeCount} marked active · {pendingCount} pending verification · {inactiveCount} expired or inactive
                  </p>
                  <small className="route-segment-provider">
                    These counts describe feed records, not confirmed hazards along your route.
                  </small>
                </div>
              </article>
            </div>

            <details className="route-alert-details">
              <summary>View alert details ({officialAlerts.length} records)</summary>
              <div className="route-segment-list">
                {officialAlerts.slice(0, 20).map((alert, index) => (
                  <article
                    className="route-segment-card"
                    key={`${alert.sent ?? alert.title ?? "alert"}-${index}`}
                  >
                    <div className="route-segment-marker">
                      <ShieldAlert size={17} />
                    </div>
                    <div className="route-segment-main">
                      <h3>
                        {alert.headline || alert.title || alert.event || "Official disaster alert"}
                      </h3>
                      {alert.area_description && (
                        <p>
                          {Array.isArray(alert.area_description)
                            ? alert.area_description.join(", ")
                            : alert.area_description}
                        </p>
                      )}
                      <small className="route-segment-provider">
                        Verification: {
                          alert.verification_status === "official_cap_current"
                            ? "Official CAP record — marked active"
                            : alert.verification_status === "details_pending"
                              ? "Details pending — activity unconfirmed"
                              : alert.verification_status === "expired_or_inactive"
                                ? "Expired or inactive"
                                : "Activity status unknown"
                        }
                      </small>
                      <small className="route-segment-provider">
                        Route relevance: Not verified
                      </small>
                    </div>
                  </article>
                ))}
                {officialAlerts.length > 20 && (
                  <p>Showing the first 20 of {officialAlerts.length} records.</p>
                )}
              </div>
            </details>
          </>
        )}

        {!officialAlertsLoading && officialAlerts.length === 0 && !officialAlertsError && (
          <p>No alert records were returned. This does not confirm that roads are clear.</p>
        )}
      </>
    );
  })()}
</Panel>


          <Panel className="route-alternatives-status-panel" kicker="Route options" title="Alternative comparison">
            <div className="analysis-source-status"><RouteIcon size={20} /><div><strong>Not available in this version</strong><p>The current OSRM integration returns one route. Alternative routes need a separate routing request and comparable risk checks before ASTRA can recommend one.</p></div></div>
          </Panel>
        </div>
      </section>}
      <DataWarning />
    </main>
  );
}

function WeatherPage() {
  const [location, setLocation] = useState<Location | null>(null);
  const [forecast, setForecast] = useState<WeatherSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updatedFor, setUpdatedFor] = useState("");
  const [backendRisk, setBackendRisk] = useState<BackendRiskResponse | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState("");
  const [locationStatus, setLocationStatus] = useState("Detecting your location…");
  const [locationLoading, setLocationLoading] = useState(false);

  function requestCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("This browser does not support GPS. Search for a location manually.");
      return;
    }

    setLocationLoading(true);
    setLocationStatus("Requesting your location permission…");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const gpsLocation: Location = {
          name: "Your current location",
          latitude,
          longitude,
          admin1: "GPS location",
          country: "India",
        };
        setLocation(gpsLocation);
        setLocationStatus("Using your current GPS coordinates. You can search for another location at any time.");
        setLocationLoading(false);
      },
      (geoError) => {
        setLocationStatus(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location permission denied. Search for a location manually, or enable location access in your browser."
            : "Could not detect your location. You can retry or search for a location manually."
        );
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  useEffect(() => {
    requestCurrentLocation();
    // Detect once when the Weather & Alerts page mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!location) { setForecast([]); setUpdatedFor(""); return; }
    const controller = new AbortController();
    setForecast([]);
    setUpdatedFor("");
    setLoading(true);
    setError("");
    fetchWeather(location, controller.signal).then((data) => {
      setForecast(data);
      setUpdatedFor(locationLabel(location));
    }).catch((caught: unknown) => {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Weather could not be loaded.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [location]);

  useEffect(() => {
    if (!location) {
      setBackendRisk(null);
      setRiskError("");
      setRiskLoading(false);
      return;
    }
    const controller = new AbortController();
    setBackendRisk(null);
    setRiskError("");
    setRiskLoading(true);
    fetchBackendRisk(location, controller.signal)
      .then(setBackendRisk)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setBackendRisk(null);
          setRiskError(caught instanceof Error ? caught.message : "Risk estimate could not be loaded.");
        }
      })
      .finally(() => { if (!controller.signal.aborted) setRiskLoading(false); });
    return () => controller.abort();
  }, [location]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return forecast.filter((item) => new Date(item.time).getTime() >= now - 3600000).slice(0, 12);
  }, [forecast]);
  const current = upcoming[0];
  const localTime = (value: string) => {
    const [day, time] = value.split("T");
    const [hour, minute] = (time ?? "").split(":");
    const weekday = day ? new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(`${day}T12:00:00`)) : "";
    return `${weekday} · ${hour ?? ""}:${minute ?? "00"} local`;
  };

  return (
    <main className="page inner-page">
      <PageHeading eyebrow="Weather & area alerts" title="Conditions, not certainty." description="Check local weather and area-level hazard alerts for your current location, or search for another place. Weather is informational only." icon={CloudSun} />
      <div className="weather-layout">
        <Panel className="weather-search-panel" kicker="Open-Meteo forecast" title="Choose a place">
          <LocationPicker
            id="weather-location"
            label="Location"
            value={location}
            onChange={(nextLocation) => {
              setLocation(nextLocation);
              setLocationStatus(
                nextLocation
                  ? `Showing weather for ${locationLabel(nextLocation)}.`
                  : "Search and select a location to load its weather."
              );
            }}
            placeholder="Search any location"
          />
          <div className="weather-location-actions">
            <button
              className="text-button"
              type="button"
              onClick={requestCurrentLocation}
              disabled={locationLoading}
            >
              <Crosshair size={15} aria-hidden="true" /> {locationLoading ? "Detecting location…" : "Use My Location"}
            </button>
            <p className="small-note" role="status" aria-live="polite">{locationStatus}</p>
          </div>
          <p className="small-note">Weather comes from Open-Meteo Forecast API. Forecast detail varies with provider coverage and time zone.</p>
          {loading && <div className="loading-skeleton" role="status" aria-label="Loading forecast"><span /><span /><span /></div>}
          {error && <div className="inline-alert alert-error" role="alert"><AlertTriangle size={16} />{error}<button className="text-button" type="button" onClick={() => setLocation(location ? { ...location } : null)}>Retry</button></div>}
          {!location && !loading && <div className="quiet-empty"><CloudSun size={21} /><strong>Forecast waiting for a location</strong><p>Allow location access or search above and select a place to retrieve forecast details.</p></div>}
          {current && !loading && <div className="current-weather">
            <div className="current-weather-top"><div><small>Forecast for</small><strong>{updatedFor}</strong></div><StatusTag tone="ok">Live service response</StatusTag></div>
            <div className="weather-big"><span>{Math.round(current.temperatureC)}°</span><div><strong>{describeWeather(current.weatherCode)}</strong><small>At {localTime(current.time)}</small></div></div>
            <div className="weather-detail-grid">
              <WeatherMetric label="Humidity" value={`${current.humidityPercent}%`} />
              <WeatherMetric label="Wind" value={`${current.windSpeedKph} km/h`} icon={<Wind size={14} />} />
              <WeatherMetric label="Precipitation" value={`${current.precipitationMm} mm`} />
              <WeatherMetric label="Rain chance" value={current.precipitationProbability == null ? "Not provided" : `${current.precipitationProbability}%`} />
            </div>
          </div>}
        </Panel>
        <Panel className="alerts-panel area-alerts-panel" kicker="Local hazard information" title="Area alerts">
          <div className="unavailable-alert"><span className="alert-symbol"><ShieldAlert size={20} /></span><div><StatusTag tone="warning">Feed not connected</StatusTag><h3>Area alerts will appear here</h3><p>Alerts for the selected area—such as heavy rain, waterlogging, landslides, accidents and closures—will be shown here when verified data sources are connected. No alert data is currently available, so this must not be treated as an all-clear.</p></div></div>
          <div className="risk-disclaimer"><HeartPulse size={16} /><span>
            <strong>Experimental weather-risk estimate</strong>
            {riskLoading && <p role="status">Loading estimate from ASTRA backend…</p>}
            {riskError && <p role="alert">{riskError} <button className="text-button" type="button" onClick={() => setLocation(location ? { ...location } : null)}>Retry</button></p>}
            {backendRisk && !riskLoading && <p><strong>{backendRisk.risk.score}/100 · {backendRisk.risk.level}</strong> ({backendRisk.provider})</p>}
            {backendRisk && backendRisk.risk.factors.length > 0 && <ul>{backendRisk.risk.factors.map((factor) => <li key={factor}>{factor}</li>)}</ul>}
            {!location && <p>Choose a location to request an estimate.</p>}
            <p>Model output only—not a validated road-safety rating. Area-alert feeds are not connected yet.</p>
          </span></div>
        </Panel>
      </div>
      {upcoming.length > 0 && <Panel className="hourly-panel" kicker="Open-Meteo · selected location time" title="Upcoming hourly forecast">
        <div className="hourly-strip">{upcoming.map((item) => <div className="hour-cell" key={item.time}><small>{localTime(item.time)}</small><strong>{Math.round(item.temperatureC)}°</strong><span>{describeWeather(item.weatherCode)}</span><small>{item.precipitationMm} mm rain</small></div>)}</div>
      </Panel>}
      <DataWarning />
    </main>
  );
}

function WeatherMetric({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return <div className="weather-metric"><small>{label}</small><strong>{icon}{value}</strong></div>;
}

function TeamRidingPage() {
  const [publicGroups, setPublicGroups] = useState<TeamRide[]>([]);
  const [myGroups, setMyGroups] = useState<TeamRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selected, setSelected] = useState<TeamRide | null>(null);
  const [showCode, setShowCode] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "", origin: "", destination: "", departure_at: "", pace: "Moderate",
    meeting_point: "", notes: "", visibility: "public" as "public" | "private",
    max_riders: "10", start_latitude: "", start_longitude: "",
  });
  const selectedPublicGroupId = new URLSearchParams(window.location.search).get("publicGroup");

  async function refresh() {
    setError("");
    try {
      const [publicData, mineData] = await Promise.all([
        teamApi<{ rides: TeamRide[] }>("/team-rides"),
        teamApi<{ rides: TeamRide[] }>("/team-rides/mine"),
      ]);
      setPublicGroups(publicData.rides);
      setMyGroups(mineData.rides);
      if (selectedPublicGroupId) {
        const found = [...publicData.rides, ...mineData.rides].find((ride) => String(ride.id) === selectedPublicGroupId);
        if (found) setSelected(found);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load riding groups. Make sure you are logged in and the backend is running.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage(""); setCreating(true);
    try {
      const body = {
        name: form.name.trim(), origin: form.origin.trim(), destination: form.destination.trim(),
        departure_at: form.departure_at ? new Date(form.departure_at).toISOString() : "",
        pace: form.pace, meeting_point: form.meeting_point.trim(), notes: form.notes.trim(),
        visibility: form.visibility, max_riders: Number(form.max_riders),
        start_latitude: form.start_latitude ? Number(form.start_latitude) : null,
        start_longitude: form.start_longitude ? Number(form.start_longitude) : null,
      };
      const result = await teamApi<{ ride: TeamRide }>("/team-rides", { method: "POST", body: JSON.stringify(body) });
      setMessage(result.ride.visibility === "private" ? `Private group created. Share invite code ${result.ride.invite_code} with riders you trust.` : "Public ride group created and published.");
      setForm({ name: "", origin: "", destination: "", departure_at: "", pace: "Moderate", meeting_point: "", notes: "", visibility: "public", max_riders: "10", start_latitude: "", start_longitude: "" });
      setShowCreate(false); await refresh();
      if (result.ride.visibility === "private") setShowCode(result.ride.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not create group."); }
    finally { setCreating(false); }
  }

  async function joinRide(ride: TeamRide) {
    setBusyId(ride.id); setError(""); setMessage("");
    try {
      const result = await teamApi<{ message: string; ride: TeamRide }>(`/team-rides/${ride.id}/join`, { method: "POST" });
      setMessage(result.message); await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not join group."); }
    finally { setBusyId(null); }
  }

  async function joinByCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    try {
      const result = await teamApi<{ message: string; ride: TeamRide }>("/team-rides/join-by-code", { method: "POST", body: JSON.stringify({ invite_code: inviteCode.trim().toUpperCase() }) });
      setMessage(result.message); setInviteCode(""); await refresh(); setSelected(result.ride);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not join with that code."); }
  }

  async function leaveRide(ride: TeamRide) {
    setBusyId(ride.id); setError(""); setMessage("");
    try { const result = await teamApi<{ message: string }>(`/team-rides/${ride.id}/leave`, { method: "POST" }); setMessage(result.message); setSelected(null); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not leave group."); }
    finally { setBusyId(null); }
  }

  async function deleteRide(ride: TeamRide) {
    if (!window.confirm(`Delete “${ride.name}” for all members?`)) return;
    setBusyId(ride.id); setError("");
    try { await teamApi<{ message: string }>(`/team-rides/${ride.id}`, { method: "DELETE" }); setMessage("Group deleted."); setSelected(null); await refresh(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete group."); }
    finally { setBusyId(null); }
  }

  async function showDetails(ride: TeamRide) {
    setSelected(ride);
    try {
      const data = await teamApi<{ ride: TeamRide }>(`/team-rides/${ride.id}`);
      setSelected(data.ride);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load group details.");
    }
  }

  async function copyCode(ride: TeamRide) {
    if (!ride.invite_code) return;
    try { await navigator.clipboard.writeText(ride.invite_code); setMessage("Invite code copied."); }
    catch { setMessage(`Invite code: ${ride.invite_code}`); }
  }

  const renderRide = (ride: TeamRide, mine = false) => <article className="group-card" key={`${mine ? "mine" : "public"}-${ride.id}`}>
    <div className="group-card-head"><div><h3>{ride.name}</h3><small>{ride.visibility === "private" ? "Private group" : "Public group"} · Created {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(ride.created_at))}</small></div><span className="vacancy-chip">{ride.vacancies} seats open</span></div>
    <p className="public-ride-route">{ride.route_display}</p>
    {ride.notes && <p className="selected-ride-notes">{ride.notes}</p>}
    <div className="selected-ride-details"><div><small>Departure</small><strong>{formatDeparture(ride.departure_at)}</strong></div><div><small>Meeting point</small><strong>{ride.meeting_point || "To be decided"}</strong></div><div><small>Pace</small><strong>{ride.pace}</strong></div><div><small>Riders</small><strong>{ride.member_count}/{ride.max_riders}</strong></div></div>
    <div className="group-actions">
      {!mine && ride.visibility === "public" && !ride.is_member && <button className="primary-button" type="button" disabled={busyId === ride.id || ride.vacancies <= 0} onClick={() => void joinRide(ride)}><UsersRound size={14} />{busyId === ride.id ? "Joining…" : "Join ride"}</button>}
      {ride.is_member && !ride.is_creator && <button className="secondary-button" type="button" disabled={busyId === ride.id} onClick={() => void leaveRide(ride)}>Leave group</button>}
      {ride.is_creator && <><button className="secondary-button" type="button" onClick={() => setShowCode(showCode === ride.id ? null : ride.id)}>{showCode === ride.id ? "Hide code" : "Invite code"}</button><button className="icon-button danger-icon" type="button" aria-label={`Delete ${ride.name}`} disabled={busyId === ride.id} onClick={() => void deleteRide(ride)}><Trash2 size={16}/></button></>}
      {ride.invite_code && (ride.is_creator || ride.is_member) && <button className="secondary-button" type="button" onClick={() => void copyCode(ride)}><Copy size={14}/>Copy code</button>}
      <button className="secondary-button" type="button" onClick={() => void showDetails(ride)}>Details</button>
    </div>
    {showCode === ride.id && ride.invite_code && <p className="inline-message">Share this private invitation code: <strong>{ride.invite_code}</strong></p>}
  </article>;

  return <main className="page inner-page">
    <PageHeading eyebrow="Ride together" title="Find your riding crew." description="Create shared public rides or private groups. Group membership and invitation codes are stored on the ASTRA backend." icon={UsersRound}/>
    {error && <p className="field-error" role="alert">{error}</p>}
    {message && <p className="inline-message" role="status">{message}</p>}
    {selected && <Panel className="selected-public-ride" kicker={`${selected.visibility === "private" ? "Private" : "Public"} group details`} title={selected.name}>
      <p className="selected-ride-route">{selected.route_display}</p>
      <div className="selected-ride-details"><div><small>Departure</small><strong>{formatDeparture(selected.departure_at)}</strong></div><div><small>Meeting point</small><strong>{selected.meeting_point || "To be decided"}</strong></div><div><small>Group size</small><strong>{selected.member_count}/{selected.max_riders}</strong></div><div><small>Ride pace</small><strong>{selected.pace}</strong></div></div>
      <h3>Riders</h3>{selected.members?.length ? <ul>{selected.members.map((member) => <li key={member.id}>{member.email}</li>)}</ul> : <p className="status-copy">Member list is available to group members.</p>}
      {selected.is_creator && <button className="secondary-button" type="button" onClick={() => void copyCode(selected)}><Copy size={14}/>Copy invite code</button>}
    </Panel>}
    <div className="team-grid">
      <Panel className="team-create-panel" kicker="Start a ride" title="Create a riding group">
        <button className="primary-button wide-button" type="button" onClick={() => setShowCreate((value) => !value)}><Plus size={15}/>{showCreate ? "Close form" : "Create new group"}</button>
        {showCreate && <form className="stack-form" onSubmit={(event) => void createGroup(event)}>
          <div className="astra-field"><label htmlFor="team-name">Group name</label><input id="team-name" required maxLength={100} value={form.name} onChange={(event) => setForm({...form,name:event.target.value})} placeholder="e.g. Sunday Agra ride"/></div>
          <div className="astra-field"><label htmlFor="team-origin">Starting point / city</label><input id="team-origin" required value={form.origin} onChange={(event) => setForm({...form,origin:event.target.value})} placeholder="Ghaziabad"/></div>
          <div className="astra-field"><label htmlFor="team-destination">Destination</label><input id="team-destination" required value={form.destination} onChange={(event) => setForm({...form,destination:event.target.value})} placeholder="Agra"/></div>
          <div className="astra-field"><label htmlFor="team-departure">Departure date and time</label><input id="team-departure" type="datetime-local" required value={form.departure_at} onChange={(event) => setForm({...form,departure_at:event.target.value})}/></div>
          <div className="astra-field"><label htmlFor="team-meeting">Meeting point</label><input id="team-meeting" value={form.meeting_point} onChange={(event) => setForm({...form,meeting_point:event.target.value})} placeholder="Petrol pump / landmark"/></div>
          <div className="astra-field"><label htmlFor="team-pace">Riding pace</label><select id="team-pace" value={form.pace} onChange={(event) => setForm({...form,pace:event.target.value})}><option>Relaxed</option><option>Moderate</option><option>Steady</option><option>Experienced</option></select></div>
          <div className="astra-field"><label htmlFor="team-max">Maximum riders (including you)</label><input id="team-max" type="number" min="2" max="100" required value={form.max_riders} onChange={(event) => setForm({...form,max_riders:event.target.value})}/></div>
          <div className="astra-field"><label htmlFor="team-visibility">Group visibility</label><select id="team-visibility" value={form.visibility} onChange={(event) => setForm({...form,visibility:event.target.value as "public" | "private"})}><option value="public">Public — anyone can join</option><option value="private">Private — invitation code required</option></select></div>
          <div className="astra-field"><label htmlFor="team-notes">Ride notes <span className="optional-label">optional</span></label><textarea id="team-notes" rows={3} maxLength={1000} value={form.notes} onChange={(event) => setForm({...form,notes:event.target.value})} placeholder="Stops, helmet requirements, other details"/></div>
          <p className="status-copy">Optional nearby search coordinates (decimal degrees) help show this group on the dashboard map/radius list.</p>
          <div className="astra-field"><label htmlFor="team-lat">Start latitude <span className="optional-label">optional</span></label><input id="team-lat" type="number" step="any" value={form.start_latitude} onChange={(event) => setForm({...form,start_latitude:event.target.value})} placeholder="28.6692"/></div>
          <div className="astra-field"><label htmlFor="team-lon">Start longitude <span className="optional-label">optional</span></label><input id="team-lon" type="number" step="any" value={form.start_longitude} onChange={(event) => setForm({...form,start_longitude:event.target.value})} placeholder="77.4538"/></div>
          <button className="primary-button wide-button" type="submit" disabled={creating}>{creating ? "Creating…" : "Create group"}</button>
        </form>}
        <div className="local-only-note"><UsersRound size={15}/><span>Public rides appear in the community list. Private rides are hidden unless you created or joined them.</span></div>
        <div className="divider" />
        <h3>Join a private ride</h3><p className="status-copy">Enter the invitation code shared by the group creator.</p>
        <form className="stack-form" onSubmit={(event) => void joinByCode(event)}><div className="astra-field"><label htmlFor="team-invite-code">Private invitation code</label><input id="team-invite-code" required autoCapitalize="characters" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="Enter code"/></div><button className="secondary-button wide-button" type="submit"><Check size={15}/>Join with code</button></form>
      </Panel>
      <Panel className="group-list-panel" kicker="Shared database" title="Public riding groups">
        {loading ? <p className="status-copy">Loading live riding groups…</p> : publicGroups.length === 0 ? <div className="composed-empty"><span className="empty-icon"><UsersRound size={22}/></span><strong>No public groups yet</strong><p>Create the first public group and it will appear here for other ASTRA users.</p></div> : <div className="group-list">{publicGroups.map((ride) => renderRide(ride))}</div>}
      </Panel>
    </div>
    <Panel className="group-list-panel" kicker="Your account" title="Groups you created or joined">
      {loading ? <p className="status-copy">Loading your groups…</p> : myGroups.length === 0 ? <div className="composed-empty"><span className="empty-icon"><UsersRound size={22}/></span><strong>You have no groups yet</strong><p>Create a group or join a public/private ride to see it here.</p></div> : <div className="group-list">{myGroups.map((ride) => renderRide(ride, true))}</div>}
    </Panel>
    <Panel className="team-emergency-panel" kicker="Team safety" title="Emergency mode"><div className="team-emergency-content"><span className="emergency-mark"><ShieldAlert size={21}/></span><div><strong>If a rider needs urgent help</strong><p>Share your exact location, keep the group together when safe, and contact local emergency services. ASTRA does not transmit an SOS or share live location.</p></div><a className="primary-button emergency-call" href="tel:112"><ShieldAlert size={15}/>Call 112</a></div></Panel>
  </main>;
}

function MyRidesPage() {
  const [, setLocation] = useLocation();
  const [rides, setRides] = useState<SavedRide[]>([]);
  const [message, setMessage] = useState("Loading your account rides…");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [localRides, setLocalRides] = useState<SavedRide[]>(() => getSavedRides());

  
  async function refreshRides() {
    setLoading(true);
    const loadingStartedAt = Date.now();

    try {
      const accountRides = await fetchAccountRides();
      setRides(accountRides);
      setSignedIn(true);
      setMessage(
        accountRides.length
          ? "Your rides are synced to this ASTRA account."
          : "No rides saved to this account yet.",
      );
    } catch (caught) {
      setRides([]);

      const errorMessage =
        caught instanceof Error
          ? caught.message
          : "Could not load account rides.";

      if (
        errorMessage.includes(
          "Please log in to view your account rides.",
        )
      ) {
        setSignedIn(false);
      } else {
        setSignedIn(null);
      }

      setMessage(errorMessage);
    } finally {
      const elapsed = Date.now() - loadingStartedAt;
      const remaining = Math.max(0, 1000 - elapsed);

      if (remaining > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, remaining),
        );
      }

      setLoading(false);
    }
  }


  useEffect(() => { void refreshRides(); }, []);

  async function migrateLocalRides() {
    if (!signedIn || !localRides.length || busy) return;
    setBusy(true);
    setMessage("Copying browser-saved rides to your account…");
    try {
      const existing = new Set(rides.map((ride) => ride.id));
      let copied = 0;
      for (const ride of localRides) {
        if (existing.has(ride.id)) continue;
        await saveAccountRide(ride);
        copied += 1;
      }
      await refreshRides();
      setLocalRides(getSavedRides());
      setMessage(copied ? `Copied ${copied} ride${copied === 1 ? "" : "s"} to your account. Browser copies were kept.` : "All browser-saved rides were already in this account. Browser copies were kept.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not migrate browser rides. Your local copies are unchanged.");
    } finally {
      setBusy(false);
    }
  }

  async function removeAccountRide(ride: SavedRide) {
    if (busy) return;
    setBusy(true);
    setMessage(`Deleting “${ride.name}”…`);
    try {
      await deleteAccountRide(ride.id);
      setRides((current) => current.filter((item) => item.id !== ride.id));
      setMessage("Ride deleted from your ASTRA account.");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Could not delete this ride.");
    } finally {
      setBusy(false);
    }
  }

  const visible = rides.filter((ride) => `${ride.name} ${ride.plan.origin.name} ${ride.plan.destination.name}`.toLowerCase().includes(filter.toLowerCase()));
  function openRide(ride: SavedRide) {
    setActiveRide(ride.plan);
    setLocation("/route-planner");
  }

  return (
    <main className="page inner-page">
      <PageHeading eyebrow="Your routes" title="A small ride log." description="Your account rides are stored by ASTRA's backend and are available when you sign in on another device. Browser-saved rides remain separate until you choose to copy them." icon={Bike} />
      <Panel
        className="rides-panel"
        kicker={loading || signedIn === null ? "Account status" : signedIn ? "Account storage" : "Sign-in required"}
        title="My rides"
      >
        <div className="rides-toolbar"><p>{loading ? "Loading…" : `${rides.length} ${rides.length === 1 ? "ride" : "rides"} in this account`}</p><label className="ride-filter"><Search size={15} /><span className="sr-only">Filter rides</span><input data-testid="input-filter-rides" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter routes" /></label></div>
        {message && <p className="inline-message" role="status">{message}</p>}
        {signedIn && localRides.length > 0 && <div className="rides-toolbar"><p>{localRides.length} older ride{localRides.length === 1 ? "" : "s"} stored in this browser. Copy them without deleting the originals.</p><button className="secondary-button" type="button" disabled={busy || loading} onClick={() => void migrateLocalRides()}>{busy ? "Please wait…" : "Copy old rides to account"}</button></div>}
        {loading ? (
          <div className="composed-empty rides-empty rides-loading" role="status" aria-live="polite">
            <img
               className="rides-loading-animation"
               src="/animations/cycle.gif"
               alt="Loading your rides"
             />
             <strong>Loading your rides…</strong>
             <p>Checking your account and syncing your saved routes.</p>
            </div>
        ) : signedIn === false ? (
          <div className="composed-empty rides-empty">
            <span className="empty-icon"><RouteIcon size={22} /></span>
            <strong>Sign in to view your rides</strong>
            <p>Save routes while signed in to keep a synced ride log across devices.</p>
          </div>
        ) : visible.length ? (
          <div className="ride-list">
            {visible.map((ride) => (
              <article key={ride.id} className="ride-row">
                <div className="ride-info"><h3>{ride.name}</h3><p>{ride.plan.origin.country || "Route"} · {ride.rideDate ? `Ride date ${ride.rideDate}` : `Saved ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(ride.createdAt))}`}</p></div>
                <div className="ride-facts"><strong>{formatDistance(ride.plan.distanceMeters)}</strong><small>{formatDuration(ride.plan.durationSeconds)}</small></div>
                <div className="ride-row-actions"><button className="secondary-button" type="button" onClick={() => openRide(ride)}>Open route <ArrowRight size={14} /></button><button className="icon-button danger-icon" type="button" aria-label={`Delete ${ride.name}`} disabled={busy} onClick={() => void removeAccountRide(ride)}><Trash2 size={16} /></button></div>
              </article>
            ))}
          </div>
        ) : (
          <div className="composed-empty rides-empty">
            <span className="empty-icon"><RouteIcon size={22} /></span>
            <strong>No rides match your filter</strong>
            <p>Try another route name or location to find the saved trip.</p>
          </div>
        )}
        <div className="rides-toolbar"><button className="secondary-button" type="button" disabled={loading || busy} onClick={() => void refreshRides()}><RefreshCw size={14} /> Refresh rides</button></div>
      </Panel>
      <div className="my-rides-support-grid">
        <Panel className="recent-panel" kicker="Account storage" title="Recent rides">
          {rides.slice(0, 2).length ? <div className="recent-list">{rides.slice(0, 2).map((ride) => <button key={ride.id} type="button" className="recent-row recent-row-button" onClick={() => openRide(ride)}><span className="recent-route"><strong>{ride.plan.origin.name}</strong><ArrowRight size={13} /><strong>{ride.plan.destination.name}</strong></span><span className="recent-distance">{formatDistance(ride.plan.distanceMeters)}</span><ChevronRight size={16} /></button>)}</div> : <div className="mini-empty"><span className="mini-empty-icon"><RouteIcon size={17} /></span><div><strong>No account rides yet</strong><p>Save a route while signed in to see it here.</p></div></div>}
        </Panel>
        <Panel className="integrity-panel" kicker="Known limits" title="Plan with clear eyes">
          <p>Public data services are best-effort. Check local advisories and conditions before departure.</p>
          <Link href="/weather-alerts" className="text-link">Read weather and road-data notes <ArrowRight size={14} /></Link>
        </Panel>
      </div>
      <DataWarning />
    </main>
  );
}

function AssistantPage() {
  return <main className="page inner-page assistant-page">
    <PageHeading eyebrow="ASTRA assistant" title="No AI in this ride." description="The assistant feature is unavailable by choice. No live AI is connected." icon={CircleHelp} />
    <Panel className="unavailable-feature" kicker="Explicitly unavailable" title="AI assistant skipped">
      <div className="assistant-status"><span className="assistant-symbol"><X size={20} /></span><div><StatusTag tone="warning">Unavailable</StatusTag><p>There is no assistant response service, chat history, or AI-generated ride advice in ASTRA.</p></div></div>
      <p className="small-note">Use official weather, road, and local authority sources to make your own decisions. ASTRA does not assess route risk.</p>
      <Link href="/route-planner" className="secondary-button">Plan a route instead <ArrowRight size={14} /></Link>
    </Panel>
  </main>;
}

function ServiceNotice() {
  return <aside className="service-notice" aria-label="Data and service limitations"><AlertTriangle size={15} /><p><strong>Public services are best-effort.</strong> Open-Meteo free geocoding is non-commercial. OSRM routes are not motorcycle-specific; OpenStreetMap tiles and public services may be rate-limited. Check official local advisories. Risk remains not assessed.</p></aside>;
}

function DataWarning() {
  return <div className="data-warning"><AlertTriangle size={15} /><p><strong>Best-effort public data.</strong> Check official sources before riding. No validated risk score or road-closure feed is available; weather is informational only.</p></div>;
}

function BottomNav() {
  const [path] = useLocation();
  return <nav className="astra-nav" aria-label="Main navigation">
    {navItems.map(({ path: href, label, icon: Icon }) => <Link key={href} href={href} className="nav-item" aria-current={path === href ? "page" : undefined} data-testid={`link-nav-${href === "/" ? "dashboard" : href.slice(1)}`}><Icon size={17} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span></Link>)}
  </nav>;
}

export default App;
