require('dotenv').config({ path: '.env' });

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'mysql://root:root@localhost:3306/cmes_requisitions_test';
}

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
}

process.env.NODE_ENV = 'test';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const keysDir = path.resolve(__dirname, '../keys');
if (!fs.existsSync(keysDir)) {
  fs.mkdirSync(keysDir, { recursive: true });
}

const privPath = path.join(keysDir, 'ecdsa-private.pem');
const pubPath = path.join(keysDir, 'ecdsa-public.pem');

if (!fs.existsSync(privPath) || !fs.existsSync(pubPath)) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-384',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
  fs.writeFileSync(privPath, privateKey);
  fs.writeFileSync(pubPath, publicKey);
}