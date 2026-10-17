<script lang="ts">
  import { goalWorld } from './goal-world';
  export let count = 0;
  export let seed = '';
  export let completed = false;
  export let language: 'en' | 'id' = 'en';
  let expanded = false;
  let worldDialog: HTMLDialogElement;
  function toggle() {
    if (expanded) worldDialog.close();
    else {
      expanded = true;
      worldDialog.showModal();
    }
  }
  let focus = false;
  let viewedRegion: number | undefined;
  $: world = goalWorld(seed, count, viewedRegion);
  $: visible =
    focus && expanded && world.active ? [world.active] : world.islands;
  $: label = completed
    ? language === 'id'
      ? 'Selesai'
      : 'Completed'
    : language === 'id'
      ? 'Dunia bertumbuh'
      : 'A growing world';
</script>

{#snippet scene()}
  <svg
    viewBox="0 0 320 160"
    role="img"
    aria-label={`${label} · ${count} ${language === 'id' ? 'kontribusi' : 'contributions'}`}
  >
    <path
      d="M10 89q16-5 29 0m215-16q20-5 40 0M30 144q15-5 30 0m199-12q15-5 30 0"
      stroke="#41818a"
      stroke-width="1"
      opacity=".4"
      fill="none"
    />
    {#if !count && !completed}
      <ellipse cx="160" cy="115" rx="32" ry="10" fill="#347482" opacity=".4" />
      <path d="M148 103h25l-7 7h-12Z" fill="#dcc59a" /><path
        d="M161 102V80l14 18h-14"
        fill="#e8ede1"
        stroke="#e8ede1"
      />
    {/if}
    {#each visible as island (island.id)}
      <g
        transform={(focus && expanded) || world.islands.length === 1
          ? 'translate(160 104) scale(1.8)'
          : `translate(${island.x} ${island.y})`}
      >
        <polygon
          points={island.outline}
          transform="translate(0 5) scale(1.08)"
          fill="#397582"
          opacity=".6"
        />
        <polygon
          points={island.outline}
          transform="translate(0 5)"
          fill={world.palette[1]}
        />
        <polygon points={island.outline} fill={world.palette[2]} />
        <polygon
          points={island.outline}
          transform="scale(.86)"
          fill={world.palette[0]}
        />
        {#if island.steps > 4}<path
            d="M-21 3Q-8-8 0 1T23 0"
            stroke={world.palette[2]}
            stroke-width="2"
            fill="none"
          />{/if}
        {#each island.objects as object (object.order)}
          <g
            class="construction"
            transform={`translate(${object.x} ${object.y})`}
          >
            {#if object.kind === 'tree'}
              <path d="M0 1v-6" stroke="#6e6851" stroke-width="1.2" />
              <path
                d={`M-3-3L0 ${-object.height - 4} 3-3Z`}
                fill={world.palette[1]}
              />
              <path
                d={`M0 ${-object.height - 4} 3-3H0Z`}
                fill="#c4db9a"
                opacity=".4"
              />
            {:else}
              <path
                d={`M-3 0v-${object.height}h6v${object.height}Z`}
                fill="#f2e4cd"
              />
              <path
                d={`M-4 ${-object.height}l4-3 4 3Z`}
                fill={object.accent ? world.palette[3] : '#728d9b'}
              />
              <path d="M0 0v-3h2v3" fill="#54717c" />
            {/if}
          </g>
        {/each}
      </g>
    {/each}
    {#if completed}
      <g class="landmark" transform="translate(160 90)">
        <ellipse cy="30" rx="14" ry="5" fill={world.palette[2]} />
        <path d="M-5 29-3 0H3L5 29Z" fill="#f2e4cd" /><path
          d="M-5 0h10v-6H-5Z"
          fill="#f5ce78"
        />
        <path d="M-7-6 0-12 7-6Z" fill={world.palette[3]} /><path
          d="M-2 25v-5h4v5"
          fill="#456971"
        />
        <g class="celebration" fill="#f5ce78"
          ><circle cx="-19" cy="-13" r="2" /><circle
            cx="18"
            cy="-20"
            r="2"
          /><circle cy="-28" r="2" /></g
        >
      </g>
    {/if}
  </svg>
  <span class="caption"
    >{label}<small
      >{count.toLocaleString(language)}
      {language === 'id' ? 'kontribusi' : 'contributions'} · {language === 'id'
        ? 'Kawasan'
        : 'Region'}
      {world.region + 1}</small
    ></span
  >
  <div class="controls">
    {#if expanded && world.latestRegion > 0}
      <button
        aria-label={language === 'id'
          ? 'Kawasan sebelumnya'
          : 'Previous region'}
        disabled={world.region === 0}
        onclick={() => (viewedRegion = world.region - 1)}>←</button
      >
      <button
        aria-label={language === 'id' ? 'Kawasan berikutnya' : 'Next region'}
        disabled={world.region === world.latestRegion}
        onclick={() => (viewedRegion = world.region + 1)}>→</button
      >
    {/if}
    {#if expanded}<button onclick={() => (focus = !focus)}
        >{focus
          ? language === 'id'
            ? 'Kepulauan'
            : 'Overview'
          : language === 'id'
            ? 'Pulau aktif'
            : 'Active island'}</button
      >{/if}
    <button aria-expanded={expanded} onclick={toggle}
      >{expanded
        ? language === 'id'
          ? 'Tutup'
          : 'Close'
        : language === 'id'
          ? 'Jelajahi'
          : 'Explore'}</button
    >
  </div>
{/snippet}
<div class="world" data-growth={count} data-completed={completed}>
  {#if !expanded}{@render scene()}{/if}
</div>
<dialog
  bind:this={worldDialog}
  onclose={() => {
    expanded = false;
    focus = false;
    viewedRegion = undefined;
  }}
  aria-label={language === 'id' ? 'Dunia goal' : 'Goal world'}
>
  {#if expanded}<div class="world expanded">{@render scene()}</div>{/if}
</dialog>

<style>
  dialog {
    width: 90vw;
    max-width: 1000px;
    height: 80vh;
    padding: 0;
    border: 0;
    background: #10272e;
    border-radius: 16px;
  }
  dialog::backdrop {
    background: #000b;
  }
  .world {
    height: 160px;
    position: relative;
    background: linear-gradient(150deg, #193b48, #10272e);
    overflow: hidden;
  }
  .world.expanded {
    height: 100%;
    border: 1px solid #42777c;
    border-radius: 16px;
  }
  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .caption {
    position: absolute;
    left: 14px;
    top: 12px;
    color: #eef3e7;
    font-size: 12px;
    font-weight: 600;
    pointer-events: none;
  }
  small {
    display: block;
    margin-top: 4px;
    font-size: 10px;
    font-weight: 400;
  }
  .controls {
    position: absolute;
    right: 10px;
    bottom: 8px;
    display: flex;
    gap: 6px;
  }
  button {
    border: 1px solid #5d8b8a;
    background: #142f39e8;
    color: #eef3e7;
    border-radius: 6px;
    padding: 5px 8px;
    font-size: 10px;
    cursor: pointer;
    min-height: 32px;
  }
  .expanded button {
    min-height: 40px;
    font-size: 13px;
  }
  .construction {
    animation: appear 0.3s ease-out;
  }
  .celebration {
    animation: celebrate 0.7s ease-out;
  }
  @keyframes appear {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes celebrate {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .construction,
    .celebration {
      animation: none;
    }
  }
</style>
