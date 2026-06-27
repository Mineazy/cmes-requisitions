const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

let privateKey = null;
let publicKey = null;

function loadKeys() {
  if (privateKey && publicKey) return;

  const privateKeyPath = path.resolve(process.env.ECDSA_PRIVATE_KEY_PATH || './keys/ecdsa-private.pem');
  const publicKeyPath = path.resolve(process.env.ECDSA_PUBLIC_KEY_PATH || './keys/ecdsa-public.pem');

  if (fs.existsSync(privateKeyPath) && fs.existsSync(publicKeyPath)) {
    privateKey = fs.readFileSync(privateKeyPath, 'utf8');
    publicKey = fs.readFileSync(publicKeyPath, 'utf8');
  } else {
    const { generateKeys } = require('../utils/generateKeys');
    const generated = generateKeyPairSync();
    privateKey = generated.privateKey;
    publicKey = generated.publicKey;
    fs.writeFileSync(privateKeyPath, privateKey);
    fs.writeFileSync(publicKeyPath, publicKey);
  }
}

function getPrivateKey() {
  loadKeys();
  return privateKey;
}

function getPublicKey() {
  loadKeys();
  return publicKey;
}

function generateKeyPairSync() {
  return crypto.generateKeyPairSync('ec', {
    namedCurve: 'P-384',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });
}

// Sign approval data with ECDSA
function signApproval(data) {
  const privateKeyObj = crypto.createPrivateKey(getPrivateKey());
  const dataStr = JSON.stringify(data);
  const sign = crypto.createSign('SHA384');
  sign.update(dataStr);
  sign.end();
  const signature = sign.sign(privateKeyObj, 'base64');
  return signature;
}

// Verify signature
function verifySignature(data, signature, pubKeyPem) {
  try {
    const publicKeyObj = crypto.createPublicKey(pubKeyPem);
    const dataStr = JSON.stringify(data);
    const verify = crypto.createVerify('SHA384');
    verify.update(dataStr);
    verify.end();
    return verify.verify(publicKeyObj, signature, 'base64');
  } catch {
    return false;
  }
}

// Create a QR-ready verification payload
function createVerificationPayload(reqId, signer, role, stage, timestamp) {
  const payload = {
    id: reqId,
    signer,
    role,
    stage,
    time: timestamp,
    v: 2
  };

  const signature = signApproval(payload);
  const pubKeyPem = getPublicKey();

  return {
    payload,
    signature,
    publicKeyPem: pubKeyPem,
    qrData: JSON.stringify({ ...payload, sig: signature })
  };
}

// Full verification
function verifyQRCode(qrDataString) {
  try {
    const data = JSON.parse(qrDataString);
    const { sig, publicKeyPem, ...payload } = data;

    if (!sig) {
      return { valid: false, error: 'No signature found in QR data' };
    }

    const isValid = verifySignature(payload, sig, publicKeyPem || getPublicKey());

    return {
      valid: isValid,
      payload,
      signature: sig
    };
  } catch (err) {
    return { valid: false, error: `Verification failed: ${err.message}` };
  }
}

module.exports = {
  loadKeys,
  getPublicKey,
  signApproval,
  verifySignature,
  createVerificationPayload,
  verifyQRCode
};
