export const el = {
    pano: document.getElementById("pano"),
    toast: document.getElementById("toast"),
    dock: document.getElementById("mapdock"),
    map: document.getElementById("map"),
    expand: document.getElementById("btn-expand"),
    coordEntry: document.getElementById("coord-entry"),
    coordToggle: document.getElementById("btn-coord"),
    coordApply: document.getElementById("btn-coord-apply"),
    coordInput: document.getElementById("coord-input"),
    zoomIn: document.getElementById("btn-zoom-in"),
    zoomOut: document.getElementById("btn-zoom-out"),
    panoIn: document.getElementById("btn-pano-in"),
    panoOut: document.getElementById("btn-pano-out"),
    panoControls: document.querySelector(".pano-controls"),
    loader: document.getElementById("loader"),
    loaderTitle: document.getElementById("loader-title"),
    loaderDetail: document.getElementById("loader-detail"),
    loaderBar: document.getElementById("loader-bar"),
    guess: document.getElementById("btn-guess"),
    reset: document.getElementById("btn-reset"),
    mapHide: document.getElementById("btn-map-hide"),
    mapShow: document.getElementById("btn-map-show"),
    curtain: document.getElementById("curtain"),
    distance: document.getElementById("result-distance"),
    flagField: document.getElementById("flag-field"),
    flag: document.getElementById("flag-box"),
    copy: document.getElementById("btn-copy"),
    next: document.getElementById("btn-next"),
};

export function renderIcons(root) {
    if (window.lucide) {
        window.lucide.createIcons({ nameAttr: "data-lucide", root });
    }
}

export function setIcon(button, name) {
    const icon = document.createElement("i");

    icon.dataset.lucide = name;
    icon.setAttribute("aria-hidden", "true");
    button.replaceChildren(icon);
    renderIcons(button);
}

export function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add("show", "bad");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () {
        el.toast.classList.remove("show");
    }, 3400);
}
