const soundUrls = {
  newGame: '/music/newgamestart.mp3',
  pieceMove: '/music/Piece-Move.mp3',
  tigerCapture: '/music/tiger-points.mp3',
  winning: '/music/winning-sound.mp3',
  hover: '/music/hover.mp3',
  buttonClick: '/music/click.mp3'
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
