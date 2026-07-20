// Kryptografia modułu AML — czysty Node (node:crypto), bez zewnętrznych
// bibliotek:
//  - DER/ASN.1: mini-koder i mini-parser (tylko konstrukcje potrzebne niżej),
//  - generowanie klucza RSA + CSR PKCS#10 dla certyfikatu komunikacyjnego
//    SI*GIIF (klucz prywatny natychmiast opakowywany kopertą "KMS"),
//  - weryfikacja podpisu kwalifikowanego CMS/PKCS#7 (CAdES, RSA+SHA-256):
//    struktura SignedData, atrybut messageDigest, podpis po signedAttrs,
//  - szyfrowanie pliku certyfikatem GIIF (CMS EnvelopedData, AES-256-CBC
//    + RSAES-PKCS1-v1_5 dla klucza sesyjnego).
//
// ZASADY BEZPIECZEŃSTWA:
//  - klucz prywatny podpisu inwestora NIGDY nie trafia do Finance You —
//    podpisuje lokalnie inwestor; my tylko weryfikujemy odebrany plik,
//  - PIN nie jest nigdzie pobierany ani zapisywany,
//  - klucze certyfikatów komunikacyjnych są szyfrowane przez AmlKeyProvider
//    (LocalEnvelopeKeyProvider = lokalna koperta AES-256-GCM na
//    AML_ENVELOPE_MASTER_KEY, dopuszczona tylko do testów/developmentu;
//    produkcyjnie ProductionKmsKeyProvider z prawdziwym KMS/HSM) — nigdy
//    w zwykłych tabelach ani frontendzie.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  generateKeyPairSync,
  publicEncrypt,
  randomBytes,
  sign as cryptoSign,
  verify as cryptoVerify,
  constants as cryptoConstants,
  X509Certificate,
} from "node:crypto";

// ── DER: koder ───────────────────────────────────────────────────────
function derLength(n: number): Uint8Array {
  if (n < 0x80) return Uint8Array.of(n);
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v >>= 8;
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

function tlv(tag: number, content: Uint8Array): Uint8Array {
  const len = derLength(content.length);
  const out = new Uint8Array(1 + len.length + content.length);
  out[0] = tag;
  out.set(len, 1);
  out.set(content, 1 + len.length);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

const seq = (...p: Uint8Array[]) => tlv(0x30, concat(...p));
const set = (...p: Uint8Array[]) => tlv(0x31, concat(...p));
const octet = (b: Uint8Array) => tlv(0x04, b);
const utf8 = (s: string) => tlv(0x0c, new TextEncoder().encode(s));
const printable = (s: string) => tlv(0x13, new TextEncoder().encode(s));
const derNull = () => Uint8Array.of(0x05, 0x00);
const ctx = (n: number, content: Uint8Array, constructed = true) =>
  tlv((constructed ? 0xa0 : 0x80) | n, content);

function derInt(n: number | Uint8Array): Uint8Array {
  if (typeof n !== "number") return tlv(0x02, n);
  if (n === 0) return Uint8Array.of(0x02, 0x01, 0x00);
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v >>= 8;
  }
  if (bytes[0] & 0x80) bytes.unshift(0);
  return tlv(0x02, Uint8Array.from(bytes));
}

function oid(dotted: string): Uint8Array {
  const parts = dotted.split(".").map(Number);
  const bytes: number[] = [parts[0] * 40 + parts[1]];
  for (const p of parts.slice(2)) {
    if (p < 0x80) {
      bytes.push(p);
    } else {
      const chunk: number[] = [];
      let v = p;
      while (v > 0) {
        chunk.unshift((v & 0x7f) | 0x80);
        v >>= 7;
      }
      chunk[chunk.length - 1] &= 0x7f;
      bytes.push(...chunk);
    }
  }
  return tlv(0x06, Uint8Array.from(bytes));
}

const bitString = (b: Uint8Array) => tlv(0x03, concat(Uint8Array.of(0), b));

// Najczęstsze OID-y.
const OID = {
  signedData: "1.2.840.113549.1.7.2",
  envelopedData: "1.2.840.113549.1.7.3",
  data: "1.2.840.113549.1.7.1",
  rsaEncryption: "1.2.840.113549.1.1.1",
  sha256WithRsa: "1.2.840.113549.1.1.11",
  sha256: "2.16.840.1.101.3.4.2.1",
  aes256Cbc: "2.16.840.1.101.3.4.1.42",
  messageDigest: "1.2.840.113549.1.9.4",
  contentType: "1.2.840.113549.1.9.3",
  cn: "2.5.4.3",
  o: "2.5.4.10",
  c: "2.5.4.6",
  serialNumber: "2.5.4.5",
};

// ── DER: parser ──────────────────────────────────────────────────────
export interface DerNode {
  tag: number;
  constructed: boolean;
  content: Uint8Array;
  raw: Uint8Array;
  children: DerNode[];
}

function parseDerNode(bytes: Uint8Array, offset: number): { node: DerNode; next: number } {
  const tag = bytes[offset];
  const constructed = (tag & 0x20) !== 0;
  const lenByte = bytes[offset + 1];
  let len = 0;
  let headLen = 2;
  if (lenByte < 0x80) {
    len = lenByte;
  } else {
    const numBytes = lenByte & 0x7f;
    for (let i = 0; i < numBytes; i++) len = (len << 8) | bytes[offset + 2 + i];
    headLen = 2 + numBytes;
  }
  const content = bytes.slice(offset + headLen, offset + headLen + len);
  const raw = bytes.slice(offset, offset + headLen + len);
  const children: DerNode[] = [];
  if (constructed) {
    let o = 0;
    while (o < content.length) {
      const child = parseDerNode(content, o);
      children.push(child.node);
      o = child.next;
    }
  }
  return { node: { tag, constructed, content, raw, children }, next: offset + headLen + len };
}

export function parseDer(bytes: Uint8Array): DerNode {
  return parseDerNode(bytes, 0).node;
}

function oidToString(content: Uint8Array): string {
  const first = content[0];
  const parts = [Math.floor(first / 40), first % 40];
  let v = 0;
  for (let i = 1; i < content.length; i++) {
    v = (v << 7) | (content[i] & 0x7f);
    if ((content[i] & 0x80) === 0) {
      parts.push(v);
      v = 0;
    }
  }
  return parts.join(".");
}

// ── PEM ──────────────────────────────────────────────────────────────
export function derToPem(der: Uint8Array, label: string): string {
  const b64 = Buffer.from(der).toString("base64");
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

export function pemToDer(pem: string): Uint8Array {
  const b64 = pem.replace(/-----(BEGIN|END)[^-]+-----/g, "").replace(/\s+/g, "");
  return new Uint8Array(Buffer.from(b64, "base64"));
}

// ── Koperta lokalna na klucz prywatny certyfikatu komunikacyjnego ────
// UWAGA: to NIE jest KMS/HSM — to lokalne szyfrowanie AES-256-GCM na
// master-kluczu AML_ENVELOPE_MASTER_KEY z sekretów środowiska. Wybór
// mechanizmu (lokalna koperta vs produkcyjny KMS/HSM) robi AmlKeyProvider
// (key-provider.server.ts); te funkcje to implementacja wariantu lokalnego.
function envelopeMasterKey(): Buffer {
  const raw = process.env.AML_ENVELOPE_MASTER_KEY ?? process.env.AML_KMS_MASTER_KEY;
  if (!raw) throw new Error("Brak AML_ENVELOPE_MASTER_KEY w sekretach środowiska.");
  if (!process.env.AML_ENVELOPE_MASTER_KEY && process.env.AML_KMS_MASTER_KEY) {
    console.warn(
      "[AML] AML_KMS_MASTER_KEY jest przestarzałe (to nie jest KMS) — zmień nazwę sekretu na AML_ENVELOPE_MASTER_KEY.",
    );
  }
  return createHash("sha256").update(raw).digest();
}

export function envelopeEncrypt(plaintext: string): { envelope: string; keyRef: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", envelopeMasterKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope = Buffer.concat([iv, tag, ct]).toString("base64");
  const keyRef = `envelope:local:${createHash("sha256").update(envelope).digest("hex").slice(0, 24)}`;
  return { envelope, keyRef };
}

export function envelopeDecrypt(envelope: string): string {
  const buf = Buffer.from(envelope, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", envelopeMasterKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// ── CSR PKCS#10 ──────────────────────────────────────────────────────
export interface CsrSubject {
  commonName: string; // np. "Finance You – <organizacja>"
  organization: string;
  country: string; // "PL"
  serialNumber?: string; // NIP
}

export interface GeneratedCsr {
  csrPem: string;
  /** Surowy klucz prywatny PKCS#8 — NATYCHMIAST zaszyfruj przez AmlKeyProvider
   *  i nadpisz; nigdy nie zapisuj w bazie, logach ani frontendzie. */
  privateKeyPem: string;
  subjectDn: string;
  publicKeyPem: string;
}

/** Generuje parę kluczy RSA-3072 i CSR PKCS#10 podpisany SHA256withRSA. */
export function generateCsr(subject: CsrSubject): GeneratedCsr {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });

  const rdn = (oidStr: string, value: string, printableStr = false) =>
    set(seq(oid(oidStr), printableStr ? printable(value) : utf8(value)));
  const nameParts = [
    rdn(OID.c, subject.country, true),
    rdn(OID.o, subject.organization),
    rdn(OID.cn, subject.commonName),
  ];
  if (subject.serialNumber) nameParts.push(rdn(OID.serialNumber, subject.serialNumber, true));
  const name = seq(...nameParts);

  const spkiDer = new Uint8Array(publicKey.export({ type: "spki", format: "der" }));
  // CertificationRequestInfo ::= SEQ { version=0, subject, SPKI, attributes [0] }
  const cri = seq(derInt(0), name, spkiDer, ctx(0, new Uint8Array(0)));
  const signature = cryptoSign("sha256", cri, privateKey);
  const csr = seq(
    cri,
    seq(oid(OID.sha256WithRsa), derNull()),
    bitString(new Uint8Array(signature)),
  );

  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const subjectDn = [
    `C=${subject.country}`,
    `O=${subject.organization}`,
    `CN=${subject.commonName}`,
    ...(subject.serialNumber ? [`serialNumber=${subject.serialNumber}`] : []),
  ].join(", ");

  return {
    csrPem: derToPem(csr, "CERTIFICATE REQUEST"),
    privateKeyPem,
    subjectDn,
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

/** Sprawdza, czy wydany certyfikat odpowiada kluczowi publicznemu z CSR. */
export function certificateMatchesCsr(certificatePem: string, csrPem: string): boolean {
  try {
    const cert = new X509Certificate(certificatePem);
    const csr = parseDer(pemToDer(csrPem));
    const cri = csr.children[0];
    // SPKI to trzeci element CertificationRequestInfo (version, subject, SPKI).
    const spki = cri.children[2];
    const csrKey = createPublicKey({ key: Buffer.from(spki.raw), format: "der", type: "spki" });
    const a = cert.publicKey.export({ type: "spki", format: "der" });
    const b = csrKey.export({ type: "spki", format: "der" });
    return Buffer.compare(a as Buffer, b as Buffer) === 0;
  } catch {
    return false;
  }
}

// ── Weryfikacja podpisu CMS/PKCS#7 (CAdES) ───────────────────────────
export interface CmsVerificationResult {
  valid: boolean;
  errors: string[];
  signerSubject?: string;
  signerIssuer?: string;
  signedAt?: string;
  certificatePem?: string;
}

/**
 * Weryfikuje podpisany plik CMS/PKCS#7 (typowy .xades/.p7s z podpisem
 * kwalifikowanym RSA+SHA-256):
 *  1. struktura ContentInfo → SignedData,
 *  2. digest treści zgodny z atrybutem messageDigest,
 *  3. podpis kryptograficzny po signedAttrs zweryfikowany kluczem z
 *     certyfikatu podpisującego,
 *  4. zwraca dane podpisującego (walidacja ścieżki certyfikacji do
 *     zaufanego centrum kwalifikowanego pozostaje po stronie GIIF,
 *     który jest właściwym walidatorem prawnym podpisu).
 */
export function verifyCmsSignature(
  signedBytes: Uint8Array,
  expectedContent?: Uint8Array,
): CmsVerificationResult {
  const errors: string[] = [];
  try {
    const root = parseDer(signedBytes);
    const contentTypeOid = oidToString(root.children[0].content);
    if (contentTypeOid !== OID.signedData) {
      return { valid: false, errors: [`To nie jest CMS SignedData (OID ${contentTypeOid})`] };
    }
    const signedData = root.children[1].children[0]; // [0] EXPLICIT → SEQ
    const [, , encapContentInfo, ...rest] = signedData.children;

    // Treść: osadzona (attached) albo odłączona (detached).
    let content: Uint8Array | undefined = expectedContent;
    const encapContent = encapContentInfo.children[1];
    if (encapContent) {
      const octetNode = encapContent.children[0];
      content = octetNode.constructed
        ? concat(...octetNode.children.map((c) => c.content))
        : octetNode.content;
    }
    if (!content)
      return { valid: false, errors: ["Podpis odłączony (detached) — brak treści do weryfikacji"] };

    // Certyfikaty [0] IMPLICIT i signerInfos (ostatni element SET).
    const certsNode = rest.find((n) => (n.tag & 0x1f) === 0 && (n.tag & 0xc0) === 0x80);
    const signerInfos = signedData.children[signedData.children.length - 1];
    const signerInfo = signerInfos.children[0];
    if (!signerInfo) return { valid: false, errors: ["Brak SignerInfo"] };

    let certificatePem: string | undefined;
    let signerSubject: string | undefined;
    let signerIssuer: string | undefined;
    let signerCert: X509Certificate | undefined;
    if (certsNode && certsNode.children.length > 0) {
      const certDer = certsNode.children[0].raw;
      signerCert = new X509Certificate(Buffer.from(certDer));
      certificatePem = derToPem(certDer, "CERTIFICATE");
      signerSubject = signerCert.subject.replace(/\n/g, ", ");
      signerIssuer = signerCert.issuer.replace(/\n/g, ", ");
    } else {
      return { valid: false, errors: ["Podpisany plik nie zawiera certyfikatu podpisującego"] };
    }

    // SignerInfo: version, sid, digestAlgorithm, [0] signedAttrs?, sigAlg, signature.
    const siChildren = signerInfo.children;
    let idx = 3;
    let signedAttrs: DerNode | undefined;
    if (
      siChildren[idx] &&
      (siChildren[idx].tag & 0xc0) === 0x80 &&
      (siChildren[idx].tag & 0x1f) === 0
    ) {
      signedAttrs = siChildren[idx];
      idx++;
    }
    const signatureNode = siChildren[idx + 1];
    const signature = signatureNode.content;

    const contentDigest = createHash("sha256").update(content).digest();

    if (signedAttrs) {
      // messageDigest musi się zgadzać z digestem treści.
      let messageDigest: Uint8Array | undefined;
      for (const attr of signedAttrs.children) {
        const attrOid = oidToString(attr.children[0].content);
        if (attrOid === OID.messageDigest) messageDigest = attr.children[1].children[0].content;
      }
      if (!messageDigest) {
        errors.push("Brak atrybutu messageDigest w signedAttrs");
      } else if (Buffer.compare(Buffer.from(messageDigest), contentDigest) !== 0) {
        errors.push(
          "Digest treści nie zgadza się z atrybutem messageDigest — plik zmieniony po podpisaniu",
        );
      }
      // Podpis liczony po signedAttrs z tagiem SET (0x31) zamiast [0].
      const attrsForSig = new Uint8Array(signedAttrs.raw);
      attrsForSig[0] = 0x31;
      const ok = cryptoVerify("sha256", attrsForSig, signerCert.publicKey, Buffer.from(signature));
      if (!ok) errors.push("Weryfikacja kryptograficzna podpisu nie powiodła się");
    } else {
      // Bez signedAttrs podpis liczony bezpośrednio po treści.
      const ok = cryptoVerify("sha256", content, signerCert.publicKey, Buffer.from(signature));
      if (!ok) errors.push("Weryfikacja kryptograficzna podpisu nie powiodła się");
    }

    return {
      valid: errors.length === 0,
      errors,
      signerSubject,
      signerIssuer,
      certificatePem,
      signedAt: signerCert.validFrom,
    };
  } catch (e) {
    return {
      valid: false,
      errors: [`Błąd parsowania CMS: ${e instanceof Error ? e.message : String(e)}`],
    };
  }
}

// ── Szyfrowanie certyfikatem GIIF (CMS EnvelopedData) ────────────────
/**
 * Szyfruje payload dla GIIF: AES-256-CBC na treści + klucz sesyjny
 * zaszyfrowany RSA kluczem publicznym z certyfikatu GIIF
 * (CMS EnvelopedData, RFC 5652).
 */
export function encryptForGiif(payload: Uint8Array, giifCertificatePem: string): Uint8Array {
  const cert = new X509Certificate(giifCertificatePem);
  const certDer = parseDer(pemToDer(giifCertificatePem));
  // TBSCertificate → serialNumber (drugi element; pierwszy to [0] version).
  const tbs = certDer.children[0];
  const tbsChildren = tbs.children;
  const serialIdx = (tbsChildren[0].tag & 0xc0) === 0x80 ? 1 : 0;
  const serial = tbsChildren[serialIdx];
  const issuer = tbsChildren[serialIdx + 2];

  const cek = randomBytes(32);
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", cek, iv);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);

  const encryptedKey = publicEncrypt(
    { key: cert.publicKey, padding: cryptoConstants.RSA_PKCS1_PADDING },
    cek,
  );

  // RecipientInfo (ktri): version=0, issuerAndSerialNumber, keyEncAlg, encryptedKey.
  const recipientInfo = seq(
    derInt(0),
    seq(issuer.raw, serial.raw),
    seq(oid(OID.rsaEncryption), derNull()),
    octet(new Uint8Array(encryptedKey)),
  );

  // EncryptedContentInfo: data, aes256-CBC(iv), [0] IMPLICIT encrypted.
  const encContentInfo = seq(
    oid(OID.data),
    seq(oid(OID.aes256Cbc), octet(new Uint8Array(iv))),
    ctx(0, new Uint8Array(encrypted), false),
  );

  const envelopedData = seq(derInt(0), set(recipientInfo), encContentInfo);
  return seq(oid(OID.envelopedData), ctx(0, envelopedData));
}
