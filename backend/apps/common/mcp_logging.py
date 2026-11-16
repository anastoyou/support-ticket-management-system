"""Detailed logging helpers for MCP JSON-RPC traffic, tool calls, and OAuth 2.1 flows."""

import hashlib
import json
import logging
import time
import uuid
from urllib.parse import parse_qs

from django.conf import settings

mcp_logger = logging.getLogger("mcp.traffic")

_MCP_PATH_PREFIXES = (
    "/mcp",
    "/.well-known/oauth-",
    "/o/",
)

_SENSITIVE_KEYS = frozenset(
    {
        "password",
        "passwd",
        "secret",
        "client_secret",
        "token",
        "access_token",
        "refresh_token",
        "id_token",
        "code",
        "code_verifier",
        "authorization",
        "cookie",
        "set-cookie",
        "x-csrftoken",
        "csrfmiddlewaretoken",
    }
)


def is_mcp_or_oauth_path(path: str) -> bool:
    """Return True if the request path belongs to MCP or its OAuth/DCR endpoints."""
    if not path:
        return False
    return path == "/mcp" or path.startswith("/mcp/") or any(
        path.startswith(prefix) for prefix in _MCP_PATH_PREFIXES[1:]
    )


def sanitize_value(value):
    """Recursively redact sensitive keys from dicts/lists while preserving other fields."""
    if isinstance(value, dict):
        sanitized = {}
        for k, v in value.items():
            key_str = str(k)
            if key_str.lower() in _SENSITIVE_KEYS:
                sanitized[key_str] = "<REDACTED>"
            else:
                sanitized[key_str] = sanitize_value(v)
        return sanitized
    if isinstance(value, list):
        return [sanitize_value(item) for item in value]
    return value


def _truncate_text(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    omitted = len(text) - max_chars
    return f"{text[:max_chars]}... [truncated {omitted} chars]"


def _format_json_or_text(data, max_chars: int) -> str:
    if data is None or data == "":
        return ""
    if isinstance(data, (dict, list)):
        text = json.dumps(sanitize_value(data), ensure_ascii=False, default=str)
    else:
        text = str(data)
    return _truncate_text(text, max_chars)


def _get_client_ip(request) -> str:
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "") or "-"


def _extract_sanitized_query(request) -> dict:
    if not request.GET:
        return {}
    raw = {k: (v[0] if len(v) == 1 else v) for k, v in request.GET.lists()}
    return sanitize_value(raw)


def _extract_sanitized_headers(request) -> dict:
    relevant = {}
    for key in (
        "Content-Type",
        "Accept",
        "User-Agent",
        "Origin",
        "Referer",
        "Mcp-Session-Id",
        "Mcp-Protocol-Version",
        "X-Forwarded-Host",
        "X-Forwarded-Proto",
    ):
        val = request.headers.get(key)
        if val:
            relevant[key] = val
    if request.headers.get("Authorization"):
        scheme = request.headers.get("Authorization", "").split(" ", 1)[0]
        relevant["Authorization"] = f"{scheme} <REDACTED>"
    return relevant


def _parse_request_body(request):
    try:
        raw_bytes = request.body
    except Exception as exc:
        return f"<unreadable body: {exc}>", None

    if not raw_bytes:
        return None, None

    text = raw_bytes.decode("utf-8", errors="replace").strip()
    if not text:
        return None, None

    content_type = (request.content_type or "").lower()
    if "application/x-www-form-urlencoded" in content_type:
        parsed_form = {
            k: (v[0] if len(v) == 1 else v)
            for k, v in parse_qs(text, keep_blank_values=True).items()
        }
        return sanitize_value(parsed_form), None

    try:
        parsed_json = json.loads(text)
        return sanitize_value(parsed_json), parsed_json
    except ValueError:
        return text, None


def _extract_rpc_summary(parsed_json) -> list[dict]:
    if parsed_json is None:
        return []
    messages = parsed_json if isinstance(parsed_json, list) else [parsed_json]
    summaries = []
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        method = msg.get("method")
        if not method:
            continue
        params = msg.get("params") if isinstance(msg.get("params"), dict) else {}
        entry = {
            "method": method,
            "id": msg.get("id"),
        }
        if method == "tools/call":
            entry["tool"] = params.get("name")
            entry["arguments"] = sanitize_value(params.get("arguments", {}))
        elif method == "initialize":
            client_info = params.get("clientInfo") or {}
            if client_info:
                entry["clientInfo"] = client_info
            if params.get("protocolVersion"):
                entry["protocolVersion"] = params.get("protocolVersion")
        summaries.append(entry)
    return summaries


def _parse_response_payload(response):
    if getattr(response, "streaming", False):
        return "<streaming response>", False

    content_bytes = getattr(response, "content", b"") or b""
    if not content_bytes:
        return None, False

    content_type = (response.get("Content-Type") or "").lower()
    text = content_bytes.decode("utf-8", errors="replace").strip()
    if not text:
        return None, False

    has_rpc_error = False

    if "text/event-stream" in content_type or text.startswith("event:") or "\ndata:" in text:
        events = []
        for line in text.splitlines():
            if line.startswith("data:"):
                raw_data = line[5:].strip()
                if not raw_data:
                    continue
                try:
                    parsed = json.loads(raw_data)
                    if isinstance(parsed, dict):
                        if parsed.get("error"):
                            has_rpc_error = True
                        result = parsed.get("result")
                        if isinstance(result, dict) and result.get("isError"):
                            has_rpc_error = True
                    events.append(sanitize_value(parsed))
                except ValueError:
                    events.append(raw_data)
        if events:
            return (events[0] if len(events) == 1 else events), has_rpc_error

    try:
        parsed = json.loads(text)
        items = parsed if isinstance(parsed, list) else [parsed]
        for item in items:
            if isinstance(item, dict):
                if item.get("error"):
                    has_rpc_error = True
                result = item.get("result")
                if isinstance(result, dict) and result.get("isError"):
                    has_rpc_error = True
        return sanitize_value(parsed), has_rpc_error
    except ValueError:
        if "text/html" in content_type:
            return f"<HTML response ({len(content_bytes)} bytes)>", False
        return text, False


def _resolve_actor_details(request) -> dict:
    user = getattr(request, "user", None)
    details = {
        "user": "anonymous",
        "user_id": None,
        "role": None,
        "auth_type": "none",
        "oauth_client": None,
        "scope": None,
    }

    if user is not None and getattr(user, "is_authenticated", False):
        role_obj = getattr(user, "role", None)
        details.update(
            {
                "user": getattr(user, "username", str(user)),
                "user_id": getattr(user, "pk", None),
                "role": getattr(role_obj, "role_name", None) if role_obj else None,
                "auth_type": "session",
            }
        )

    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        raw_token = auth_header.split(" ", 1)[1].strip()
        if raw_token:
            try:
                from oauth2_provider.models import get_access_token_model

                AccessToken = get_access_token_model()
                checksum = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
                token_obj = (
                    AccessToken.objects.select_related("user", "user__role", "application")
                    .filter(token_checksum=checksum)
                    .first()
                )
                if token_obj is None:
                    token_obj = (
                        AccessToken.objects.select_related("user", "user__role", "application")
                        .filter(token=raw_token)
                        .first()
                    )
                if token_obj is not None:
                    details["auth_type"] = "oauth2_bearer"
                    details["scope"] = token_obj.scope
                    if token_obj.application:
                        details["oauth_client"] = (
                            token_obj.application.name or token_obj.application.client_id
                        )
                    if token_obj.user:
                        role_obj = getattr(token_obj.user, "role", None)
                        details["user"] = token_obj.user.username
                        details["user_id"] = token_obj.user.pk
                        details["role"] = (
                            getattr(role_obj, "role_name", None) if role_obj else None
                        )
                else:
                    details["auth_type"] = "oauth2_bearer_unrecognized"
            except Exception as exc:
                details["auth_lookup_error"] = str(exc)

    return details


def log_mcp_http_exchange(request, response, duration_ms: float, exc: Exception | None = None):
    """Log an MCP or OAuth request/response exchange with full structured context."""
    max_chars = int(getattr(settings, "MCP_LOG_MAX_BODY_CHARS", 16000))
    request_id = getattr(request, "_mcp_log_id", None) or uuid.uuid4().hex[:10]
    actor = _resolve_actor_details(request)

    req_payload = getattr(request, "_mcp_parsed_body", None)
    rpc_items = getattr(request, "_mcp_rpc_summary", None) or []

    status_code = getattr(response, "status_code", 500 if exc else 0)
    session_id = (
        (response.get("Mcp-Session-Id") if response is not None else None)
        or request.headers.get("Mcp-Session-Id")
        or "-"
    )

    resp_payload, has_rpc_error = (
        _parse_response_payload(response) if response is not None else (None, False)
    )

    rpc_label = ""
    if rpc_items:
        parts = []
        for item in rpc_items:
            if item.get("tool"):
                parts.append(f"{item['method']}:{item['tool']}(id={item.get('id')})")
            else:
                parts.append(f"{item['method']}(id={item.get('id')})")
        rpc_label = " | rpc=" + ",".join(parts)

    meta = {
        "request_id": request_id,
        "ip": _get_client_ip(request),
        "host": request.get_host() if hasattr(request, "get_host") else "",
        "scheme": request.scheme,
        "query": _extract_sanitized_query(request),
        "headers": _extract_sanitized_headers(request),
        "actor": actor,
        "session_id": session_id,
        "status_code": status_code,
        "duration_ms": round(duration_ms, 2),
    }
    if response is not None and response.get("Location"):
        meta["redirect_location"] = response.get("Location").split("?")[0]

    lines = [
        (
            f"MCP_HTTP | {status_code} | {duration_ms:.1f}ms | {request.method} {request.path}"
            f" | user={actor['user']} (id={actor['user_id']}, role={actor['role']})"
            f" | client={actor['oauth_client'] or '-'}"
            f"{rpc_label}"
            f" | session={session_id} | req={request_id}"
        ),
        f"  meta: {_format_json_or_text(meta, max_chars)}",
    ]

    if req_payload is not None:
        lines.append(f"  request_payload: {_format_json_or_text(req_payload, max_chars)}")
    if resp_payload is not None:
        lines.append(f"  response_payload: {_format_json_or_text(resp_payload, max_chars)}")
    if exc is not None:
        lines.append(f"  exception: {type(exc).__name__}: {exc}")

    message = "\n".join(lines)

    if exc is not None or status_code >= 500:
        mcp_logger.error(message, exc_info=exc)
    elif status_code >= 400 or has_rpc_error:
        mcp_logger.warning(message)
    else:
        mcp_logger.info(message)


def prepare_mcp_request_capture(request):
    """Capture and parse request body metadata before the view consumes/runs."""
    request._mcp_log_id = uuid.uuid4().hex[:10]
    request._mcp_start_ns = time.perf_counter()
    req_payload, parsed_json = _parse_request_body(request)
    request._mcp_parsed_body = req_payload
    request._mcp_rpc_summary = _extract_rpc_summary(parsed_json)
