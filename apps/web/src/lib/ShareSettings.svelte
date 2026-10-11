<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './account';
  export let id: string;
  export let language: 'en' | 'id';
  let token: string | null = null,
    editable = false,
    busy = true,
    error = '',
    copied = false;
  const t = (en: string, local: string) => (language === 'id' ? local : en);
  $: url =
    token && typeof location !== 'undefined'
      ? `${location.origin}/shared/#${token}`
      : '';
  onMount(() => {
    void load();
  });
  async function load() {
    try {
      ({ token, editable } = await api<{
        token: string | null;
        editable: boolean;
      }>(`/notes/${id}/share`));
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }
  async function save(remove = false) {
    busy = true;
    error = '';
    copied = false;
    try {
      if (remove) {
        await api(`/notes/${id}/share`, 'DELETE');
        token = null;
        editable = false;
      } else
        ({ token, editable } = await api<{ token: string; editable: boolean }>(
          `/notes/${id}/share`,
          'PUT',
          { editable },
        ));
    } catch (e) {
      error = String(e);
    } finally {
      busy = false;
    }
  }
</script>

<section class="share-settings" aria-label={t('Sharing', 'Berbagi')}>
  <label class="permission"
    ><input
      type="checkbox"
      bind:checked={editable}
      disabled={busy}
      onchange={() => {
        if (token) void save();
      }}
    />{t(
      'Allow anyone with the link to edit',
      'Izinkan siapa pun dengan link untuk mengedit',
    )}</label
  >
  <p>
    {t(
      'Anyone with this link can open this note without logging in.',
      'Siapa pun dengan link ini dapat membuka catatan tanpa login.',
    )}
  </p>
  {#if token}
    <label
      >{t('Share link', 'Link berbagi')}<input
        readonly
        value={url}
        onclick={(e) => e.currentTarget.select()}
      /></label
    >
    <div class="share-actions">
      <button
        type="button"
        disabled={busy}
        onclick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            copied = true;
          } catch {
            error = t(
              'Select and copy the link above.',
              'Pilih dan salin link di atas.',
            );
          }
        }}
        >{copied
          ? t('Copied', 'Disalin')
          : t('Copy link', 'Salin link')}</button
      ><button type="button" disabled={busy} onclick={() => save(true)}
        >{t('Revoke link', 'Cabut link')}</button
      >
    </div>
  {:else}<button type="button" disabled={busy} onclick={() => save()}
      >{t('Create share link', 'Buat link berbagi')}</button
    >{/if}
  {#if error}<p role="alert">{error}</p>{/if}
</section>

<style>
  .share-settings {
    border-top: 1px solid var(--line);
    padding-top: 12px;
    margin: 16px 0;
  }
  .permission {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .permission input {
    width: auto;
  }
  p {
    font-size: 12px;
  }
  .share-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
</style>
