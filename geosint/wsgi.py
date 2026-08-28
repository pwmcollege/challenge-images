#!/usr/local/bin/python -I

import json
import math
import mimetypes
import os
import secrets
import threading
import time
from pathlib import Path

from flask import Flask, Response, abort, jsonify, render_template, request

app = Flask(__name__)

MEDIA = Path("/challenge/media")
CONFIG = json.loads(Path("/challenge/config.json").read_text())

LAT = float(CONFIG["lat"])
LON = float(CONFIG["lon"])
TOLERANCE = float(CONFIG.get("tolerance_km", 1))
MEDIA_ID = secrets.token_hex(16)

lock = threading.Lock()
solved = False
result = None
last_guess = 0.0


def strip_jpeg(data):
    out = bytearray(data[:2])
    i = 2
    while i + 4 <= len(data) and data[i] == 0xFF:
        marker = data[i + 1]
        if marker == 0xDA:
            out += data[i:]
            return bytes(out)
        end = i + 2 + int.from_bytes(data[i + 2 : i + 4], "big")
        if marker != 0xFE and not (0xE0 <= marker <= 0xEF and marker != 0xEE):
            out += data[i:end]
        i = end
    return bytes(out)


def strip_png(data):
    out = bytearray(data[:8])
    i = 8
    while i + 8 <= len(data):
        end = i + 12 + int.from_bytes(data[i : i + 4], "big")
        if data[i + 4 : i + 8] not in (b"tEXt", b"iTXt", b"zTXt", b"eXIf", b"tIME"):
            out += data[i:end]
        i = end
    return bytes(out)


def strip(data):
    if data[:2] == b"\xff\xd8":
        return strip_jpeg(data)
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return strip_png(data)
    return data


def jpeg_size(data):
    i = 2
    while i + 9 <= len(data) and data[i] == 0xFF:
        marker = data[i + 1]
        if marker == 0xDA:
            return None
        if marker in (
            0xC0,
            0xC1,
            0xC2,
            0xC3,
            0xC5,
            0xC6,
            0xC7,
            0xC9,
            0xCA,
            0xCB,
            0xCD,
            0xCE,
            0xCF,
        ):
            return (
                int.from_bytes(data[i + 7 : i + 9], "big"),
                int.from_bytes(data[i + 5 : i + 7], "big"),
            )
        i += 2 + int.from_bytes(data[i + 2 : i + 4], "big")
    return None


def image_size(data):
    if data[:2] == b"\xff\xd8":
        return jpeg_size(data)
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return (int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big"))
    return None


def media_files():
    return sorted(path for path in MEDIA.iterdir() if path.is_file())


def detect_kind():
    if (MEDIA / "multires").is_dir():
        return "multires"

    files = media_files()
    if set("fbudlr") <= {path.stem.lower() for path in files}:
        return "cubemap"

    if len(files) == 1:
        size = image_size(files[0].read_bytes())
        if size and abs(size[0] - 2 * size[1]) <= 2:
            return "equirectangular"

    return "image"


def served_media():
    if KIND == "multires":
        return {}

    files = media_files()
    if KIND == "cubemap":
        faces = {path.stem.lower(): path for path in files}
        return {f"{face}{faces[face].suffix}": faces[face] for face in "fbudlr"}

    source = files[0]
    return {("image" if KIND == "image" else "pano") + source.suffix: source}


KIND = CONFIG.get("kind") or detect_kind()
SERVED = served_media()
FLAG = open("/flag").read().strip() if os.geteuid() == 0 else "pwn.college{fake_flag}"


def media():
    base = f"media/{MEDIA_ID}"

    if KIND == "multires":
        multires = json.loads((MEDIA / "multires" / "config.json").read_text())
        multires = dict(multires.get("multiRes", multires))
        path = multires.get("basePath", "").strip("/")
        multires["basePath"] = f"{base}/multires/{path}".rstrip("/")
        return {"kind": "pano", "type": "multires", "multiRes": multires}

    names = list(SERVED)

    if KIND == "cubemap":
        return {
            "kind": "pano",
            "type": "cubemap",
            "faces": [f"{base}/{name}" for name in names],
        }

    if KIND == "image":
        return {"kind": "image", "url": f"{base}/{names[0]}"}
    return {"kind": "pano", "type": "equirectangular", "url": f"{base}/{names[0]}"}


def public_state():
    if not solved:
        return {"solved": False, "media": media()}
    return {
        "solved": True,
        "media": media(),
        "answer": {"lat": LAT, "lon": LON},
        "guess": result["guess"],
        "distance_km": result["distance_km"],
        "flag": FLAG,
    }


def distance_km(lat, lon):
    phi1, phi2 = math.radians(LAT), math.radians(lat)
    dphi = math.radians(lat - LAT)
    dlambda = math.radians(lon - LON)
    h = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * 6371.0088 * math.asin(math.sqrt(h))


@app.after_request
def cache_policy(response):
    if request.path.startswith(("/api/", "/media/")):
        response.headers["Cache-Control"] = "no-store, max-age=0"
    elif request.path.startswith("/static/js/"):
        response.headers["Cache-Control"] = "no-cache"
    elif request.path.startswith("/static/"):
        response.headers["Cache-Control"] = "public, max-age=3600"
    else:
        response.headers["Cache-Control"] = "private, no-cache, max-age=0"
    return response


@app.template_global()
def asset(path):
    try:
        version = int((Path(app.static_folder) / path).stat().st_mtime)
    except OSError:
        version = 0
    return f"static/{path}?v={version}"


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/state")
def state():
    with lock:
        return jsonify(public_state())


@app.route("/api/reset", methods=["POST"])
def reset():
    global solved, result
    with lock:
        solved = False
        result = None
        return jsonify(public_state())


@app.route("/api/guess", methods=["POST"])
def guess():
    global solved, result, last_guess

    body = request.get_json(silent=True) or {}
    try:
        lat = float(body["lat"])
        lon = float(body["lon"])
    except (KeyError, TypeError, ValueError):
        return jsonify({"error": "lat and lon required"}), 400
    if not -90 <= lat <= 90 or not -180 <= lon <= 180:
        return jsonify({"error": "coordinates out of range"}), 400

    with lock:
        if solved:
            return jsonify({"error": "already solved"}), 409

        now = time.monotonic()
        wait = 1 - (now - last_guess)
        if wait > 0:
            return jsonify({"error": "too fast", "retry_after": round(wait, 2)}), 429

        last_guess = now
        distance = distance_km(lat, lon)

        if distance > TOLERANCE:
            return jsonify({"outcome": "wrong", "state": public_state()})

        solved = True
        result = {"guess": {"lat": lat, "lon": lon}, "distance_km": round(distance, 3)}
        return jsonify({"outcome": "correct", "state": public_state()})


@app.route("/media/<media_id>/<path:name>")
def media_file(media_id, name):
    if media_id != MEDIA_ID:
        abort(404)

    if KIND == "multires":
        if not name.startswith("multires/"):
            abort(404)
        path = (MEDIA / name).resolve()
        if not path.is_file() or MEDIA.resolve() not in path.parents:
            abort(404)
    else:
        path = SERVED.get(name)
        if path is None:
            abort(404)

    mimetype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return Response(strip(path.read_bytes()), mimetype=mimetype)


application = app
