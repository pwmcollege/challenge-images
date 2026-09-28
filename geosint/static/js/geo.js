function formatDistance(km) {
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
    const h = Math.sin((lat2 - lat1) / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2;
    const d = 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
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

function bearing(from, to) {
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
    return (
        formatDistance(km) +
        " " +
        compass[Math.round(bearing(answer, guess) / 45) % 8] +
        " of the target."
    );
}

export function formatBytes(bytes) {
    if (bytes < 1024 * 1024) {
        return Math.round(bytes / 1024) + " KB";
    }
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

export function parseCoordinates(text) {
    const input = String(text || "").trim();
    const pattern =
        /([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\s*[°d:]\s*(?:(\d+(?:\.\d+)?)\s*['′m:]\s*(?:(\d+(?:\.\d+)?)\s*["″s]?)?)?)?/iy;
    const values = [];
    let position = 0;

    for (let index = 0; index < 2; index++) {
        const prefix = input.slice(position).match(/^([NSWE])\s*/i);
        pattern.lastIndex = position + (prefix ? prefix[0].length : 0);
        const match = pattern.exec(input);
        if (!match) {
            return null;
        }
        position = pattern.lastIndex;
        const suffix = !prefix && input.slice(position).match(/^\s*([NSWE])/i);
        if (suffix) {
            position += suffix[0].length;
        }
        const hemisphere = (prefix?.[1] || suffix?.[1] || "").toUpperCase();
        const minutes = Number(match[2] || 0);
        const seconds = Number(match[3] || 0);
        if (minutes >= 60 || seconds >= 60) {
            return null;
        }
        const negative = match[1].startsWith("-");
        if (
            (negative && /^[NE]$/.test(hemisphere)) ||
            (match[1].startsWith("+") && /^[SW]$/.test(hemisphere))
        ) {
            return null;
        }
        const sign = negative || /^[SW]$/.test(hemisphere) ? -1 : 1;
        values.push({
            value: sign * (Math.abs(Number(match[1])) + minutes / 60 + seconds / 3600),
            axis: /^[NS]$/.test(hemisphere) ? "lat" : /^[EW]$/.test(hemisphere) ? "lon" : null,
        });
        if (index === 0) {
            const separator = input.slice(position).match(/^(?:\s*[,;]\s*|\s+)/);
            if (separator) {
                position += separator[0].length;
            } else if (!hemisphere && !/\s$/.test(match[0])) {
                return null;
            }
        }
    }
    if (position !== input.length) {
        return null;
    }
    let [first, second] = values;
    if (first.axis && first.axis === second.axis) {
        return null;
    }
    if (first.axis === "lon" || second.axis === "lat") {
        [first, second] = [second, first];
    }
    return finite(first.value, second.value);
}

function finite(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return null;
    }
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        return null;
    }
    return { lat, lon };
}
