import { Season, groupBy } from "@ftc-scout/common";
import {
    clipsByFtcScoutMatchId,
    getClipfarmEvent,
    getClipfarmEvents,
} from "../../clipfarm/get-event-clips";
import { DATA_SOURCE } from "../data-source";
import { Event } from "../entities/Event";
import { Match } from "../entities/Match";

export async function loadMatchVideos(season: Season) {
    console.info(`Loading match videos for season ${season}.`);

    const events = await Event.find({
        where: { season },
        select: ["season", "code", "divisionCode", "start"],
    });
    const eventsByParent = groupBy(events, (event) => event.divisionCode ?? event.code);
    const ClipfarmEvents = await getClipfarmEvents();
    if (!ClipfarmEvents) return;
    const availableEvents = new Set(ClipfarmEvents.map((event) => `${event.season}/${event.code}`));
    let imported = 0;

    const parentEvents = Object.entries(eventsByParent).sort(
        ([, left], [, right]) => right.length - left.length
    );
    for (const [parentCode, childEvents] of parentEvents) {
        const eventYear = new Date(childEvents[0].start).getUTCFullYear();
        if (!availableEvents.has(`${eventYear}/${parentCode}`)) continue;
        const ClipfarmEvent = await getClipfarmEvent(eventYear, parentCode);
        if (!ClipfarmEvent) continue;

        await DATA_SOURCE.transaction(async (em) => {
            for (const division of ClipfarmEvent.divisions) {
                if (!childEvents.some((event) => event.code === division.division.code)) continue;

                const matches = await em.find(Match, {
                    where: { eventSeason: season, eventCode: division.division.code },
                    select: ["id", "tournamentLevel"],
                });
                const clipsByMatchId = clipsByFtcScoutMatchId(division.clips, matches);

                for (const [matchId, clip] of clipsByMatchId) {
                    const result = await em.update(
                        Match,
                        {
                            eventSeason: season,
                            eventCode: division.division.code,
                            id: matchId,
                        },
                        {
                            videoType: clip.type,
                            videoURL: clip.url,
                            videoEmbedURL: clip.embedUrl,
                            videoClipfarmURL: clip.openInClipfarmUrl,
                        }
                    );
                    imported += result.affected ?? 0;
                }
            }
        });
    }

    console.info(`Finished loading ${imported} match videos.`);
}
