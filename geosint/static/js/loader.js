import { el } from "./dom.js";
import { formatBytes } from "./geo.js";

export function loaderProgress(loaded, total) {
    el.loaderBar.classList.remove("indeterminate");
    el.loaderBar.style.width = Math.round((loaded / total) * 100) + "%";
    el.loaderDetail.textContent = formatBytes(loaded) + " of " + formatBytes(total);
}

export function loaderPending(detail) {
    el.loaderBar.classList.add("indeterminate");
    el.loaderBar.style.width = "";
    el.loaderDetail.textContent = detail;
}

export function loaderDone() {
    el.loader.classList.add("done");
}

export function loaderFailed(detail) {
    el.loader.classList.remove("done");
    el.loader.classList.add("failed");
    el.loaderBar.classList.remove("indeterminate");
    el.loaderBar.style.width = "100%";
    el.loaderTitle.textContent = "Could not load imagery";
    el.loaderDetail.textContent = detail;
}

export function fetchMedia(url, onProgress) {
    return new Promise(function (resolve, reject) {
        const request = new XMLHttpRequest();
        request.open("GET", url);
        request.responseType = "blob";
        request.onprogress = function (event) {
            if (event.lengthComputable) {
                onProgress(event.loaded, event.total);
            }
        };
        request.onload = function () {
            if (request.status >= 200 && request.status < 300) {
                resolve(URL.createObjectURL(request.response));
            } else {
                reject(new Error("Server returned " + request.status));
            }
        };
        request.onerror = function () {
            reject(new Error("Request failed"));
        };
        request.send();
    });
}

export async function fetchAll(urls) {
    const loaded = urls.map(function () {
        return 0;
    });
    const totals = urls.map(function () {
        return 0;
    });
    return Promise.all(
        urls.map(function (url, index) {
            return fetchMedia(url, function (bytes, total) {
                loaded[index] = bytes;
                totals[index] = total;
                const sum = function (a, b) {
                    return a + b;
                };
                loaderProgress(loaded.reduce(sum, 0), totals.reduce(sum, 0));
            });
        }),
    );
}
