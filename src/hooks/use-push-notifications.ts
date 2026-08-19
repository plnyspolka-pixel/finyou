// Hook zarządzający subskrypcją Web Push bieżącej przeglądarki
// (panel operatora). Rejestruje service workera public/push-sw.js,
// prosi o zgodę na powiadomienia i zapisuje subskrypcję na serwerze.
import { useCallback, useEffect, useState } from "react";
import {
  getPushConfig,
  registerPushSubscription,
  unregisterPushSubscription,
} from "@/lib/push.functions";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function subscriptionKeys(sub: PushSubscription): { p256dh: string; auth: string } | null {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) return null;
  return { p256dh, auth };
}

export type PushNotificationsState = {
  /** Przeglądarka wspiera Web Push (SW + PushManager + Notification). */
  supported: boolean;
  /** Serwer ma skonfigurowane klucze VAPID. */
  configured: boolean;
  permission: NotificationPermission | null;
  subscribed: boolean;
  loading: boolean;
  error: string | null;
  enable: () => Promise<boolean>;
  disable: () => Promise<void>;
};

export function usePushNotifications(): PushNotificationsState {
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  const [configured, setConfigured] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(
    supported ? Notification.permission : null,
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await getPushConfig();
        if (cancelled) return;
        setConfigured(cfg.enabled);
        setPublicKey(cfg.publicKey);
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (!cancelled) setSubscribed(Boolean(sub));
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const enable = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (!supported || !publicKey) return false;
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return false;

      const reg = await navigator.serviceWorker.register("/push-sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
        }));
      const keys = subscriptionKeys(sub);
      if (!keys) throw new Error("Przeglądarka nie zwróciła kluczy subskrypcji");
      await registerPushSubscription({
        data: {
          endpoint: sub.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: navigator.userAgent.slice(0, 400),
        },
      });
      setSubscribed(true);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [supported, publicKey]);

  const disable = useCallback(async (): Promise<void> => {
    setError(null);
    if (!supported) return;
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        try {
          await unregisterPushSubscription({ data: { endpoint: sub.endpoint } });
        } finally {
          await sub.unsubscribe();
        }
      }
      setSubscribed(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [supported]);

  return { supported, configured, permission, subscribed, loading, error, enable, disable };
}
