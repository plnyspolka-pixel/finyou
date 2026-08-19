import { describe, it, expect } from "vitest";
import {
  b64urlDecode,
  b64urlEncode,
  buildVapidAuthHeader,
  encryptWebPushPayload,
} from "./web-push.server";

describe("web-push aes128gcm (RFC 8291)", () => {
  it("odtwarza wektor testowy z załącznika A RFC 8291", async () => {
    // https://www.rfc-editor.org/rfc/rfc8291#appendix-A
    const plaintext = new TextEncoder().encode("When I grow up, I want to be a watermelon");
    const p256dh =
      "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
    const auth = "BTBZMqHH6r4Tts7J_aSIgg";
    const asPublic = b64urlDecode(
      "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
    );
    const body = await encryptWebPushPayload(plaintext, p256dh, auth, {
      asPrivateJwk: {
        d: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
        x: b64urlEncode(asPublic.slice(1, 33)),
        y: b64urlEncode(asPublic.slice(33, 65)),
      },
      salt: b64urlDecode("DGv6ra1nlYgDCS1FRnbzlw"),
    });
    expect(b64urlEncode(body)).toBe(
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
    );
  });

  it("odrzuca nieprawidłowe klucze subskrypcji", async () => {
    await expect(
      encryptWebPushPayload(new Uint8Array([1]), b64urlEncode(new Uint8Array(10)), "AAAA"),
    ).rejects.toThrow();
  });
});

describe("VAPID (RFC 8292)", () => {
  it("buduje nagłówek z podpisem ES256 weryfikowalnym kluczem publicznym", async () => {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ]);
    const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));

    const header = await buildVapidAuthHeader("https://fcm.googleapis.com/fcm/send/abc", {
      publicKey: b64urlEncode(publicRaw),
      privateKey: jwk.d!,
      subject: "mailto:kontakt@financeyou.pl",
    });

    const m = header.match(/^vapid t=([^,]+), k=(.+)$/);
    expect(m).toBeTruthy();
    const [h, p, s] = m![1].split(".");
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(p)));
    expect(payload.aud).toBe("https://fcm.googleapis.com");
    expect(payload.sub).toBe("mailto:kontakt@financeyou.pl");
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));

    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pair.publicKey,
      b64urlDecode(s) as BufferSource,
      new TextEncoder().encode(`${h}.${p}`),
    );
    expect(valid).toBe(true);
  });
});
