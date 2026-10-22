// Browser stand-in for the one node:crypto call in src/core/hash.js. Vite aliases
// node:crypto to this file so the demo bundles the core unchanged.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export function createHash(algorithm) {
  if (algorithm !== 'sha256') throw new Error('hash.algorithm-unsupported');
  const chunks = [];
  return {
    update(data, encoding) {
      if (encoding !== 'utf8') throw new Error('hash.encoding-unsupported');
      chunks.push(data);
      return this;
    },
    digest(encoding) {
      if (encoding !== 'hex') throw new Error('hash.encoding-unsupported');
      return bytesToHex(sha256(utf8ToBytes(chunks.join(''))));
    },
  };
}
