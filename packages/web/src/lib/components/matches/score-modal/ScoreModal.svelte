<script lang="ts" context="module">
    type OpenMap = Writable<Record<string, boolean>>;
    export const SM_OPEN_SECTIONS = {} as Record<Season, OpenMap>;
    for (let season of ALL_SEASONS) {
        SM_OPEN_SECTIONS[season] = writable({});
    }
</script>

<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { FullMatchFragment } from "../../../graphql/generated/graphql-operations";
    import Modal from "../../Modal.svelte";
    import type { RemoteScoresTy, TradScoresTy } from "../MatchScore.svelte";
    import RemoteScores from "./RemoteScores.svelte";
    import TradScores from "./TradScores.svelte";
    import { writable, type Writable } from "svelte/store";
    import { ALL_SEASONS, type Season } from "@ftc-scout/common";

    export let shown = false;
    export let match: FullMatchFragment | null = null;

    $: scores = match?.scores;
    $: matchDescription = match?.description;
    $: level = match?.tournamentLevel;

    $: trad = scores != null && "red" in scores ? (scores as TradScoresTy) : null;
    $: remote = scores != null && !("red" in scores) ? (scores as RemoteScoresTy) : null;

    let dispatch = createEventDispatcher();
</script>

{#if match && scores && matchDescription}
    <Modal
        bind:shown
        titleText="Match {match.description}"
        close={() => {
            shown = false;
            dispatch("close");
        }}
    >
        {#if match.videoEmbedURL}
            <div class="video">
                <iframe
                    src={match.videoEmbedURL}
                    title="Video for match {match.description}"
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowfullscreen
                />
            </div>
        {/if}
        {#if trad}
            <TradScores scores={trad} {matchDescription} teams={match.teams} {level} />
        {:else if remote}
            <RemoteScores
                scores={remote}
                {matchDescription}
                teams={match.teams}
                teamNumber={match.teams[0].teamNumber}
            />
        {/if}
    </Modal>
{/if}

<style>
    .video {
        width: min(800px, 80vw);
        aspect-ratio: 16 / 9;
        margin-bottom: var(--lg-gap);
    }

    iframe {
        width: 100%;
        border-radius: 15px;

        height: 100%;
        border: 0;
    }
</style>
