const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const keysDir = path.resolve(__dirname, '../../keys');

if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'P-384',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

fs.writeFileSync(path.join(keysDir, 'ecdsa-private.pem'), privateKey);
fs.writeFileSync(path.join(keysDir, 'ecdsa-public.pem'), publicKey);

console.log('ECDSA P-384 key pair generated successfully in ./keys/');
