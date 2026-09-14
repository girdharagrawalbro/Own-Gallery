"""HTTP responses for media bytes with correct Range, caching and HEAD support."""

import re
import urllib.parse

from django.db import connections
from django.http import HttpResponse, StreamingHttpResponse

_RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")

# Media bytes never change for a given URL (URLs rotate with their signature).
CACHE_CONTROL = "private, max-age=604800, immutable"


class RangeNotSatisfiable(Exception):
    pass


def release_db_connections():
    """Return DB connections to the pool before a potentially long stream starts."""
    for connection in connections.all(initialized_only=True):
        if not connection.in_atomic_block:
            connection.close_if_unusable_or_obsolete()


def parse_range(header, size):
    """Return an inclusive (start, end) tuple, or None to send the whole file.

    Multi-range and malformed headers are ignored (full response), as allowed by RFC 9110.
    """
    if not header or size <= 0:
        return None
    match = _RANGE_RE.match(header.strip())
    if not match:
        return None
    first, last = match.groups()
    if first == "" and last == "":
        return None
    if first == "":
        # Suffix range: the last N bytes.
        length = int(last)
        if length == 0:
            raise RangeNotSatisfiable()
        return max(size - length, 0), size - 1
    start = int(first)
    end = int(last) if last else size - 1
    if start >= size or end < start:
        raise RangeNotSatisfiable()
    return start, min(end, size - 1)


def _primed(chunks):
    """Fetch the first chunk now so storage errors become a 502, not a truncated 200."""
    iterator = iter(chunks)
    try:
        first = next(iterator)
    except StopIteration:
        return iter(())

    def generator():
        try:
            yield first
            yield from iterator
        finally:
            close = getattr(iterator, "close", None)
            if close:
                close()

    return generator()


def content_disposition(disposition, filename):
    quoted = urllib.parse.quote(filename.encode("utf-8"))
    return f"{disposition}; filename*=utf-8''{quoted}"


def _base_headers(response, etag, filename, disposition):
    response["Accept-Ranges"] = "bytes"
    response["Cache-Control"] = CACHE_CONTROL
    if etag:
        response["ETag"] = etag
    if filename:
        response["Content-Disposition"] = content_disposition(disposition, filename)


def not_modified(request, etag):
    if etag and etag in request.META.get("HTTP_IF_NONE_MATCH", ""):
        response = HttpResponse(status=304)
        response["ETag"] = etag
        response["Cache-Control"] = CACHE_CONTROL
        return response
    return None


def ranged_response(request, *, size, open_range, content_type, filename=None,
                    disposition="inline", etag=None):
    """Build a 200/206/304/416 response.

    `open_range(start, end)` must return an iterator yielding exactly bytes start..end.
    It is only called when a body is actually sent.
    """
    cached = not_modified(request, etag)
    if cached:
        return cached

    try:
        byte_range = parse_range(request.META.get("HTTP_RANGE"), size)
    except RangeNotSatisfiable:
        response = HttpResponse(status=416)
        response["Content-Range"] = f"bytes */{size}"
        return response

    if byte_range and request.META.get("HTTP_IF_RANGE") not in (None, etag):
        byte_range = None  # the client's partial copy is stale

    start, end = byte_range if byte_range else (0, max(size - 1, 0))
    length = end - start + 1 if size else 0
    status = 206 if byte_range else 200

    if request.method == "HEAD" or length == 0:
        response = HttpResponse(status=status, content_type=content_type)
    else:
        release_db_connections()
        response = StreamingHttpResponse(_primed(open_range(start, end)), status=status, content_type=content_type)

    response["Content-Length"] = str(length)
    if byte_range:
        response["Content-Range"] = f"bytes {start}-{end}/{size}"
    _base_headers(response, etag, filename, disposition)
    return response


def bytes_response(request, data, *, content_type, filename=None, etag=None):
    cached = not_modified(request, etag)
    if cached:
        return cached
    response = HttpResponse(b"" if request.method == "HEAD" else data, content_type=content_type)
    response["Content-Length"] = str(len(data))
    _base_headers(response, etag, filename, "inline")
    return response
