const cryptoService = require('../src/services/cryptoService');

describe('CryptoService', () => {
  beforeAll(() => {
    cryptoService.loadKeys();
  });

  test('signApproval generates a valid base64 signature', () => {
    const data = { id: 'REQ-2026-0001', signer: 'Mutale Chilufya', role: 'Purchasing HOD' };
    const signature = cryptoService.signApproval(data);
    expect(signature).toBeTruthy();
    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(50);
  });

  test('verifySignature returns true for valid signature', () => {
    const data = { id: 'REQ-2026-0002', signer: 'Kondwelani Banda', role: 'Finance HOD' };
    const signature = cryptoService.signApproval(data);
    const publicKey = cryptoService.getPublicKey();
    const result = cryptoService.verifySignature(data, signature, publicKey);
    expect(result).toBe(true);
  });

  test('verifySignature returns false for tampered data', () => {
    const data = { id: 'REQ-2026-0003', signer: 'Sibongile Phiri', role: 'Director' };
    const signature = cryptoService.signApproval(data);

    const tamperedData = { ...data, role: 'Treasurer' };
    const publicKey = cryptoService.getPublicKey();
    const result = cryptoService.verifySignature(tamperedData, signature, publicKey);
    expect(result).toBe(false);
  });

  test('verifySignature returns false for wrong public key', () => {
    const { generateKeyPairSync } = require('crypto');
    const wrongKeys = generateKeyPairSync('ec', {
      namedCurve: 'P-384',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    const data = { id: 'REQ-2026-0004', signer: 'Bwalya Tembo', role: 'Treasurer' };
    const signature = cryptoService.signApproval(data);
    const result = cryptoService.verifySignature(data, signature, wrongKeys.publicKey);
    expect(result).toBe(false);
  });

  test('createVerificationPayload returns complete payload', () => {
    const result = cryptoService.createVerificationPayload(
      'REQ-2026-0005',
      'Chansa Mwape',
      'Requestor',
      'Pending',
      '2026-06-09 10:00'
    );

    expect(result.payload).toBeDefined();
    expect(result.payload.id).toBe('REQ-2026-0005');
    expect(result.payload.signer).toBe('Chansa Mwape');
    expect(result.signature).toBeTruthy();
    expect(result.publicKeyPem).toContain('-----BEGIN PUBLIC KEY-----');
    expect(result.qrData).toContain('REQ-2026-0005');
    expect(result.qrData).toContain(result.signature);
  });

  test('verifyQRCode validates complete QR data', () => {
    const vp = cryptoService.createVerificationPayload(
      'REQ-2026-0006',
      'Mutale Chilufya',
      'Purchasing HOD',
      'Pending',
      '2026-06-09 11:00'
    );

    const result = cryptoService.verifyQRCode(vp.qrData);
    expect(result.valid).toBe(true);
    expect(result.payload.id).toBe('REQ-2026-0006');
    expect(result.payload.signer).toBe('Mutale Chilufya');
  });

  test('verifyQRCode rejects tampered QR data', () => {
    // Create valid, then manually tamper
    const vp = cryptoService.createVerificationPayload(
      'REQ-2026-0007',
      'Bwalya Tembo',
      'Treasurer',
      'Change Returned/Pending',
      '2026-06-09 12:00'
    );

    const parsed = JSON.parse(vp.qrData);
    parsed.signer = 'EVIL HACKER';  // Tamper
    parsed.sig = vp.signature;      // Keep old sig
    const tamperedQr = JSON.stringify(parsed);

    const result = cryptoService.verifyQRCode(tamperedQr);
    expect(result.valid).toBe(false);
  });

  test('verifyQRCode returns error for missing signature', () => {
    const data = JSON.stringify({ id: 'REQ-0001', signer: 'Test' });
    const result = cryptoService.verifyQRCode(data);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('No signature');
  });

  test('getPublicKey returns PEM formatted key', () => {
    const key = cryptoService.getPublicKey();
    expect(key).toContain('-----BEGIN PUBLIC KEY-----');
    expect(key).toContain('-----END PUBLIC KEY-----');
  });
});
