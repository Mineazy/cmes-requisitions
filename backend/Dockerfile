FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p keys && node -e "
const crypto = require('crypto');
const fs = require('fs');
const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
  namedCurve: 'P-384',
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});
fs.writeFileSync('keys/ecdsa-private.pem', privateKey);
fs.writeFileSync('keys/ecdsa-public.pem', publicKey);
"

EXPOSE 3001

CMD ["node", "src/index.js"]
