<script lang="ts">
  import '../../app.css';
  import { onMount } from 'svelte';
  import { api, type Account } from '$lib/account';
  import AccountDialog from '$lib/AccountDialog.svelte';
  type Visitor = {
    id: string;
    name: string;
    browser: string;
    os: string;
    country: string | null;
    firstSeen: number;
    lastSeen: number;
    visits: number;
  };
  type Overview = {
    username: string;
    sessions: number;
    total: number;
    visitors: Visitor[];
  };
  type Interest = {
    id: number;
    email: string;
    message: string;
    createdAt: number;
  };
  let data: Overview | null = null;
  let interests: Interest[] = [];
  let account: Account | null = null;
  let ready = false;
  let busy = false;
  let error = '';
  let language: 'en' | 'id' = 'en';
  let loginDialog: AccountDialog;
  let filter = '';
  let confirmation: HTMLDialogElement;
  let action: (() => Promise<void>) | null = null;
  let confirmText = '';
  const t = (en: string, id: string) => (language === 'id' ? id : en);
  $: visitors = (data?.visitors || []).filter((v) =>
    `${v.name} ${v.browser} ${v.os} ${v.country || ''}`
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );
  const date = (time: number) => new Date(time).toLocaleString(language);
  function country(code: string | null) {
    if (!code) return t('Unavailable', 'Tidak tersedia');
    try {
      return (
        new Intl.DisplayNames([language], { type: 'region' }).of(code) || code
      );
    } catch {
      return code;
    }
  }
  async function refresh() {
    busy = true;
    error = '';
    try {
      const next = await api<Overview>('/admin');
      const requests = await api<Interest[]>('/registration-interest');
      data = next;
      interests = requests;
    } catch {
      data = null;
      interests = [];
      error = t(
        'Unable to load admin data. Check your connection and sign in again if your session ended.',
        'Tidak dapat memuat data admin. Periksa koneksi dan masuk kembali jika sesi berakhir.',
      );
    } finally {
      busy = false;
    }
  }
  function ask(message: string, fn: () => Promise<void>) {
    confirmText = message;
    action = fn;
    confirmation.showModal();
  }
  async function perform() {
    busy = true;
    try {
      await action?.();
      confirmation.close();
      await refresh();
    } catch {
      error = t(
        'Change failed. Please try again.',
        'Perubahan gagal. Silakan coba lagi.',
      );
    } finally {
      busy = false;
    }
  }
  async function signedIn(user: Account) {
    account = user;
    await refresh();
  }
  onMount(async () => {
    try {
      account = await api<Account>('/session');
      await refresh();
    } catch {
      account = null;
    }
    ready = true;
  });
</script>

<svelte:head
  ><title>Admin · Zivizip</title><meta
    name="robots"
    content="noindex, nofollow"
  /></svelte:head
>
<main class="admin-page">
  <header>
    <h1>Admin<span>.</span></h1>
    <nav>
      <a href="/">{t('Workspace', 'Workspace')}</a><select
        aria-label="Language / Bahasa"
        bind:value={language}
        ><option value="en">English</option><option value="id">Indonesia</option
        ></select
      >{#if account}<button disabled={busy} onclick={refresh}
          >{t('Refresh', 'Muat ulang')}</button
        >{/if}
    </nav>
  </header>
  {#if !ready}<p>{t('Loading…', 'Memuat…')}</p>{:else if !account}<section>
      <h2>{t('Owner access', 'Akses pemilik')}</h2>
      <p>
        {t(
          'Sign in with your existing owner account to continue.',
          'Masuk dengan akun pemilik untuk melanjutkan.',
        )}
      </p>
      <button class="primary" onclick={() => loginDialog.open()}
        >{t('Log in', 'Masuk')}</button
      >
    </section>{/if}
  {#if error}<p role="alert">{error}</p>
    <button onclick={() => loginDialog.open()}>{t('Log in', 'Masuk')}</button
    >{/if}
  {#if data}
    <section>
      <h2>{t('Account', 'Akun')}</h2>
      <div class="account-row">
        <strong>{data.username}</strong><span
          >{t('Owner', 'Pemilik')} · {data.sessions}
          {t('active sessions', 'sesi aktif')}</span
        ><button
          disabled={busy || data.sessions < 2}
          onclick={() =>
            ask(
              t(
                'Sign out all other browsers? This browser stays signed in.',
                'Keluarkan semua browser lain? Browser ini tetap masuk.',
              ),
              async () => {
                await api('/admin/sessions', 'DELETE');
              },
            )}>{t('Sign out other sessions', 'Keluar dari sesi lain')}</button
        >
      </div>
      <p>
        {t(
          'Registration is closed. Account creation and credential changes are not available here yet.',
          'Pendaftaran ditutup. Pembuatan akun dan perubahan kredensial belum tersedia di sini.',
        )}
      </p>
    </section>
    <section>
      <div class="section-title">
        <h2>{t('Visitors', 'Pengunjung')} <small>({data.total})</small></h2>
        <input
          type="search"
          aria-label={t('Search visitors', 'Cari pengunjung')}
          placeholder={t('Search visitors…', 'Cari pengunjung…')}
          bind:value={filter}
        />
      </div>
      <p>
        {t(
          'Browser profiles, not verified people or physical devices. Names are self-reported. Visits are counted after a 30-minute gap; latest 500 profiles shown, retained for 90 days.',
          'Profil browser, bukan identitas orang atau perangkat yang terverifikasi. Nama diisi sendiri. Kunjungan dihitung setelah jeda 30 menit; menampilkan 500 profil terbaru, disimpan selama 90 hari.',
        )}
      </p>
      <div class="table-scroll">
        <table>
          <thead
            ><tr
              ><th>{t('Name', 'Nama')}</th><th
                >{t('Browser / OS', 'Browser / OS')}</th
              ><th>{t('Approx. country', 'Perkiraan negara')}</th><th
                >{t('First seen', 'Pertama')}</th
              ><th>{t('Last seen', 'Terakhir')}</th><th
                >{t('Visits', 'Kunjungan')}</th
              ><th></th></tr
            ></thead
          ><tbody
            >{#each visitors as v (v.id)}<tr
                ><td
                  >{v.name || t('Guest', 'Tamu')}<small
                    >{v.id.slice(0, 8)}</small
                  ></td
                ><td>{v.browser} / {v.os}</td><td>{country(v.country)}</td><td
                  >{date(v.firstSeen)}</td
                ><td>{date(v.lastSeen)}</td><td>{v.visits}</td><td
                  ><button
                    disabled={busy}
                    onclick={() =>
                      ask(
                        t(
                          'Delete this visitor record? Their local workspace is not affected. A future visit may create another record.',
                          'Hapus catatan pengunjung ini? Workspace lokalnya tetap tersimpan. Kunjungan berikutnya dapat membuat catatan baru.',
                        ),
                        async () => {
                          await api(`/admin/visitors/${v.id}`, 'DELETE');
                        },
                      )}>{t('Delete', 'Hapus')}</button
                  ></td
                ></tr
              >{:else}<tr
                ><td colspan="7"
                  >{t(
                    'No visitor records.',
                    'Belum ada catatan pengunjung.',
                  )}</td
                ></tr
              >{/each}</tbody
          >
        </table>
      </div>
      <p>
        {t(
          'Country is estimated from the network IP; VPNs and mobile networks can change it. No GPS, raw IP, fingerprint or workspace content is stored in these records.',
          'Negara diperkirakan dari IP jaringan; VPN dan jaringan seluler dapat memengaruhinya. Catatan ini tidak menyimpan GPS, IP mentah, fingerprint, atau isi workspace.',
        )}
        <a href="https://db-ip.com" target="_blank" rel="noreferrer"
          >IP Geolocation by DB-IP</a
        >
      </p>
    </section>
    <section>
      <h2>{t('Registration interest', 'Minat pendaftaran')}</h2>
      {#each interests as i (i.id)}<article>
          <strong>{i.email}</strong><small>{date(i.createdAt)}</small>
          <p class="message">{i.message}</p>
          <button
            disabled={busy}
            onclick={() =>
              ask(
                t(
                  'Delete this registration request?',
                  'Hapus permintaan pendaftaran ini?',
                ),
                async () => {
                  await api(`/admin/interests/${i.id}`, 'DELETE');
                },
              )}>{t('Delete', 'Hapus')}</button
          >
        </article>{:else}<p>
          {t('No requests yet.', 'Belum ada permintaan.')}
        </p>{/each}
    </section>
  {/if}
</main>
<AccountDialog bind:this={loginDialog} {language} onlogin={signedIn} />
<dialog bind:this={confirmation}>
  <h2>{t('Confirm change', 'Konfirmasi perubahan')}</h2>
  <p>{confirmText}</p>
  <footer>
    <button disabled={busy} onclick={() => confirmation.close()}
      >{t('Cancel', 'Batal')}</button
    ><button class="primary" disabled={busy} onclick={perform}
      >{t('Confirm', 'Konfirmasi')}</button
    >
  </footer>
</dialog>

<style>
  :global(body) {
    overflow: auto;
  }
  .admin-page {
    max-width: 1280px;
    margin: auto;
    padding: 28px;
  }
  header,
  nav,
  .account-row,
  .section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }
  h1 {
    font-size: 28px;
    margin: 0;
  }
  h1 span {
    color: var(--accent);
  }
  h2 {
    font-size: 20px;
  }
  section {
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 20px;
    margin-top: 24px;
  }
  p {
    line-height: 1.6;
  }
  a {
    color: var(--text);
  }
  select,
  input {
    width: auto;
    margin: 0;
  }
  input {
    max-width: 100%;
  }
  .table-scroll {
    overflow: auto;
    max-height: 520px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
  }
  th,
  td {
    padding: 12px;
    border-bottom: 1px solid var(--line);
    font-size: 13px;
  }
  th {
    white-space: nowrap;
  }
  td {
    overflow-wrap: anywhere;
    min-width: 100px;
  }
  small {
    display: block;
    font-size: 12px;
  }
  h2 small {
    display: inline;
  }
  article {
    border-top: 1px solid var(--line);
    padding: 16px 0;
  }
  .message {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  @media (max-width: 600px) {
    .admin-page {
      padding: 16px;
    }
    section {
      padding: 14px;
    }
  }
</style>
