export type ClipfarmClip = {
    type: string;
    url: string;
    embedUrl: string;
    embedByMatchUrl: string;
    openInClipfarmUrl: string;
    ftcScoutMatchId: number;
    matchType: string;
};

type MatchIdentity = { id: number; tournamentLevel: string };

export function clipsByFtcScoutMatchId<T extends MatchIdentity>(
    clips: ClipfarmClip[],
    matches: T[]
): Map<number, ClipfarmClip> {
    const matchIds = new Set(matches.map((match) => match.id));
    const playoffMatches = matches
        .filter((match) => match.tournamentLevel !== "Quals")
        .sort((left, right) => left.id - right.id);
    const result = new Map<number, ClipfarmClip>();

    for (const clip of clips) {
        if (matchIds.has(clip.ftcScoutMatchId)) {
            result.set(clip.ftcScoutMatchId, clip);
            continue;
        }

        if (clip.matchType === "playoff") {
            const ordinal = (clip.ftcScoutMatchId % 10000) - 1;
            const match = playoffMatches[ordinal];
            if (match) result.set(match.id, clip);
        }
    }
    return result;
}

type ClipfarmResponse = {
    event: { code: string };
    divisions: {
        division: { code: string };
        clips: ClipfarmClip[];
    }[];
};

type ClipfarmEvent = {
    code: string;
    season: number;
};

type ClipfarmEventsResponse = [{ result: { data: { json: ClipfarmEvent[] } } }];

const CACHE_TTL_MS = 5 * 60 * 1000;
const requests = new Map<
    string,
    { expiresAt: number; response: Promise<ClipfarmResponse | null> }
>();
let eventIndexRequest: { expiresAt: number; response: Promise<ClipfarmEvent[] | null> } | null =
    null;

export async function getClipfarmEvent(eventYear: number, parentEventCode: string) {
    const events = await getClipfarmEvents();
    if (!events?.some((event) => event.season === eventYear && event.code === parentEventCode)) {
        return null;
    }

    const key = `${eventYear}/${parentEventCode}`;
    let request = requests.get(key);
    if (!request || request.expiresAt <= Date.now()) {
        request = {
            expiresAt: Date.now() + CACHE_TTL_MS,
            response: fetchClipfarmEvent(eventYear, parentEventCode),
        };
        requests.set(key, request);
    }
    return request.response;
}

export function getClipfarmEvents(): Promise<ClipfarmEvent[] | null> {
    if (!eventIndexRequest || eventIndexRequest.expiresAt <= Date.now()) {
        eventIndexRequest = {
            expiresAt: Date.now() + CACHE_TTL_MS,
            response: fetchClipfarmEvents(),
        };
    }
    return eventIndexRequest.response;
}

async function fetchClipfarmEvents(): Promise<ClipfarmEvent[] | null> {
    const input = encodeURIComponent(
        JSON.stringify({ 0: { json: null, meta: { values: ["undefined"] }, v: 1 } })
    );
    const url = `https://clipfarm.watch/api/trpc/events.getAll?batch=1&input=${input}`;
    console.info(`Making a request to ${url}`);

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Clipfarm returned HTTP ${response.status}`);
        const body = (await response.json()) as ClipfarmEventsResponse;
        const events = body?.[0]?.result?.data?.json;
        if (!Array.isArray(events)) throw new Error("Clipfarm returned an invalid event index");
        return events;
    } catch (error) {
        console.error(`Failure while making a request to ${url}.`, error);
        return null;
    }
}

async function fetchClipfarmEvent(
    eventYear: number,
    parentEventCode: string
): Promise<ClipfarmResponse | null> {
    const url = `https://clipfarm.watch/api/ftcscout/${eventYear}/${encodeURIComponent(
        parentEventCode
    )}`;
    console.info(`Making a request to ${url}`);

    try {
        const response = await fetch(url);
        if (response.status === 404) return null;
        if (!response.ok) {
            throw new Error(`Clipfarm returned HTTP ${response.status}`);
        }

        const body: unknown = await response.json();
        const normalized = normalizeClipfarmResponse(body);
        if (!normalized) {
            throw new Error("Clipfarm returned an invalid response");
        }
        return normalized;
    } catch (error) {
        console.error(`Failure while making a request to ${url}.`, error);
        return null;
    }
}

function normalizeClipfarmResponse(value: unknown): ClipfarmResponse | null {
    if (typeof value !== "object" || value == null || !("event" in value)) return null;
    const response = value as ClipfarmResponse & { clips?: ClipfarmClip[] };
    if (typeof response.event?.code !== "string") return null;

    if (Array.isArray(response.divisions)) return response;
    if (Array.isArray(response.clips)) {
        return {
            event: response.event,
            divisions: [
                {
                    division: { code: response.event.code },
                    clips: response.clips,
                },
            ],
        };
    }
    return null;
}
