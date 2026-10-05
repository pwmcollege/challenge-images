import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => {
    const target = process.env["GEOSINT_API_TARGET"] ?? "http://127.0.0.1:8000";

    return {
        base: command === "build" ? "./" : "/",
        plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
        publicDir: false,
        server: { proxy: { "/api": target, "/media": target } },
        build: {
            assetsDir: "static/assets",
            modulePreload: { polyfill: false },
            sourcemap: false,
            rolldownOptions: {
                output: { comments: { legal: true } },
            },
        },
    };
});
