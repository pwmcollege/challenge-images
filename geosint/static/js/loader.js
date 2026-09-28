import { formatBytes } from "./geo.js";

export function createLoader(el) {
    function loaderProgress(loaded, total) {
        el.loaderBar.classList.remove("indeterminate");
        el.loaderBar.style.width = Math.min(100, Math.round((loaded / Math.max(1, total)) * 100)) +
            "%";
        el.loaderDetail.textContent = formatBytes(loaded) + " of " + formatBytes(total);
    }

    function loaderPending(detail) {
        el.loaderBar.classList.add("indeterminate");
        el.loaderBar.style.width = "";
        el.loaderDetail.textContent = detail;
    }

    function loaderDone() {
        el.loader.classList.add("done");
        el.loader.setAttribute("aria-hidden", "true");
    }

    function loaderFailed(detail) {
        el.loader.removeAttribute("aria-hidden");
        el.loader.classList.remove("done");
        el.loader.classList.add("failed");
        el.loaderBar.classList.remove("indeterminate");
        el.loaderBar.style.width = "100%";
        el.loaderTitle.textContent = "Could not load imagery";
        el.loaderDetail.textContent = detail;
    }

    function fetchMedia(url, onProgress) {
        return new Promise((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.open("GET", url);
            request.responseType = "blob";
            request.timeout = 120000;
            request.ontimeout = () => {
                reject(new Error("Imagery request timed out. Reload to try again."));
            };
            request.onprogress = (event) => {
                if (event.lengthComputable) {
                    onProgress(event.loaded, event.total);
                }
            };
            request.onload = () => {
                if (request.status >= 200 && request.status < 300) {
                    resolve(URL.createObjectURL(request.response));
                } else {
                    reject(new Error("Server returned " + request.status));
                }
            };
            request.onerror = () => {
                reject(new Error("Request failed"));
            };
            request.send();
        });
    }

    async function fetchAll(urls) {
        const loaded = urls.map(() => {
            return 0;
        });
        const totals = urls.map(() => {
            return 0;
        });
        const results = await Promise.allSettled(
            urls.map((url, index) => {
                return fetchMedia(url, (bytes, total) => {
                    loaded[index] = bytes;
                    totals[index] = total;
                    const sum = (a, b) => {
                        return a + b;
                    };
                    loaderProgress(loaded.reduce(sum, 0), totals.reduce(sum, 0));
                });
            }),
        );
        const failed = results.find((result) => {
            return result.status === "rejected";
        });
        if (failed) {
            results.forEach((result) => {
                if (result.status === "fulfilled") {
                    URL.revokeObjectURL(result.value);
                }
            });
            throw failed.reason;
        }
        return results.map((result) => {
            return result.value;
        });
    }

    return { loaderProgress, loaderPending, loaderDone, loaderFailed, fetchMedia, fetchAll };
}
