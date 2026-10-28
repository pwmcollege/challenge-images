import { type Ref, useEffect, useEffectEvent, useImperativeHandle, useRef } from "react";
import {
    createMedia,
    type LoadingState,
    type MediaConfig,
    type MediaController,
    type MediaHandle,
} from "../lib/media.ts";
import type { Navigation } from "../lib/navigation.ts";

interface MediaViewerProps {
    media: MediaConfig | null;
    navigation: Navigation;
    onLoading(state: LoadingState): void;
    ref?: Ref<MediaHandle>;
}

export default function MediaViewer(
    { media, navigation, onLoading, ref }: MediaViewerProps,
) {
    const container = useRef<HTMLDivElement>(null);
    const controller = useRef<MediaController | null>(null);
    const loading = useEffectEvent((state: LoadingState) => onLoading(state));

    useImperativeHandle(ref, () => ({
        zoom(delta: number) {
            controller.current?.zoom(delta);
        },
    }), []);

    useEffect(() => {
        if (!media || !container.current) {
            return;
        }

        const view = createMedia(container.current, navigation, loading);
        controller.current = view;
        view.mount(media);

        return () => {
            controller.current = null;
            view.destroy();
        };
    }, [media, navigation]);

    return (
        <div
            id="pano"
            ref={container}
            style={{ position: "absolute" }}
            aria-label={media?.kind === "image" ? "Challenge photograph" : "360 degree panorama"}
        />
    );
}
