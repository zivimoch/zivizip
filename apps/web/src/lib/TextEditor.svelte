<script lang="ts">
  import { onMount } from 'svelte';
  import type { TextDocument } from './text/document';
  import type { mountText } from './text/editor';
  import './text/editor.css';
  export let body: string;
  export let rich: TextDocument | undefined = undefined;
  export let writable: boolean;
  export let language: 'en' | 'id';
  export let onchange: (body: string, rich?: TextDocument) => void;
  export let onput: (blob: Blob) => Promise<string>;
  export let onget: (id: string) => Promise<Blob>;
  export let onbusy: (value: boolean) => void;
  export let onerror: (error: unknown) => void;
  let host: HTMLDivElement;
  let editor: ReturnType<typeof mountText> | undefined;
  $: options = {
    body,
    rich,
    writable,
    language,
    change: onchange,
    put: onput,
    get: onget,
    busy: onbusy,
    error: onerror,
  };
  $: if (editor) editor.update(options);
  onMount(() => {
    let alive = true;
    import('./text/editor')
      .then(({ mountText }) => {
        if (alive) editor = mountText(host, options);
      })
      .catch(onerror);
    return () => {
      alive = false;
      editor?.destroy();
    };
  });
</script>

<div class="text-surface" bind:this={host}></div>
