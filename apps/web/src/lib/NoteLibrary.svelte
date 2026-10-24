<script lang="ts">
  import Icon from './Icon.svelte';
  import type { Note } from './storage';
  export let notes: Note[];
  export let language: 'en' | 'id';
  export let onopen: (id: string) => void;
  export let writable = true;
  export let ondelete: (ids: string[]) => Promise<void>;
  let selected = new Set<string>();
  let deleting = false;
  let confirmDelete = false;
  let failure = '';
  $: selected = new Set(
    [...selected].filter((id) => notes.some((note) => note.id === id)),
  );
  function toggle(id: string) {
    selected = new Set(selected);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
  }
  async function removeSelected() {
    deleting = true;
    failure = '';
    try {
      await ondelete([...selected]);
      selected = new Set();
      confirmDelete = false;
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    } finally {
      deleting = false;
    }
  }
  let search = '';
  let sort = 'updated';
  const t = (en: string, id: string) => (language === 'id' ? id : en);
  $: query = search.trim().toLocaleLowerCase(language);
  $: visible = notes
    .filter((note) =>
      [note.name, note.category, note.kind === 'draw' ? '' : note.body].some(
        (value) => value.toLocaleLowerCase(language).includes(query),
      ),
    )
    .sort((a, b) => {
      if (sort === 'name')
        return (
          a.name.localeCompare(b.name, language) || a.id.localeCompare(b.id)
        );
      if (sort === 'oldest')
        return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
      if (sort === 'created')
        return b.createdAt - a.createdAt || a.id.localeCompare(b.id);
      return b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);
    });
  function date(value: number) {
    return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(
      value,
    );
  }
</script>

<section class="note-library" aria-label={t('Your notes', 'Catatanmu')}>
  <header>
    <h1>{t('Note', 'Catatan')}<span>.</span></h1>
    <div class="library-controls">
      <input
        type="search"
        aria-label={t('Search notes', 'Cari catatan')}
        placeholder={t('Search notes…', 'Cari catatan…')}
        bind:value={search}
      />
      <label
        >{t('Sort by', 'Urutkan')}<select bind:value={sort}>
          <option value="updated"
            >{t('Recently updated', 'Terakhir diperbarui')}</option
          >
          <option value="created"
            >{t('Newest created', 'Terbaru dibuat')}</option
          >
          <option value="oldest">{t('Oldest created', 'Terlama dibuat')}</option
          >
          <option value="name">{t('Name A–Z', 'Nama A–Z')}</option>
        </select></label
      >
    </div>
  </header>
  <div class="selection-controls">
    <button
      disabled={!visible.length || deleting}
      onclick={() => (selected = new Set(visible.map((note) => note.id)))}
      >{t('Select all results', 'Pilih semua hasil')}</button
    >
    {#if selected.size}
      <span>{selected.size} {t('selected', 'dipilih')}</span>
      <button
        disabled={deleting}
        onclick={() => {
          selected = new Set();
          confirmDelete = false;
        }}>{t('Clear selection', 'Batalkan pilihan')}</button
      >
      <button
        class="danger"
        disabled={!writable || deleting}
        onclick={() => (confirmDelete = true)}
        ><Icon name="trash" />{t('Delete selected', 'Hapus pilihan')}</button
      >
    {/if}
  </div>
  {#if confirmDelete && selected.size}
    <div class="delete-confirmation" role="alert">
      <p>
        {t('Permanently delete', 'Hapus permanen')}
        {selected.size}
        {t(
          'notes? This cannot be undone.',
          'catatan? Tindakan ini tidak dapat dibatalkan.',
        )}
      </p>
      <button disabled={deleting} onclick={() => (confirmDelete = false)}
        >{t('Cancel', 'Batal')}</button
      >
      <button
        class="danger"
        disabled={!writable || deleting}
        onclick={removeSelected}
        >{t('Confirm deletion', 'Konfirmasi hapus')}</button
      >
    </div>
  {/if}
  {#if failure}<p role="alert">{failure}</p>{/if}
  <div class="note-grid">
    {#each visible as note (note.id)}
      <div class="note-card-wrap" class:selected={selected.has(note.id)}>
        <input
          class="note-select"
          type="checkbox"
          aria-label={`${t('Select note', 'Pilih catatan')} ${note.name}`}
          checked={selected.has(note.id)}
          disabled={deleting}
          onchange={() => toggle(note.id)}
        />
        <button
          class="note-card"
          disabled={deleting}
          onclick={() => onopen(note.id)}
        >
          <span class="card-heading"
            ><Icon name={note.icon} /><strong>{note.name}</strong></span
          >
          <span class="category">{note.category}</span>
          <span class="preview-text"
            >{note.kind === 'draw'
              ? t('Drawing', 'Gambar')
              : note.body.trim().slice(0, 180) ||
                t('Empty note', 'Catatan kosong')}</span
          >
          <small>{t('Updated', 'Diperbarui')} {date(note.updatedAt)}</small>
        </button>
      </div>
    {:else}<p class="library-empty">
        {query
          ? t('No matching notes.', 'Tidak ada catatan yang cocok.')
          : t(
              'Your saved notes will appear here.',
              'Catatan yang kamu buat akan muncul di sini.',
            )}
      </p>{/each}
  </div>
</section>

<style>
  .selection-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .selection-controls button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .delete-confirmation {
    padding: 12px;
    border: 1px solid var(--line);
    margin-bottom: 16px;
  }
  .note-card-wrap {
    position: relative;
    min-width: 0;
  }
  .note-card-wrap.selected .note-card {
    border-color: var(--accent);
  }
  .note-select {
    position: absolute;
    z-index: 1;
    top: 12px;
    right: 12px;
    width: 24px;
    height: 24px;
    min-width: 24px;
    min-height: 24px;
  }

  .note-library {
    height: 100%;
    overflow: auto;
    padding: 28px;
  }
  header {
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  h1 {
    margin: 0;
    font-size: 28px;
  }
  h1 span {
    color: var(--accent);
  }
  .library-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  input {
    flex: 1;
    min-width: 180px;
    max-width: 520px;
  }
  label {
    margin: 0;
    white-space: nowrap;
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 12px;
  }
  select,
  input {
    min-height: 36px;
    margin: 0;
  }
  .note-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
    gap: 16px;
  }
  .note-card {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    min-width: 0;
    min-height: 190px;
    width: 100%;
    height: 100%;
    padding: 18px;
    text-align: left;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel, #131d21);
  }
  .note-card:hover {
    border-color: var(--accent);
  }
  .card-heading {
    display: flex;
    gap: 10px;
    padding-right: 28px;
    align-items: center;
  }
  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .category,
  small {
    color: var(--muted);
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .preview-text {
    color: var(--muted);
    font-size: 14px;
    line-height: 1.5;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    overflow-wrap: anywhere;
  }
  small {
    margin-top: auto;
  }
  @media (max-width: 800px) {
    h1 {
      font-size: 24px;
    }
    .note-library {
      padding: 20px;
    }
    .library-controls {
      align-items: center;
      width: 100%;
      gap: 8px;
    }
    input {
      min-width: 0;
      width: 40%;
    }
    label {
      min-width: 0;
      flex: 1;
    }
    select {
      width: 100%;
      min-width: 0;
    }
  }
</style>
