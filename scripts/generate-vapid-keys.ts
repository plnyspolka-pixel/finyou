// Generator pary kluczy VAPID dla powiadomień push panelu operatora.
//
// Uruchom:  bun run scripts/generate-vapid-keys.ts
//
// Wynik ustaw jako sekrety środowiska aplikacji (NIE commituj do repo):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
// oraz opcjonalnie VAPID_SUBJECT (domyślnie mailto:kontakt@financeyou.pl).
// Format zgodny z `web-push generate-vapid-keys` — publiczny to base64url
// 65 bajtów punktu P-256, prywatny to base64url 32-bajtowego skalara d.

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);
const publicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);

console.log("VAPID_PUBLIC_KEY=" + b64url(publicRaw));
console.log("VAPID_PRIVATE_KEY=" + privateJwk.d);
