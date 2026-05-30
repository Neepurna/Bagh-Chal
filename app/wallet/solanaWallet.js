const PHANTOM_DOWNLOAD_URL = 'https://phantom.app/download';

function getProvider() {
  if (typeof window === 'undefined') return null;
  const provider = window.phantom?.solana || window.solana;
  return provider?.isPhantom ? provider : null;
}

export function getPhantomProvider() {
  return getProvider();
}

export async function connectPhantomWallet() {
  const provider = getProvider();
  if (!provider) {
    return {
      ok: false,
      error: 'Phantom wallet is not installed.',
      installUrl: PHANTOM_DOWNLOAD_URL
    };
  }

  const response = await provider.connect();
  const publicKey = response?.publicKey?.toString() || provider.publicKey?.toString();
  if (!publicKey) {
    return { ok: false, error: 'Phantom did not return a Solana address.' };
  }

  return { ok: true, provider, publicKey };
}

export async function signWalletMessage(message) {
  const provider = getProvider();
  if (!provider) throw new Error('Phantom wallet is not installed.');
  if (!provider.publicKey) await provider.connect();
  if (typeof provider.signMessage !== 'function') {
    throw new Error('This Phantom session cannot sign messages.');
  }

  const encoded = new TextEncoder().encode(message);
  const signed = await provider.signMessage(encoded, 'utf8');
  const signature = signed?.signature || signed;
  return bytesToBase64(signature);
}

function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  view.forEach((byte) => { binary += String.fromCharCode(byte); });
  return window.btoa(binary);
}
