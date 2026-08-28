export function formatDistance(km) {
    if (km < 1) {
        return Math.round(km * 1000) + " m";
    }
    if (km < 100) {
        return km.toFixed(1) + " km";
    }
    return Math.round(km).toLocaleString() + " km";
}

export function greatCircle(from, to) {
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const lat1 = from.lat * toRad;
    const lon1 = from.lon * toRad;
    const lat2 = to.lat * toRad;
    const lon2 = to.lon * toRad;
    const d =
        2 *
        Math.asin(
            Math.sqrt(
                Math.sin((lat2 - lat1) / 2) ** 2 +
                    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
            ),
        );
    if (!d) {
        return [
            [from.lat, from.lon],
            [to.lat, to.lon],
        ];
    }

    const points = [];
    let previousLon = null;
    let offset = 0;
    for (let i = 0; i <= 96; i++) {
        const f = i / 96;
        const a = Math.sin((1 - f) * d) / Math.sin(d);
        const b = Math.sin(f * d) / Math.sin(d);
        const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
        const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
        const z = a * Math.sin(lat1) + b * Math.sin(lat2);
        let lon = Math.atan2(y, x) * toDeg;
        if (previousLon !== null && Math.abs(lon + offset - previousLon) > 180) {
            offset += lon + offset > previousLon ? -360 : 360;
        }
        lon += offset;
        previousLon = lon;
        points.push([Math.atan2(z, Math.hypot(x, y)) * toDeg, lon]);
    }
    return points;
}

export function bearing(from, to) {
    const toRad = Math.PI / 180;
    const dLon = (to.lon - from.lon) * toRad;
    const lat1 = from.lat * toRad;
    const lat2 = to.lat * toRad;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function offsetReadout(km, guess, answer) {
    if (km < 0.002) {
        return "On target.";
    }
    const compass = [
        "north",
        "north-east",
        "east",
        "south-east",
        "south",
        "south-west",
        "west",
        "north-west",
    ];
    const heading = compass[Math.round(bearing(answer, guess) / 45) % 8];
    return formatDistance(km) + " " + heading + " of the target.";
}

export function formatBytes(bytes) {
    if (bytes < 1024 * 1024) {
        return Math.round(bytes / 1024) + " KB";
    }
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

export function parseCoordinates(text) {
    const input = String(text || "").trim();
    if (!input) {
        return null;
    }

    const pattern =
        /(\d+(?:\.\d+)?)\s*[°d:]\s*(?:(\d+(?:\.\d+)?)\s*['′m:]\s*)?(?:(\d+(?:\.\d+)?)\s*["″s]?\s*)?([NSEW])?/gi;
    const dms = [...input.matchAll(pattern)].filter(function (m) {
        return m[2] !== undefined || m[4];
    });

    if (dms.length >= 2) {
        const values = dms.slice(0, 2).map(function (m) {
            const decimal = Number(m[1]) + Number(m[2] || 0) / 60 + Number(m[3] || 0) / 3600;
            const hemisphere = (m[4] || "").toUpperCase();
            return {
                value: "SW".includes(hemisphere) ? -decimal : decimal,
                hemisphere: hemisphere,
            };
        });
        let first = values[0];
        let second = values[1];
        if ("EW".includes(first.hemisphere) || "NS".includes(second.hemisphere)) {
            [first, second] = [second, first];
        }
        return finite(first.value, second.value);
    }

    const numbers = input.match(/-?\d+(?:\.\d+)?/g);
    if (!numbers || numbers.length < 2) {
        return null;
    }
    return finite(Number(numbers[0]), Number(numbers[1]));
}

export function finite(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
    }
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        return null;
    }
    return { lat: lat, lon: lon };
}
