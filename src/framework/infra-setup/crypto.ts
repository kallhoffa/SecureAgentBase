const generateKey = async (passphrase: string, salt: BufferSource) => {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

export const encryptData = async (data: unknown, passphrase: string) => {
  if (!passphrase) return JSON.stringify(data);
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await generateKey(passphrase, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(data))
  );
  const result = {
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(encrypted)))
  };
  return JSON.stringify(result);
};

export const decryptData = async (encryptedStr: string, passphrase: string) => {
  if (!passphrase) return JSON.parse(encryptedStr);
  try {
    const { salt, iv, data } = JSON.parse(encryptedStr);
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const saltArray = new Uint8Array(atob(salt).split('').map(c => c.charCodeAt(0)));
    const ivArray = new Uint8Array(atob(iv).split('').map(c => c.charCodeAt(0)));
    const dataArray = new Uint8Array(atob(data).split('').map(c => c.charCodeAt(0)));
    const key = await generateKey(passphrase, saltArray);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivArray },
      key,
      dataArray
    );
    return JSON.parse(decoder.decode(decrypted));
  } catch (e) {
    console.error('Decryption failed:', e);
    throw new Error('Invalid passphrase or corrupted data');
  }
};
