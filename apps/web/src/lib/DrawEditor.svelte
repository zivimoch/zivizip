<script lang="ts">
  import { onMount } from 'svelte';
  import type { Viewport } from './draw/scene';
  import type { mountEditor } from './draw/editor';
  import './draw/editor.css';
  export let body: string;
  export let name: string;
  export let writable: boolean;
  export let language: 'en' | 'id';
  export let view: Viewport | undefined = undefined;
  export let onchange: (body: string) => void;
  export let onviewport: (view: Viewport) => void;
  export let onbusy: (busy: boolean) => void;
  export let onerror: (error: unknown) => void;
  let host: HTMLDivElement;
  let editor: ReturnType<typeof mountEditor> | undefined;
  let failure = '';
  $: options = {
    body,
    name,
    writable,
    language,
    view,
    change: onchange,
    viewport: onviewport,
    busy: onbusy,
    error: onerror,
  };
  $: if (editor) {
    try {
      editor.update(options);
    } catch (e) {
      onerror(e);
    }
  }
  onMount(() => {
    let alive = true;
    import('./draw/editor')
      .then(({ mountEditor }) => {
        if (alive) editor = mountEditor(host, options);
      })
      .catch((e) => {
        failure =
          language === 'en'
            ? 'Unable to open this drawing. Your saved data has not been changed.'
            : 'Gambar tidak dapat dibuka. Data tersimpan tidak diubah.';
        onerror(e);
      });
    return () => {
      alive = false;
      editor?.destroy();
    };
  });
</script>

{#if failure}<p role="alert">{failure}</p>{/if}
<div class="draw-editor" bind:this={host}></div>
