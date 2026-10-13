import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import * as forge from 'node-forge';
import { CredentialsService } from '../credentials/credentials.service';

const CA_DOC_ID = 'platform-ca';
const CA_VALIDITY_YEARS = 10;
// Below the 398-day ceiling clients enforce for server certificates.
const LEAF_VALIDITY_DAYS = 397;

export interface IssuedCertificate {
  certPem: string;
  keyPem: string;
  caPem: string;
  expiresAt: Date;
  serialNumber: string;
}

/**
 * The platform's own certificate authority for customer MongoDB clusters.
 * Public CAs cannot issue for the in-cluster member hostnames the MongoDB
 * operator requires in the server certificate, so — like DocumentDB or
 * DigitalOcean managed databases — clusters get certificates from a platform
 * CA that customers trust via the downloadable eutlas-ca.pem.
 */
@Injectable()
export class PlatformCaService {
  private readonly logger = new Logger(PlatformCaService.name);
  private ca?: { cert: forge.pki.Certificate; key: forge.pki.rsa.PrivateKey; pem: string };

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(forwardRef(() => CredentialsService)) private readonly credentials: CredentialsService,
  ) {}

  async getCaPem(): Promise<string> {
    return (await this.loadOrCreateCa()).pem;
  }

  /** Server certificate for a cluster, valid for its in-cluster and external hostnames. */
  async issueServerCertificate(params: { commonName: string; dnsNames: string[] }): Promise<IssuedCertificate> {
    const ca = await this.loadOrCreateCa();
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = randomSerial();
    cert.validity.notBefore = new Date(Date.now() - 5 * 60_000);
    cert.validity.notAfter = new Date(Date.now() + LEAF_VALIDITY_DAYS * 86_400_000);
    cert.setSubject([{ name: 'commonName', value: params.commonName }, { name: 'organizationName', value: 'EUTLAS' }]);
    cert.setIssuer(ca.cert.subject.attributes);
    cert.setExtensions([
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      // clientAuth: members authenticate to each other with the same certificate.
      { name: 'extKeyUsage', serverAuth: true, clientAuth: true },
      { name: 'subjectAltName', altNames: [...new Set(params.dnsNames)].map((value) => ({ type: 2, value })) },
      { name: 'subjectKeyIdentifier' },
      { name: 'authorityKeyIdentifier', keyIdentifier: ca.cert.generateSubjectKeyIdentifier().getBytes() },
    ]);
    cert.sign(ca.key, forge.md.sha256.create());

    return {
      certPem: forge.pki.certificateToPem(cert),
      keyPem: forge.pki.privateKeyToPem(keys.privateKey),
      caPem: ca.pem,
      expiresAt: cert.validity.notAfter,
      serialNumber: cert.serialNumber,
    };
  }

  private async loadOrCreateCa() {
    if (this.ca) return this.ca;
    const collection = this.connection.collection<{ _id: string }>('platformsecrets');

    let doc = await collection.findOne({ _id: CA_DOC_ID });
    if (!doc) {
      this.logger.log('Generating platform CA (one-time)');
      const keys = forge.pki.rsa.generateKeyPair(4096);
      const cert = forge.pki.createCertificate();
      cert.publicKey = keys.publicKey;
      cert.serialNumber = randomSerial();
      cert.validity.notBefore = new Date(Date.now() - 5 * 60_000);
      cert.validity.notAfter = new Date(Date.now() + CA_VALIDITY_YEARS * 365 * 86_400_000);
      const subject = [
        { name: 'commonName', value: 'EUTLAS Database Root CA' },
        { name: 'organizationName', value: 'EUTLAS' },
        { name: 'countryName', value: 'DE' },
      ];
      cert.setSubject(subject);
      cert.setIssuer(subject);
      cert.setExtensions([
        { name: 'basicConstraints', cA: true, critical: true },
        { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
        { name: 'subjectKeyIdentifier' },
      ]);
      cert.sign(keys.privateKey, forge.md.sha256.create());
      try {
        await collection.insertOne({
          _id: CA_DOC_ID,
          certPem: forge.pki.certificateToPem(cert),
          keyEncrypted: this.credentials.encryptString(forge.pki.privateKeyToPem(keys.privateKey)),
          createdAt: new Date(),
        } as any);
      } catch (error: any) {
        if (error?.code !== 11000) throw error; // another replica created it first
      }
      doc = await collection.findOne({ _id: CA_DOC_ID });
    }

    const certPem = (doc as any).certPem as string;
    this.ca = {
      cert: forge.pki.certificateFromPem(certPem),
      key: forge.pki.privateKeyFromPem(this.credentials.decryptString((doc as any).keyEncrypted)) as forge.pki.rsa.PrivateKey,
      pem: certPem,
    };
    return this.ca;
  }
}

function randomSerial(): string {
  // Positive 128-bit serial (leading byte < 0x80).
  const bytes = forge.random.getBytesSync(16);
  return '7' + forge.util.bytesToHex(bytes).slice(1);
}
