#!/usr/local/bin/python -I

import json
import math
import threading
import time
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_file

from media import Media


def finite_number(value):
    if isinstance(value, bool):
        raise ValueError("Expected a number.")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError("Expected a finite number.")
    return number


def distance_km(lat, lon, target_lat, target_lon):
    h = (
        math.sin(math.radians(lat - target_lat) / 2) ** 2
        + math.cos(math.radians(target_lat))
        * math.cos(math.radians(lat))
        * math.sin(math.radians(lon - target_lon) / 2) ** 2
    )
    return 2 * 6371.0088 * math.asin(math.sqrt(min(1, max(0, h))))


def load_config():
    config = json.loads(Path("/challenge/config.json").read_text())
    if not isinstance(config, dict):
        raise ValueError("Challenge config must be an object.")
    config["lat"] = finite_number(config["lat"])
    config["lon"] = finite_number(config["lon"])
    config["tolerance_km"] = finite_number(config.get("tolerance_km", 1))
    if not (
        -90 <= config["lat"] <= 90
        and -180 <= config["lon"] <= 180
        and config["tolerance_km"] > 0
    ):
        raise ValueError("Invalid challenge coordinates or tolerance.")
    return config


def load_flag():
    flag = Path("/flag").read_text().strip()
    if not flag:
        raise ValueError("Flag is empty.")
    return flag


app = Flask(__name__, static_folder="../client/dist/static", static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = 4096

lock = threading.Lock()
game = {"result": None, "last_guess": 0.0}

CONFIG = load_config()
MEDIA = Media(Path("/challenge/media"), CONFIG.get("kind"))
FLAG = load_flag()


def public_state():
    result = game["result"]
    state = {"solved": result is not None, "media": MEDIA.state}
    if result is not None:
        state.update(
            answer={"lat": CONFIG["lat"], "lon": CONFIG["lon"]}, flag=FLAG, **result
        )
    return state


@app.after_request
def cache_policy(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    if request.path.startswith(("/api/", "/media/")):
        response.headers["Cache-Control"] = "no-store, max-age=0"
    elif request.path.startswith("/static/assets/") and response.status_code in (
        200,
        304,
    ):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif request.path.startswith("/static/"):
        response.headers["Cache-Control"] = "public, max-age=3600"
    else:
        response.headers["Cache-Control"] = "private, no-cache, max-age=0"
    return response


@app.get("/")
def asset():
    return send_file(Path(app.static_folder).parent / "index.html")


@app.get("/api/state")
def state():
    with lock:
        return jsonify(public_state())


@app.post("/api/reset")
def reset():
    with lock:
        game["result"] = None
        return jsonify(public_state())


@app.post("/api/guess")
def guess():
    body = request.get_json(silent=True) or {}
    try:
        guess_lat = finite_number(body["lat"])
        guess_lon = finite_number(body["lon"])
    except (KeyError, TypeError, ValueError, OverflowError):
        return jsonify(error="Latitude and longitude are required."), 400
    if not -90 <= guess_lat <= 90 or not -180 <= guess_lon <= 180:
        return jsonify(error="Coordinates are out of range."), 400

    with lock:
        if game["result"] is not None:
            return jsonify(error="Already solved."), 409
        now = time.monotonic()
        wait = 1 - (now - game["last_guess"])
        if wait > 0:
            return jsonify(
                error="Too many guesses. Try again.", retry_after=round(wait, 2)
            ), 429
        game["last_guess"] = now
        distance = distance_km(guess_lat, guess_lon, CONFIG["lat"], CONFIG["lon"])
        if distance > CONFIG["tolerance_km"]:
            return jsonify(outcome="wrong", state=public_state())
        game["result"] = {
            "guess": {"lat": guess_lat, "lon": guess_lon},
            "distance_km": round(distance, 3),
        }
        return jsonify(outcome="correct", state=public_state())


@app.errorhandler(413)
def request_too_large(error):
    return jsonify(error="Request body is too large."), 413


@app.get("/media/<media_id>/<path:name>")
def media_file(media_id, name):
    if f"media/{media_id}" != MEDIA.base_url or name not in MEDIA.files:
        abort(404)
    return send_file(MEDIA.files[name], conditional=False, etag=False)


application = app
