import type { Coordinates } from "./lib/geo.ts";
import type { MediaConfig } from "./lib/media.ts";

export type UnsolvedState = { solved: false; media: MediaConfig };

export type SolvedState = {
    solved: true;
    media: MediaConfig;
    guess: Coordinates;
    answer: Coordinates;
    distance_km: number;
    flag: string;
};

export type ChallengeState = UnsolvedState | SolvedState;

export type GuessResponse =
    | { outcome: "wrong"; state: UnsolvedState }
    | { outcome: "correct"; state: SolvedState };
