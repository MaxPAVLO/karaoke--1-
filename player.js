// Музыка + защита от гашения экрана.
const Player = (() => {
  const audio = document.getElementById('audio');
  let fileUrl = null;
  let lock = null;

  async function keepAwake() {
    try { lock = await navigator.wakeLock.request('screen'); } catch {}
  }

  // Браузер снимает блокировку при сворачивании: включаем снова.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && fileUrl) keepAwake();
  });

  return {
    audio,
    play(blob) {
      fileUrl = URL.createObjectURL(blob);
      audio.src = fileUrl;
      audio.play();
      keepAwake();
    },
    toggle() {
      audio.paused ? audio.play() : audio.pause();
      return !audio.paused;            // true, если музыка играет
    },
    stop() {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      if (fileUrl) URL.revokeObjectURL(fileUrl);
      fileUrl = null;
      if (lock) lock.release();
      lock = null;
    },
  };
})();
