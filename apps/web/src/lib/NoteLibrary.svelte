<script lang="ts">
  import Icon from './Icon.svelte';
  import type { Note } from './storage';
  export let notes: Note[];
  export let language: 'en' | 'id';
  export let onopen: (id: string) => void;
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
    <h1>{t('Your notes', 'Catatanmu')}</h1>
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
  <div class="note-grid">
    {#each visible as note (note.id)}
      <button class="note-card" onclick={() => onopen(note.id)}>
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
  .note-library {
    height: 100%;
    overflow: auto;
    padding: 28px 32px;
  }
  header {
    margin-bottom: 24px;
  }
  h1 {
    margin: 0 0 20px;
    font-size: 24px;
  }
  .library-controls {
    display: flex;
    align-items: end;
    gap: 16px;
    flex-wrap: wrap;
  }
  input {
    flex: 1;
    min-width: 180px;
    max-width: 520px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: var(--muted);
    font-size: 12px;
  }
  select,
  input {
    min-height: 40px;
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
    .note-library {
      padding: 20px;
    }
    .library-controls {
      align-items: stretch;
    }
    input,
    label {
      width: 100%;
    }
  }
</style>
