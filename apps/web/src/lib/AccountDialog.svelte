<script lang="ts">
  import { tick } from 'svelte';
  import { api, ApiError, type Account } from './account';
  export let language: 'en' | 'id' = 'en';
  export let online = true;
  export let onlogin: (account: Account) => Promise<void>;
  let modal: HTMLDialogElement;
  let field: HTMLInputElement;
  let screen: 'login' | 'register' = 'login';
  let username = '';
  let password = '';
  let email = '';
  let message = '';
  let error = '';
  let success = false;
  let sending = false;
  $: t =
    language === 'en'
      ? (en: string, _id: string) => en
      : (_en: string, id: string) => id;
  export async function open() {
    screen = 'login';
    error = '';
    success = false;
    modal.showModal();
    await tick();
    field?.focus();
  }
  async function login(event: SubmitEvent) {
    event.preventDefault();
    sending = true;
    error = '';
    try {
      const user = await api<Account>('/session', 'POST', {
        username,
        password,
      });
      password = '';
      modal.close();
      await onlogin(user);
    } catch (e) {
      error =
        e instanceof ApiError && e.status === 401
          ? t(
              'Incorrect username or password.',
              'Nama pengguna atau kata sandi salah.',
            )
          : e instanceof ApiError && e.status === 429
            ? t(
                'Too many attempts. Please try again in 15 minutes.',
                'Terlalu banyak percobaan. Coba lagi dalam 15 menit.',
              )
            : t(
                'Unable to sign in. Check your connection and try again.',
                'Tidak dapat masuk. Periksa koneksi lalu coba lagi.',
              );
      if (!modal.open) modal.showModal();
    } finally {
      sending = false;
    }
  }
  async function interest(event: SubmitEvent) {
    event.preventDefault();
    sending = true;
    error = '';
    try {
      await api('/registration-interest', 'POST', { email, message });
      success = true;
      email = '';
      message = '';
    } catch (e) {
      error =
        e instanceof ApiError && e.status === 429
          ? t('Please try again in 15 minutes.', 'Coba lagi dalam 15 menit.')
          : t(
              'Your request was not sent. Check your connection and try again.',
              'Permintaan belum terkirim. Periksa koneksi lalu coba lagi.',
            );
    } finally {
      sending = false;
    }
  }
</script>

<dialog bind:this={modal} onclose={() => (password = '')}>
  <div class="dialog-heading">
    <h2>
      {screen === 'login'
        ? t('Welcome back', 'Selamat datang kembali')
        : t('Help shape Zivizip', 'Bantu kembangkan Zivizip')}
    </h2>
    <button
      aria-label={t('Close account dialog', 'Tutup dialog akun')}
      onclick={() => modal.close()}>×</button
    >
  </div>
  {#if error}<p class="form-error" role="alert">{error}</p>{/if}
  {#if screen === 'login'}
    <form onsubmit={login}>
      <label
        >{t('Username', 'Nama pengguna')}<input
          bind:this={field}
          bind:value={username}
          autocomplete="username"
          required
          maxlength="150"
        /></label
      ><label
        >{t('Password', 'Kata sandi')}<input
          type="password"
          bind:value={password}
          autocomplete="current-password"
          required
          maxlength="1024"
        /></label
      >
      <p class="muted">
        {t(
          'Stay signed in on this browser, even after closing it.',
          'Tetap masuk di browser ini, termasuk setelah browser ditutup.',
        )}
      </p>
      <button class="primary" type="submit" disabled={sending || !online}
        >{sending
          ? t('Signing in…', 'Sedang masuk…')
          : t('Log in', 'Masuk')}</button
      ><button
        type="button"
        disabled={sending}
        onclick={() => {
          screen = 'register';
          error = '';
          success = false;
        }}>{t('Register', 'Daftar')}</button
      >
    </form>
  {:else if success}<p role="status">
      {t(
        'Thank you. Your interest has been recorded. You can continue using Zivizip as a guest.',
        'Terima kasih. Minatmu sudah tercatat. Kamu tetap bisa menggunakan Zivizip sebagai tamu.',
      )}
    </p>
    <button class="primary" onclick={() => modal.close()}
      >{t('Back to workspace', 'Kembali ke workspace')}</button
    >
  {:else}
    <p>
      {t(
        'Account registration is not available yet. You can use Zivizip as a guest, with your workspace stored only in this browser. Interested in an account? Leave your email and tell us what you would like to do with Zivizip.',
        'Pendaftaran akun belum tersedia. Kamu tetap bisa menggunakan Zivizip sebagai tamu, dengan workspace yang tersimpan hanya di browser ini. Tertarik memiliki akun? Tinggalkan email dan ceritakan kebutuhan atau fitur yang kamu harapkan dari Zivizip.',
      )}
    </p>
    <form onsubmit={interest}>
      <label
        >Email<input
          type="email"
          bind:value={email}
          autocomplete="email"
          required
          maxlength="254"
        /></label
      ><label
        >{t(
          'What would you like from Zivizip?',
          'Apa yang kamu harapkan dari Zivizip?',
        )}<textarea
          class="message-field"
          bind:value={message}
          required
          maxlength="3000"
          rows="4"
        ></textarea></label
      >
      <p class="muted">
        {t(
          'Submitting sends only this email and message to Zivizip. Your guest notes stay in your browser. This does not create an account.',
          'Saat dikirim, hanya email dan pesan ini yang disampaikan ke Zivizip. Catatan tamu tetap di browsermu. Formulir ini tidak membuat akun.',
        )}
      </p>
      <button class="primary" disabled={sending || !online}
        >{sending
          ? t('Sending…', 'Mengirim…')
          : t('Send interest', 'Kirim minat')}</button
      ><button
        type="button"
        disabled={sending}
        onclick={() => {
          screen = 'login';
          error = '';
        }}>{t('Back to login', 'Kembali ke login')}</button
      >
    </form>
  {/if}
</dialog>

<style>
  .message-field {
    width: 100%;
    resize: vertical;
    padding: 12px;
    background: #101719;
    color: inherit;
    border: 1px solid #34505b;
    border-radius: 7px;
  }
  .form-error {
    color: #ff9a9e;
  }
  form > button {
    margin: 6px 6px 0 0;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
