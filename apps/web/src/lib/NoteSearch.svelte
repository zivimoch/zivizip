<script lang="ts">
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';
  import type { Note } from './storage';
  export let notes: Note[];
  export let recent: string[];
  export let language: 'en' | 'id';
  export let onopen: (id: string) => Promise<void>;
  let dialog: HTMLDialogElement;
  let input: HTMLInputElement;
  let query = '';
  let active = 0;
  let opening = false;
  let error = '';
  const t = (en: string, id: string) => (language === 'id' ? id : en);
  $: term = query.trim().toLocaleLowerCase(language);
  $: results = term
    ? notes
        .filter((note) =>
          [
            note.name,
            note.category,
            note.kind === 'draw' ? '' : note.body,
          ].some((text) => text.toLocaleLowerCase(language).includes(term)),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 50)
    : recent
        .map((id) => notes.find((note) => note.id === id))
        .filter((note): note is Note => !!note);
  export async function show() {
    if (dialog.open || document.querySelector('dialog[open]')) return;
    query = '';
    active = 0;
    error = '';
    dialog.showModal();
    await tick();
    input.focus();
  }
  function shortcut(event: KeyboardEvent) {
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      event.key.toLowerCase() === 'k'
    ) {
      event.preventDefault();
      if (!event.repeat) void show();
    }
  }
  async function choose(id: string) {
    if (opening) return;
    opening = true;
    try {
      await onopen(id);
      dialog.close();
    } catch {
      error = t(
        'Could not open this note. Please try again.',
        'Catatan belum dapat dibuka. Coba lagi.',
      );
    } finally {
      opening = false;
    }
  }
  async function key(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dialog.close();
      return;
    }
    if (
      (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
      results.length
    ) {
      event.preventDefault();
      active =
        (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) %
        results.length;
      await tick();
      dialog
        .querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault();
      void choose(results[active].id);
    }
  }
</script>

<svelte:window onkeydown={shortcut} />
<dialog
  bind:this={dialog}
  onclose={() => {
    query = '';
  }}
  class="note-search-dialog"
  aria-label={t('Search notes', 'Cari catatan')}
>
  <header>
    <Icon name="search" /><input
      bind:this={input}
      bind:value={query}
      oninput={() => (active = 0)}
      onkeydown={key}
      type="search"
      role="combobox"
      aria-label={t('Search notes', 'Cari catatan')}
      aria-expanded="true"
      aria-controls="note-search-results"
      aria-activedescendant={results[active]
        ? `note-search-result-${active}`
        : undefined}
      autocomplete="off"
      placeholder={t('Search notes…', 'Cari catatan…')}
    /><button
      type="button"
      aria-label={t('Close search', 'Tutup pencarian')}
      onclick={() => dialog.close()}>×</button
    >
  </header>
  <h2>
    {term
      ? t('Search results', 'Hasil pencarian')
      : t('Recently opened', 'Baru dibuka')}
  </h2>
  {#if error}<p role="alert">{error}</p>{/if}
  <div
    id="note-search-results"
    role="listbox"
    aria-label={t('Notes', 'Catatan')}
  >
    {#each results as note, index (note.id)}
      <button
        type="button"
        role="option"
        id={`note-search-result-${index}`}
        aria-selected={active === index}
        disabled={opening}
        onclick={() => choose(note.id)}
        ><Icon name={note.icon} /><span
          ><strong>{note.name}</strong><small>{note.category}</small></span
        ></button
      >
    {/each}
  </div>
  {#if !results.length}<p>
      {term
        ? t('No notes found.', 'Tidak ada catatan ditemukan.')
        : t(
            'Open a note to see it here, or search your notes.',
            'Buka catatan untuk melihatnya di sini, atau cari catatanmu.',
          )}
    </p>{/if}
</dialog>

<style>
  .note-search-dialog {
    width: min(560px, calc(100vw - 24px));
    max-height: min(620px, 80dvh);
    padding: 12px;
    margin: 10dvh auto auto;
    overflow-y: auto;
  }
  header {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  header input {
    flex: 1;
    min-width: 0;
  }
  header button {
    border: 0;
    background: transparent;
    font-size: 22px;
    padding: 5px 10px;
  }
  h2 {
    font-size: 12px;
    margin: 18px 8px 8px;
    font-weight: 500;
  }
  [role='listbox'] {
    display: grid;
    gap: 3px;
  }
  [role='option'] {
    display: flex;
    align-items: center;
    gap: 12px;
    text-align: left;
    width: 100%;
    padding: 10px;
    border: 0;
    background: transparent;
  }
  [role='option']:hover,
  [aria-selected='true'] {
    background: #00d8ec14;
  }
  [role='option'] span {
    min-width: 0;
    display: grid;
    gap: 3px;
  }
  strong,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 400;
  }
  small {
    opacity: 0.7;
  }
  p {
    padding: 8px;
    font-size: 13px;
  }
</style>
