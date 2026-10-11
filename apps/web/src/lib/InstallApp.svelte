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
  function place(node: HTMLElement) {
    const marker = document.createComment('Install action');
    node.after(marker);
    const mobile = matchMedia('(max-width: 800px)');
    const move = () => {
      const slot = document.getElementById('desktop-install-slot');
      if (!mobile.matches && slot) slot.append(node);
      else marker.before(node);
    };
    queueMicrotask(move);
    mobile.addEventListener('change', move);
    return {
      destroy() {
        mobile.removeEventListener('change', move);
        marker.remove();
        node.remove();
      },
    };
  }
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
  <div class="pwa-install" use:place>
    <button
      onclick={install}
      disabled={busy}
      aria-label={t('Install Zivizip', 'Pasang Zivizip')}
    >
      <Icon name="download" /><span>{t('Install app', 'Pasang aplikasi')}</span>
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
    display: flex;
    align-items: center;
    margin-bottom: 8px;
  }
  .pwa-install button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 12px 16px;
    border: 0;
    background: transparent;
    white-space: nowrap;
    font-size: 12px;
    color: var(--accent);
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
      margin: 0;
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
