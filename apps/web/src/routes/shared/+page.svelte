<script lang="ts">
  import '../../app.css';
  import { onMount } from 'svelte';
  import { api } from '$lib/account';
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
  const t = (en: string, id: string) => (language === 'id' ? id : en);
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
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  });
  function change(body: string, rich?: TextDocument) {
    if (note) {
      note = { ...note, body, rich };
      dirty = true;
    }
  }
  async function save() {
    if (!note || !editable || saving) return;
    saving = true;
    error = '';
    try {
      note = await api<Note>(`/shared/${token}`, 'PUT', note);
      dirty = false;
    } catch (e) {
      fail(e);
    } finally {
      saving = false;
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
    <a href="/">zivizip</a><select aria-label="Language" bind:value={language}
      ><option value="en">English</option><option value="id">Indonesia</option
      ></select
    ><span
      >{editable
        ? t('Editing allowed', 'Boleh mengedit')
        : t('Read only', 'Hanya baca')}</span
    >{#if editable}<button disabled={!dirty || saving || busy} onclick={save}
        >{saving
          ? t('Saving…', 'Menyimpan…')
          : t('Save changes', 'Simpan perubahan')}</button
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
        writable={editable && !saving}
        {language}
        onchange={(body) => change(body)}
        onviewport={() => {}}
        onbusy={(value) => (busy = value)}
        onerror={fail}
      />
    {:else}<TextEditor
        body={note.body}
        rich={note.rich}
        {toolbar}
        writable={editable && !saving}
        {language}
        onchange={change}
        onput={put}
        onget={get}
        onbusy={(value) => (busy = value)}
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
