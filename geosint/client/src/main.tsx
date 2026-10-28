import { domMax, LazyMotion, MotionConfig } from "motion/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const root = document.getElementById("root");

if (!root) {
    throw new Error("Root element is missing");
}

createRoot(root).render(
    <StrictMode>
        <LazyMotion features={domMax} strict>
            <MotionConfig reducedMotion="user">
                <App />
            </MotionConfig>
        </LazyMotion>
    </StrictMode>,
);
