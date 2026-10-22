
import json
import os
import time
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from datetime import datetime, timezone
FEED_URL = (
    "https://sachet.ndma.gov.in/"
    "cap_public_website/rss/rss_india.xml"
)
CACHE_FILE = os.path.join(
    os.path.dirname(__file__),
    "sachet_cache.json",
)
TIMEOUT_SECONDS = 10
MAX_CACHE_AGE_SECONDS = 3600
DETAIL_REFRESH_INTERVAL = 900
MAX_DETAIL_FETCH_PER_REFRESH = 10

CAP_BASE_URL = (
    "https://sachet.ndma.gov.in/"
    "cap_public_website/FetchXMLFile?identifier="
)
_cache = {
    "etag": None,
    "xml": None,
    "checked_at": None,
    "details": {},
    "details_checked_at": None,
}


def _load_cache():
    global _cache

    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as file:
            saved = json.load(file)

        if isinstance(saved, dict):
            _cache.update(saved)
    except (OSError, ValueError):
        pass


def _save_cache():
    temporary_file = CACHE_FILE + ".tmp"

    try:
        with open(temporary_file, "w", encoding="utf-8") as file:
            json.dump(_cache, file, ensure_ascii=False)

        os.replace(temporary_file, CACHE_FILE)
    except OSError:
        pass


_load_cache()


def _text(element, path):
    found = element.find(path)
    return (found.text or "").strip() if found is not None else ""


def _parse_feed(xml_text):
    root = ET.fromstring(xml_text)
    channel = root.find("channel")
    if channel is None:
        raise ValueError("RSS feed has no channel element")

    alerts = []

    for item in channel.findall("item"):
        title = _text(item, "title")
        link = _text(item, "link")
        guid = _text(item, "guid")
        published = _text(item, "pubDate")
        category = _text(item, "category")
        author = _text(item, "author")
        description = _text(item, "description")

        if not guid:
            guid = link or title

        if not guid or not title:
            continue

        issued_at = None
        if published:
            try:
                issued_at = parsedate_to_datetime(
                    published
                ).isoformat()
            except (TypeError, ValueError, OverflowError):
                pass

        alerts.append({
            "id": f"sachet-{guid}",
            "title": title,
            "description": description,
            "category": "official_disaster_warning",
            "severity": "unknown",
            "status": "official_source_unverified_details",
            "source": author or "NDMA SACHET CAP feed",
            "source_category": category or None,
            "source_url": link or FEED_URL,
            "issued_at": issued_at,
            "valid_until": None,
            "fetched_at": None,
        })

    return alerts

def _cap_value(element, name):
    """Find a CAP XML field by its local tag name."""
    for node in element.iter():
        if node.tag.rsplit("}", 1)[-1] == name:
            return (node.text or "").strip()
    return ""



def _parse_cap_detail(xml_text):
    root = ET.fromstring(xml_text)

    if root.tag.rsplit("}", 1)[-1] != "alert":
        raise ValueError("Unexpected CAP XML root element")

    info_nodes = [
        node for node in root
        if node.tag.rsplit("}", 1)[-1] == "info"
    ]

    info = next(
        (
            node for node in info_nodes
            if _cap_value(node, "language").lower().startswith("en")
        ),
        info_nodes[0] if info_nodes else None,
    )

    if info is None:
        raise ValueError("CAP XML has no info section")

    def parse_time(value):
        if not value:
            return None
        try:
            parsed = datetime.fromisoformat(
                value.replace("Z", "+00:00")
            )
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=timezone.utc)
            return parsed
        except ValueError:
            return None

    sent_at = parse_time(_cap_value(root, "sent"))
    effective_at = parse_time(_cap_value(info, "effective"))
    expires_at = parse_time(_cap_value(info, "expires"))
    now = datetime.now(timezone.utc)

    cap_status = _cap_value(root, "status").lower()
    msg_type = _cap_value(root, "msgType").lower()
    severity = _cap_value(info, "severity").lower()

    # Only actual, non-cancel messages with a known future expiry
    # can be confirmed active by this basic parser.
    if cap_status != "actual" or msg_type == "cancel":
        is_active = False
    elif expires_at is None:
        is_active = None
    else:
        is_active = expires_at > now

    area_names = []
    for node in info.iter():
        if (
            node.tag.rsplit("}", 1)[-1] == "areaDesc"
            and (node.text or "").strip()
        ):
            area_names.append(node.text.strip())

    references = _cap_value(root, "references")

    return {
        "cap_identifier": _cap_value(root, "identifier") or None,
        "cap_sender": _cap_value(root, "sender") or None,
        "cap_sent_at": sent_at.isoformat() if sent_at else None,
        "cap_references": references or None,
        "event": _cap_value(info, "event") or None,
        "severity": severity or "unknown",
        "severity_label": severity.title() if severity else "Unknown",
        "urgency": _cap_value(info, "urgency").lower() or "unknown",
        "certainty": _cap_value(info, "certainty").lower() or "unknown",
        "cap_status": cap_status or "unknown",
        "msg_type": msg_type or "unknown",
        "headline": _cap_value(info, "headline") or None,
        "description": _cap_value(info, "description"),
        "instruction": _cap_value(info, "instruction") or None,
        "area_description": list(dict.fromkeys(area_names)),
        "effective_at": effective_at.isoformat() if effective_at else None,
        "valid_until": expires_at.isoformat() if expires_at else None,
        "is_active": is_active,
        "language": _cap_value(info, "language") or None,
    }



def _fetch_cap_detail(url):
    request = Request(
        url,
        headers={
            "User-Agent": "ASTRA-Disaster-Awareness/1.0",
            "Accept": "application/xml, text/xml",
        },
        method="GET",
    )

    with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        if response.status != 200:
            raise URLError(f"Unexpected CAP status {response.status}")

        xml_text = response.read().decode("utf-8-sig")

    return _parse_cap_detail(xml_text)


def _apply_cached_details(alerts):
    details = _cache.get("details") or {}

    for alert in alerts:
        detail = details.get(alert["id"])

        if not isinstance(detail, dict):
            alert["detail_status"] = "pending"
            continue

        alert.update({
            key: value
            for key, value in detail.items()
            if not key.startswith("_")
        })
        # Recalculate expiry using the current UTC time.
        valid_until = alert.get("valid_until")

        if valid_until:
            try:
                expiry = datetime.fromisoformat(
                    valid_until.replace("Z", "+00:00")
                )

                if expiry.tzinfo is None:
                    expiry = expiry.replace(tzinfo=timezone.utc)

                if expiry <= datetime.now(timezone.utc):
                    alert["is_active"] = False

            except (ValueError, TypeError):
                alert["is_active"] = None
        alert["detail_status"] = "available"

        if detail.get("headline"):
            alert["headline"] = detail["headline"]

        if detail.get("description"):
            alert["description"] = detail["description"]

        if detail.get("area_description"):
            alert["area_description"] = detail["area_description"]

        alert["category"] = "official_disaster_warning"
        alert["status"] = "official_cap_warning"

    return alerts



def _enrich_alerts(alerts, now):
    """Fetch missing or stale CAP details with a bounded refresh budget."""
    details = _cache.setdefault("details", {})
    last_checked = _cache.get("details_checked_at")

    if (
        last_checked is not None
        and now - int(last_checked) < DETAIL_REFRESH_INTERVAL
    ):
        return _apply_cached_details(alerts)

    candidates = []

    # Fetch missing details first so older cached records cannot starve
    # new alerts from the feed.
    for alert in alerts:
        detail = details.get(alert["id"])

        if not isinstance(detail, dict):
            candidates.append((0, alert))
            continue

        fetched_at = detail.get("_detail_fetched_at", 0)

        try:
            age = now - int(fetched_at)
        except (TypeError, ValueError):
            age = DETAIL_REFRESH_INTERVAL

        if age >= DETAIL_REFRESH_INTERVAL:
            candidates.append((1, alert))

    candidates.sort(key=lambda item: item[0])

    fetched_count = 0

    for _, alert in candidates:
        if fetched_count >= MAX_DETAIL_FETCH_PER_REFRESH:
            break

        url = alert.get("source_url", "")

        # Restrict detail requests to the official SACHET host/path.
        if not url.startswith(CAP_BASE_URL):
            continue

        try:
            detail = _fetch_cap_detail(url)
            detail["_detail_fetched_at"] = now
            details[alert["id"]] = detail
            fetched_count += 1
        except (
            HTTPError,
            URLError,
            TimeoutError,
            OSError,
            UnicodeError,
            ET.ParseError,
            ValueError,
        ):
            # Preserve last-known data if refresh fails.
            continue

    _cache["details_checked_at"] = now
    _save_cache()

    return _apply_cached_details(alerts)


def fetch_sachet_alerts():
    """Fetch and parse the official All India RSS feed.

    Uses the documented ETag contract and reuses cached XML on 304.
    Returns a status object; callers should not treat feed failures
    as proof that there are no active alerts.
    """
    now = int(time.time())
    headers = {
        "User-Agent": "ASTRA-Disaster-Awareness/1.0",
        "Accept": "application/xml, application/rss+xml",
    }

    if _cache.get("etag") and _cache.get("xml"):
        headers["If-None-Match"] = _cache["etag"]

    request = Request(FEED_URL, headers=headers, method="GET")

    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            status = response.status
            if status != 200:
                raise URLError(f"Unexpected HTTP status {status}")

            xml_text = response.read().decode("utf-8-sig")
            etag = response.headers.get("ETag")

            # Parse before replacing the last known-good cache.
            _parse_feed(xml_text)

            _cache.update({
                "etag": etag,
                "xml": xml_text,
                "checked_at": now,
            })
            _save_cache()

    except HTTPError as error:
        if error.code == 304 and _cache.get("xml"):
            _cache["checked_at"] = now
        else:
            return _failure_result(now, str(error))
    except (URLError, TimeoutError, OSError, UnicodeError, ET.ParseError, ValueError) as error:
        return _failure_result(now, str(error))

    try:
        alerts = _apply_cached_details(_parse_feed(_cache["xml"]))
        alerts = _enrich_alerts(alerts, now)
    except (ET.ParseError, ValueError) as error:
        return _failure_result(now, str(error))

    checked_at = _cache.get("checked_at")
    cache_age = (
        max(0, now - int(checked_at))
        if checked_at is not None
        else None
    )

    return {
        "source_status": "available",
        "source": "NDMA SACHET All India RSS",
        "provider": "sachet",
        "checked_at": checked_at,
        "cache_age_seconds": cache_age,
        "alerts": alerts,
        "count": len(alerts),
        "error": None,
    }

def _failure_result(now, message):
    cache_age = None
    checked_at = _cache.get("checked_at")

    if checked_at is not None:
        cache_age = max(0, now - int(checked_at))

    if (
        _cache.get("xml")
        and cache_age is not None
        and cache_age <= MAX_CACHE_AGE_SECONDS
    ):
        try:
            alerts = _parse_feed(_cache["xml"])
            return {
                "source_status": "degraded",
                "source": "NDMA SACHET All India RSS",
                "provider": "sachet_cache",
                "checked_at": checked_at,
                "cache_age_seconds": cache_age,
                "alerts": alerts,
                "count": len(alerts),
                "error": message,
            }
        except (ET.ParseError, ValueError):
            pass

    return {
        "source_status": "unavailable",
        "source": "NDMA SACHET All India RSS",
        "provider": "sachet",
        "checked_at": checked_at,
        "alerts": [],
        "count": 0,
        "error": "SACHET feed unavailable; an empty list is not confirmation of no hazards.",
    }
