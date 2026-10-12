<script lang="ts">
  import '../../app.css';
  import { onMount } from 'svelte';
  import { api, ApiError } from '$lib/account';
  import type { Note } from '$lib/storage';
  import type { TextDocument } from '$lib/text/document';
  import TextEditor from '$lib/TextEditor.svelte';
  import DrawEditor from '$lib/DrawEditor.svelte';
  let note: Note | null = null,
    editable = false,
    token = '',
    error = '',
    dirty = false,
    saving = false,
    busy = false;
  let language: 'en' | 'id' = 'en';
  let toolbar: HTMLElement;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let version = 0,
    blocked = false,
    active = true;
  const t = (en: string, id: string) => ({ en, id })[language];
  function fail(e: unknown) {
    error = e instanceof Error ? e.message : String(e);
  }
  async function load() {
    try {
      const result = await api<{ note: Note; editable: boolean }>(
        `/shared/${token}`,
      );
      note = result.note;
      editable = result.editable;
      error = '';
      dirty = false;
    } catch (e) {
      fail(e);
      editable = false;
    }
  }
  onMount(() => {
    token = location.hash.slice(1);
    if (/^[a-f0-9]{64}$/.test(token)) void load();
    else error = 'Invalid share link';
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty || busy) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    const reconnect = () => schedule();
    window.addEventListener('online', reconnect);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('beforeunload', warn);
      window.removeEventListener('online', reconnect);
    };
  });
  function schedule(delay = 600) {
    clearTimeout(timer);
    if (active && dirty && editable && !blocked)
      timer = setTimeout(save, delay);
  }
  function setBusy(value: boolean) {
    busy = value;
    if (!busy) schedule();
  }
  function change(body: string, rich?: TextDocument) {
    if (note && editable) {
      note = { ...note, body, rich };
      version++;
      dirty = true;
      schedule();
    }
  }
  async function save() {
    if (!active || !note || !editable || !dirty || saving || busy || blocked)
      return;
    const sentVersion = version;
    const draft = note;
    saving = true;
    error = '';
    try {
      const saved = await api<Note>(`/shared/${token}`, 'PUT', draft);
      if (!active) return;
      // The server acknowledges this draft; it does not replace the live editor.
      // Re-serialized rich text can reset selection and undo even when unchanged.
      note = { ...note, revision: saved.revision, updatedAt: saved.updatedAt };
      dirty = version !== sentVersion;
    } catch (e) {
      if (!active) return;
      blocked =
        e instanceof ApiError &&
        e.status >= 400 &&
        e.status < 500 &&
        e.status !== 429;
      fail(e);
    } finally {
      saving = false;
      schedule(error ? 3000 : 600);
    }
  }
  async function put(blob: Blob) {
    const bytes = await blob.arrayBuffer();
    const id = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const response = await fetch(`/api/shared/${token}/media/${id}`, {
      method: 'PUT',
      headers: { 'X-Zivizip': '1' },
      body: blob,
    });
    if (!response.ok) throw Error('Unable to upload image');
    return id;
  }
  async function get(id: string) {
    const response = await fetch(`/api/shared/${token}/media/${id}`, {
      cache: 'no-store',
    });
    if (!response.ok) throw Error('Image unavailable');
    return response.blob();
  }
</script>

<svelte:head
  ><title>Shared note — Zivizip</title><meta
    name="robots"
    content="noindex,nofollow"
  /><meta name="referrer" content="no-referrer" /></svelte:head
>
<main class="shared-note">
  <header>
    <a href="/">zivizip</a><span
      >{editable
        ? t('Editing allowed', 'Boleh mengedit')
        : t('Read only', 'Hanya baca')}</span
    >{#if editable}<span role="status"
        >{error
          ? t('Not saved', 'Belum tersimpan')
          : saving || busy || dirty
            ? t('Saving…', 'Menyimpan…')
            : t('Saved', 'Tersimpan')}</span
      >{/if}
  </header>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if note}
    <div class="breadcrumb">
      <span>{note.category} / {note.name}</span>
      <div bind:this={toolbar}></div>
    </div>
    {#if note.kind === 'draw'}<DrawEditor
        body={note.body}
        name={note.name}
        writable={editable}
        {language}
        onchange={(body) => change(body)}
        onviewport={() => {}}
        onbusy={setBusy}
        onerror={fail}
      />
    {:else}<TextEditor
        body={note.body}
        rich={note.rich}
        {toolbar}
        writable={editable}
        {language}
        onchange={change}
        onput={put}
        onget={get}
        onbusy={setBusy}
        onerror={fail}
      />{/if}
  {/if}
</main>

<style>
  .shared-note {
    height: 100dvh;
    display: flex;
    flex-direction: column;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 20px;
    border-bottom: 1px solid var(--line);
    flex-wrap: wrap;
  }
  header a {
    margin-right: auto;
    color: var(--accent);
    text-decoration: none;
    font-weight: bold;
  }
  header span {
    font-size: 12px;
  }
  p {
    padding: 0 20px;
  }
</style>
