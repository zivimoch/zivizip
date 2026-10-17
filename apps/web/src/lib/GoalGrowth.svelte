<script lang="ts">
  import { onMount } from 'svelte';
  import type { WorldTheme } from './world-dna';
  export let count = 0;
  export let seed = '';
  export let completed = false;
  export let theme: WorldTheme = 'island';
  export let generatorVersion = 1;
  export let language: 'en' | 'id' = 'en';
  let host: HTMLElement;
  let visible = false;
  let expanded = false;
  let dialog: HTMLDialogElement;
  let Scene: typeof import('./WorldScene.svelte').default | undefined;
  let Legacy: typeof import('./LegacyGoalWorld.svelte').default | undefined;
  let failure = false;
  let region: number | undefined;
  let mounted = false;
  $: latest = Math.floor(Math.max(0, count - 1) / 256);
  $: selected = Math.min(region ?? latest, latest);
  $: if (mounted && visible && generatorVersion) void load();
  async function load() {
    try {
      if (generatorVersion === 1) {
        Legacy ??= (await import('./LegacyGoalWorld.svelte')).default;
      } else {
        Scene ??= (await import('./WorldScene.svelte')).default;
      }
      failure = false;
    } catch {
      failure = true;
    }
  }
  onMount(() => {
    mounted = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { rootMargin: '80px' },
    );
    observer.observe(host);
    return () => {
      mounted = false;
      observer.disconnect();
    };
  });
  function open() {
    expanded = true;
    region = undefined;
    dialog.showModal();
  }
  const t = (en: string, id: string) => (language === 'id' ? id : en);
</script>

<div class="host" bind:this={host}>
  {#if generatorVersion === 1 && Legacy && visible}<svelte:component
      this={Legacy}
      {seed}
      {count}
      {completed}
      {language}
    />
  {:else if generatorVersion === 1}<div class="placeholder"></div>
  {:else}
    <div class="world" data-growth={count} data-completed={completed}>
      {#if Scene && visible && !expanded}<svelte:component
          this={Scene}
          {seed}
          {theme}
          {count}
          {completed}
          {language}
        />{/if}
      <span class="caption"
        >{completed
          ? t('Completed', 'Selesai')
          : t('A growing world', 'Dunia bertumbuh')}<small
          >{count.toLocaleString(language)}
          {t('contributions', 'kontribusi')} · {t('Region', 'Kawasan')}
          {latest + 1}</small
        ></span
      >
      <button class="explore" onclick={open} disabled={!Scene}
        >{t('Explore', 'Jelajahi')}</button
      >
    </div>
  {/if}
  {#if failure}<button class="retry" onclick={load}
      >{t('Retry world', 'Coba lagi')}</button
    >{/if}
</div>
<dialog
  bind:this={dialog}
  aria-label={t('Goal world', 'Dunia goal')}
  onclose={() => {
    expanded = false;
    region = undefined;
  }}
>
  {#if expanded && Scene}
    <svelte:component
      this={Scene}
      {seed}
      {theme}
      {count}
      {completed}
      {language}
      detail="detail"
      region={selected}
    />
    <span class="caption"
      >{t('Region', 'Kawasan')}
      {selected + 1}<small
        >{count.toLocaleString(language)}
        {t('contributions', 'kontribusi')}</small
      ></span
    >
    <div class="controls">
      {#if latest > 0}<button
          aria-label={t('Previous region', 'Kawasan sebelumnya')}
          disabled={selected === 0}
          onclick={() => (region = selected - 1)}>←</button
        ><button
          aria-label={t('Next region', 'Kawasan berikutnya')}
          disabled={selected === latest}
          onclick={() => (region = selected + 1)}>→</button
        >{/if}
      <button onclick={() => dialog.close()}>{t('Close', 'Tutup')}</button>
    </div>
  {/if}
</dialog>

<style>
  .host,
  .world,
  .placeholder {
    height: 160px;
    position: relative;
    background: #15313c;
  }
  .caption {
    position: absolute;
    top: 12px;
    left: 14px;
    color: #edf4ec;
    font-size: 12px;
    font-weight: 600;
    pointer-events: none;
  }
  small {
    display: block;
    font-size: 10px;
    font-weight: 400;
    margin-top: 4px;
  }
  button {
    border: 1px solid #5d8b8a;
    background: #142f39ed;
    color: #eef3e7;
    border-radius: 6px;
    padding: 5px 8px;
    font-size: 10px;
    min-height: 32px;
    cursor: pointer;
  }
  .explore {
    position: absolute;
    right: 10px;
    bottom: 8px;
  }
  .retry {
    position: absolute;
    bottom: 8px;
    left: 10px;
  }
  dialog {
    width: 90vw;
    max-width: 1000px;
    height: 80vh;
    padding: 0;
    border: 1px solid #42777c;
    border-radius: 16px;
    background: #10272e;
    overflow: hidden;
  }
  dialog::backdrop {
    background: #000b;
  }
  .controls {
    position: absolute;
    right: 12px;
    bottom: 12px;
    display: flex;
    gap: 8px;
  }
  .controls button {
    min-height: 44px;
    min-width: 44px;
    font-size: 13px;
  }
  @media (pointer: coarse) {
    .explore {
      min-height: 40px;
    }
  }
</style>
