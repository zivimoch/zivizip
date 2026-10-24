<script lang="ts">
  import '../../app.css';
  import { onMount } from 'svelte';
  import { api } from '$lib/account';
  import type { Note } from '$lib/storage';
  import CollaborativeEditor from '$lib/CollaborativeEditor.svelte';
  import { WorkspaceDB } from '$lib/storage';
  import type { SaveState } from '$lib/collaboration/room';
  let note: Note | null = null,
    editable = false,
    token = '',
    error = '',
    busy = false;
  let state: SaveState = 'connecting';
  let language: 'en' | 'id' = 'en';
  let toolbar: HTMLElement;
  let db: WorkspaceDB | undefined;
  const t = (en: string, id: string) => ({ en, id })[language];
  function fail(e: unknown) {
    error = e instanceof Error ? e.message : String(e);
  }
  onMount(() => {
    token = location.hash.slice(1);
    if (!/^[a-f0-9]{64}$/.test(token)) {
      error = 'Invalid share link';
      return;
    }
    db = new WorkspaceDB(`zivizip-shared-${token}`);
    void api<{ note: Note; editable: boolean }>(`/shared/${token}`)
      .then((result) => {
        note = result.note;
        editable = result.editable;
      })
      .catch(fail);
  });
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
    <a href="/" aria-label="Zivizip Main"
      ><img src="/logo.svg" alt="" width="28" height="28" /><b
        class="brand-wordmark">Zivizip<span aria-hidden="true">.</span></b
      ></a
    ><span
      >{editable
        ? t('Editing allowed', 'Boleh mengedit')
        : t('Read only', 'Hanya baca')}</span
    ><span role="status"
      >{state === 'offline'
        ? t('Offline · Read only', 'Offline · Hanya baca')
        : state === 'saved'
          ? t('Saved', 'Tersimpan')
          : state === 'saving' || busy
            ? t('Saving…', 'Menyimpan…')
            : state === 'connecting'
              ? t('Connecting…', 'Menghubungkan…')
              : t(
                  'Not saved · Reconnecting…',
                  'Belum tersimpan · Menghubungkan…',
                )}</span
    >
  </header>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if note}
    <div class="breadcrumb">
      <span>{note.category} / {note.name}</span>
      <div bind:this={toolbar}></div>
    </div>
    <CollaborativeEditor
      {note}
      path={`/shared/${token}/sync`}
      {db}
      {language}
      {toolbar}
      onput={put}
      onget={get}
      onchange={(value) => (note = value)}
      onstatus={(value, _pending, allowed) => {
        editable = allowed;
        state = value;
        if (value === 'saved') error = '';
      }}
      onbusy={(value) => (busy = value)}
      onerror={fail}
    />
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
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--text, #edf1f3);
    text-decoration: none;
  }
  header > span {
    font-size: 12px;
  }
  p {
    padding: 0 20px;
  }
</style>
