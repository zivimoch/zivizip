<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from './Icon.svelte';
  export let language: 'en' | 'id';
  type InstallPrompt = Event & {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  let pending: InstallPrompt | null = null;
  let installed = false;
  let ios = false;
  let busy = false;
  let help: HTMLDialogElement;
  let message = '';
  const t = (en: string, id: string) => (language === 'id' ? id : en);
  function markInstalled() {
    installed = true;
    pending = null;
    if (ios) {
      try {
        localStorage.setItem('zivizip-ios-installed', '1');
      } catch {
        /* Storage may be unavailable. */
      }
    }
    help?.close();
  }
  onMount(() => {
    ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const mode = matchMedia(
      '(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui), (display-mode: window-controls-overlay)',
    );
    const update = () => {
      if (
        mode.matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone
      )
        markInstalled();
    };
    if (ios) {
      try {
        installed = localStorage.getItem('zivizip-ios-installed') === '1';
      } catch {
        /* Storage may be unavailable. */
      }
    }
    update();
    const available = (event: Event) => {
      event.preventDefault();
      if (!installed) pending = event as InstallPrompt;
    };
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', markInstalled);
    mode.addEventListener('change', update);
    return () => {
      window.removeEventListener('beforeinstallprompt', available);
      window.removeEventListener('appinstalled', markInstalled);
      mode.removeEventListener('change', update);
    };
  });
  async function install() {
    if (!pending) {
      help.showModal();
      return;
    }
    const prompt = pending;
    pending = null;
    busy = true;
    message = '';
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') installed = true;
    } catch {
      message = t(
        'Use your browser menu to install Zivizip.',
        'Gunakan menu browser untuk memasang Zivizip.',
      );
      help.showModal();
    } finally {
      busy = false;
    }
  }
</script>

{#if !installed && (pending || ios || busy)}
  <div class="pwa-install">
    <button
      onclick={install}
      disabled={busy}
      aria-label={t('Install Zivizip', 'Pasang Zivizip')}
    >
      <Icon name="download" />{t('Install app', 'Pasang aplikasi')}
    </button>
  </div>
{/if}
<dialog bind:this={help} aria-label={t('Install Zivizip', 'Pasang Zivizip')}>
  <h2>{t('Install Zivizip', 'Pasang Zivizip')}</h2>
  <p>
    {message ||
      t(
        'On iPhone or iPad, open this site in Safari, tap Share, then Add to Home Screen.',
        'Di iPhone atau iPad, buka situs ini di Safari, ketuk Bagikan, lalu Tambahkan ke Layar Utama.',
      )}
  </p>
  {#if ios}<p>
      {t(
        'Safari cannot always tell this tab whether the app is already installed.',
        'Safari tidak selalu dapat memberi tahu tab ini apakah aplikasi sudah terpasang.',
      )}
    </p>{/if}
  <div class="actions">
    {#if ios}<button onclick={markInstalled}
        >{t('Already installed', 'Sudah terpasang')}</button
      >{/if}
    <button onclick={() => help.close()}>{t('Close', 'Tutup')}</button>
  </div>
</dialog>

<style>
  .pwa-install {
    height: 40px;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    padding: 0 12px;
  }
  .pwa-install button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 10px;
    font-size: 12px;
    color: var(--accent);
  }
  :global(body:has(.pwa-install) .workspace) {
    height: calc(100dvh - 40px);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  @media (max-width: 800px) {
    .pwa-install {
      position: fixed;
      right: 8px;
      top: 4px;
      height: 40px;
      padding: 0;
      z-index: 101;
    }
    .pwa-install button {
      min-height: 40px;
    }
    :global(body:has(.pwa-install) .workspace) {
      height: calc(100dvh - 108px);
    }
  }
</style>
