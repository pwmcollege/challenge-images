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
    onError?(error: Error): void;
    ref?: Ref<MediaHandle>;
}

export default function MediaViewer(
    { media, navigation, onLoading, onError, ref }: MediaViewerProps,
) {
    const container = useRef<HTMLDivElement>(null);
    const controller = useRef<MediaController | null>(null);
    const loading = useEffectEvent((state: LoadingState) => onLoading(state));
    const failed = useEffectEvent((error: Error) => onError?.(error));

    useImperativeHandle(ref, () => ({
        zoom(delta: number) {
            controller.current?.zoom(delta);
        },
        fit() {
            controller.current?.fit();
        },
    }), []);

    useEffect(() => {
        if (!media || !container.current) {
            return;
        }
        const view = createMedia(container.current, navigation, loading, failed);
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
            aria-label={media?.kind === "image" ? "Challenge photograph" : "360 degree panorama"}
        />
    );
}
