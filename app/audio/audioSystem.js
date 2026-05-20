const soundUrls = {
  newGame:      '/assets/sound/confirmation_001.mp3',
  pieceMove:    '/assets/sound/Piece-Move.mp3',
  tigerCapture: '/assets/sound/capture.wav',
  winning:      '/assets/sound/Victoriy.wav',
  losing:       '/assets/sound/Defeat.wav',
  hover:        '/assets/sound/hover.wav',
  buttonClick:  '/assets/sound/click.wav'
};

const soundCache = {};
let audioUnlocked = false;

function attemptAudioUnlock() {
  if (audioUnlocked) return;

  const hover = soundCache.hover;
  if (!hover) return;

  hover.volume = 0;
  hover.play()
    .then(() => {
      hover.pause();
      hover.currentTime = 0;
      hover.volume = 1;
      audioUnlocked = true;
    })
    .catch(() => {
      hover.volume = 1;
    });
}

export function initAudioSystem() {
  Object.entries(soundUrls).forEach(([name, url]) => {
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.load();
    soundCache[name] = audio;
  });

  ['pointerenter', 'mousemove', 'pointerdown', 'mousedown', 'keydown', 'touchstart'].forEach((eventName) => {
    window.addEventListener(eventName, attemptAudioUnlock, { passive: true });
  });
}

export function playSound(name) {
  const base = soundCache[name];
  if (!base) return;

  const sound = base.cloneNode();
  sound.volume = name === 'hover' ? 0.8 : 1;
  sound.play().catch(() => {});
}
