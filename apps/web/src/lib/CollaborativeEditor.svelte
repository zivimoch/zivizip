<script lang="ts">
  import { onMount } from 'svelte';
  import type { Note, WorkspaceDB } from './storage';
  import TextEditor from './TextEditor.svelte';
  import DrawEditor from './DrawEditor.svelte';
  import type { Room, SaveState } from './collaboration/room';
  import type { Viewport } from './draw/scene';
  export let iscurrent: () => boolean = () => true;
  export let note: Note;
  export let path: string;
  export let db: WorkspaceDB | undefined = undefined;
  export let language: 'en' | 'id';
  export let toolbar: HTMLElement | undefined = undefined;
  export let view: Viewport | undefined = undefined;
  export let onviewport: (view: Viewport) => void = () => {};
  export let onget: (id: string) => Promise<Blob>;
  export let onput: (blob: Blob) => Promise<string>;
  export let onchange: (note: Note) => void;
  export let onstatus: (
    state: SaveState,
    pending: boolean,
    writable: boolean,
  ) => void = () => {};
  export let onbusy: (busy: boolean) => void;
  export let onerror: (error: unknown) => void;
  let live = note,
    writable = false,
    room: Room | undefined;
  let disposed = false,
    pending = false,
    busy = false;
  export async function flush() {
    await room?.flush();
  }
  function setBusy(value: boolean) {
    busy = value;
    room?.setBusy(value);
    onbusy(value);
  }
  onMount(() => {
    import('./collaboration/room')
      .then(({ Room }) => {
        if (disposed) return;
        room = new Room(
          note,
          path,
          db,
          (value) => {
            if (!disposed && iscurrent()) {
              live = value;
              onchange(value);
            }
          },
          (state, allowed, unsaved) => {
            if (!disposed && iscurrent()) {
              writable = allowed;
              pending = unsaved;
              onstatus(state, unsaved, allowed);
            }
          },
          (e) => {
            if (!disposed && iscurrent()) onerror(e);
          },
          iscurrent,
        );
      })
      .catch(onerror);
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void flush();
      }
    };
    const warn = (e: BeforeUnloadEvent) => {
      if (pending || busy) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('keydown', key);
    window.addEventListener('beforeunload', warn);
    return () => {
      disposed = true;
      room?.close();
      window.removeEventListener('keydown', key);
      window.removeEventListener('beforeunload', warn);
    };
  });
</script>

{#if live.kind === 'draw'}
  <DrawEditor
    body={live.body}
    name={live.name}
    {writable}
    {language}
    {view}
    {onviewport}
    {onget}
    {onput}
    onbusy={setBusy}
    {onerror}
    onchange={(body) => room?.edit(body)}
    onhistory={(forward) => room?.history(forward)}
  />
{:else}
  <TextEditor
    body={live.body}
    rich={live.rich}
    {writable}
    {language}
    {toolbar}
    {onget}
    {onput}
    onbusy={setBusy}
    {onerror}
    onchange={(body, rich) => room?.edit(body, rich)}
    onhistory={(forward) => room?.history(forward)}
  />
{/if}
