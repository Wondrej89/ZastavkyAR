export function isStandalone({ media = globalThis.matchMedia, navigator = globalThis.navigator } = {}) {
  return Boolean(media?.('(display-mode: standalone)').matches || navigator?.standalone === true);
}

export function isIOS(navigator = globalThis.navigator) {
  const userAgent = navigator?.userAgent || '';
  return /iPad|iPhone|iPod/i.test(userAgent)
    || (navigator?.platform === 'MacIntel' && navigator?.maxTouchPoints > 1);
}

export function setupInstallUx({ button, dialog, message, closeButton, window = globalThis.window, navigator = globalThis.navigator }) {
  const displayMode = window.matchMedia('(display-mode: standalone)');
  let installPrompt = null;

  const updateButton = () => button.classList.toggle('hidden', isStandalone({ media: window.matchMedia.bind(window), navigator }));
  const openInstructions = () => {
    message.textContent = isIOS(navigator)
      ? 'Na iOS se instalace na plochu provádí přes tlačítko „Sdílet“ a „Přidat na plochu“.'
      : 'Aplikaci můžete přidat na domovskou obrazovku z menu prohlížeče.';
    dialog.showModal();
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    updateButton();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    button.classList.add('hidden');
  });
  displayMode.addEventListener?.('change', updateButton);

  button.addEventListener('click', async () => {
    if (isStandalone({ media: window.matchMedia.bind(window), navigator })) {
      updateButton();
      return;
    }
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      await prompt.prompt();
      return;
    }
    openInstructions();
  });
  closeButton.addEventListener('click', () => dialog.close());
  updateButton();
}
