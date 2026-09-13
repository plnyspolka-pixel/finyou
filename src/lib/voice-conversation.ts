// Klient rozmowy głosowej z agentem ElevenLabs — własna implementacja zamiast
// osadzonego widgetu <elevenlabs-convai>.
//
// Po co własna: osadzony widget to obcy interfejs (angielskie napisy, cudze
// kolory i branding), którego nie da się ubrać w stronę Finance You. Tutaj
// ElevenLabs zostaje wyłącznie silnikiem rozmowy, a całe UI jest nasze
// (patrz components/landing/voice-call-widget.tsx).
//
// Protokół (WebSocket, podpisany URL z /api/public/voice-session):
//   → { type: "conversation_initiation_client_data", dynamic_variables }
//   → { user_audio_chunk: "<base64 PCM16 mono>" }        — mikrofon
//   → { type: "pong", event_id }                          — odbicie pinga
//   ← { type: "conversation_initiation_metadata", ... }   — formaty audio
//   ← { type: "audio", audio_event: { audio_base_64 } }   — głos Ani
//   ← { type: "agent_response" | "user_transcript" | "interruption" | "ping" }
//
// Świadomie bez pakietu @elevenlabs/client: bun.lock jest przypięty do
// rejestru Lovable, więc nowa zależność rozjechałaby lockfile (ta sama
// decyzja co przy dotychczasowych widgetach).
//
// Moduł jest bezpieczny dla SSR — API przeglądarki dotykamy dopiero w
// startVoiceConversation(), wywoływanym z interakcji użytkownika (dlatego bez
// przyrostka .client, którego build zabrania importować z komponentów).

export type VoiceState = "idle" | "connecting" | "listening" | "speaking" | "ended" | "error";

export interface VoiceConversationHandlers {
  onState?: (state: VoiceState) => void;
  onAgentMessage?: (text: string) => void;
  onUserMessage?: (text: string) => void;
  onError?: (message: string) => void;
}

export interface VoiceConversationOptions {
  /** Powierzchnia rozpoznawana przez /api/public/voice-session. */
  surface?: "intake" | "missing_info";
  /** Zmienne dynamiczne agenta (kanał, lead, brief braków…). */
  dynamicVariables?: Record<string, string | number | boolean>;
}

export interface VoiceConversation {
  /** Kończy rozmowę i zwalnia mikrofon. Wielokrotne wywołanie jest bezpieczne. */
  stop: () => void;
  /** Wyciszenie mikrofonu (Ania przestaje słyszeć, rozmowa trwa). */
  setMuted: (muted: boolean) => void;
}

const DEFAULT_SAMPLE_RATE = 16000;
/** Bufor mikrofonu ~256 ms przy 16 kHz — kompromis opóźnienie/liczba pakietów. */
const MIC_BUFFER_SIZE = 4096;

/** „pcm_16000" → 16000; inne (np. ulaw) obsługujemy jak domyślne 16 kHz. */
function parsePcmRate(format: unknown): number {
  const m = typeof format === "string" ? format.match(/^pcm_(\d+)$/) : null;
  const rate = m ? Number(m[1]) : NaN;
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_SAMPLE_RATE;
}

function base64FromInt16(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(binary);
}

function int16FromBase64(b64: string): Int16Array {
  const binary = atob(b64);
  const length = binary.length - (binary.length % 2);
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = binary.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/** Liniowe przepróbkowanie — gdy przeglądarka nie da AudioContextu w 16 kHz. */
function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

function floatToPcm16(input: Float32Array): Int16Array {
  const pcm = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm;
}

/** Wiadomości agenta, których używamy (reszta protokołu nas nie interesuje). */
interface ServerMessage {
  type?: string;
  conversation_initiation_metadata_event?: {
    user_input_audio_format?: string;
    agent_output_audio_format?: string;
  };
  audio_event?: { audio_base_64?: string; audio_base64?: string };
  agent_response_event?: { agent_response?: string };
  user_transcription_event?: { user_transcript?: string };
  ping_event?: { event_id?: number };
}

async function fetchSignedUrl(surface: "intake" | "missing_info"): Promise<string> {
  const res = await fetch("/api/public/voice-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ surface }),
  });
  const json: { ok?: boolean; signedUrl?: string; error?: string } = await res
    .json()
    .catch(() => ({}));
  if (!res.ok || !json?.ok || !json.signedUrl) {
    throw new Error(
      res.status === 429
        ? "Zbyt wiele prób połączenia. Spróbuj ponownie za chwilę."
        : "Rozmowa głosowa jest chwilowo niedostępna.",
    );
  }
  return json.signedUrl;
}

/**
 * Startuje rozmowę: pyta o mikrofon, otwiera sesję i zaczyna strumieniować
 * dźwięk w obie strony. Rzuca wyjątkiem z komunikatem PO POLSKU, gdy
 * użytkownik nie zgodzi się na mikrofon albo sesji nie da się otworzyć.
 */
export async function startVoiceConversation(
  options: VoiceConversationOptions,
  handlers: VoiceConversationHandlers = {},
): Promise<VoiceConversation> {
  const surface = options.surface ?? "intake";
  const setState = (s: VoiceState) => handlers.onState?.(s);

  if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Ta przeglądarka nie obsługuje rozmów głosowych.");
  }

  setState("connecting");

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    throw new Error("Nie mam dostępu do mikrofonu — zezwól na mikrofon w przeglądarce.");
  }

  let signedUrl: string;
  try {
    signedUrl = await fetchSignedUrl(surface);
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    throw e;
  }

  const AudioCtor: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const micCtx = new AudioCtor({ sampleRate: DEFAULT_SAMPLE_RATE });
  const playCtx = new AudioCtor();
  const ws = new WebSocket(signedUrl);

  let stopped = false;
  let muted = false;
  let inputRate = DEFAULT_SAMPLE_RATE;
  let outputRate = DEFAULT_SAMPLE_RATE;
  let nextPlayAt = 0;
  const playing = new Set<AudioBufferSourceNode>();

  const stopPlayback = () => {
    for (const src of playing) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        /* źródło mogło już się skończyć */
      }
    }
    playing.clear();
    nextPlayAt = 0;
  };

  const cleanup = (finalState: VoiceState) => {
    if (stopped) return;
    stopped = true;
    stopPlayback();
    try {
      ws.close();
    } catch {
      /* już zamknięty */
    }
    stream.getTracks().forEach((t) => t.stop());
    void micCtx.close().catch(() => {});
    void playCtx.close().catch(() => {});
    setState(finalState);
  };

  // ── Mikrofon → WebSocket ────────────────────────────────────────────────
  const source = micCtx.createMediaStreamSource(stream);
  // ScriptProcessor jest oznaczony jako przestarzały, ale działa we wszystkich
  // przeglądarkach bez dokładania osobnego pliku AudioWorkletu (a ten wymaga
  // własnego bundla — przy tej wielkości bufora różnica jest niezauważalna).
  const processor = micCtx.createScriptProcessor(MIC_BUFFER_SIZE, 1, 1);
  // Wyciszony węzeł wyjściowy: w części przeglądarek processor nie pracuje,
  // dopóki nie jest podłączony do wyjścia — gain 0 zapobiega echu.
  const silence = micCtx.createGain();
  silence.gain.value = 0;

  processor.onaudioprocess = (event) => {
    if (stopped || muted || ws.readyState !== WebSocket.OPEN) return;
    const input = event.inputBuffer.getChannelData(0);
    const resampled = resample(input, micCtx.sampleRate, inputRate);
    try {
      ws.send(JSON.stringify({ user_audio_chunk: base64FromInt16(floatToPcm16(resampled)) }));
    } catch {
      /* zamknięte gniazdo — obsłuży zdarzenie close */
    }
  };
  source.connect(processor);
  processor.connect(silence);
  silence.connect(micCtx.destination);

  // ── WebSocket → głośnik ─────────────────────────────────────────────────
  const playChunk = (pcm: Int16Array) => {
    if (stopped || pcm.length === 0) return;
    const buffer = playCtx.createBuffer(1, pcm.length, outputRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 0x8000;
    const src = playCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(playCtx.destination);
    const startAt = Math.max(playCtx.currentTime + 0.06, nextPlayAt);
    src.start(startAt);
    nextPlayAt = startAt + buffer.duration;
    playing.add(src);
    src.onended = () => {
      playing.delete(src);
      if (!stopped && playing.size === 0) setState("listening");
    };
    setState("speaking");
  };

  ws.addEventListener("open", () => {
    try {
      ws.send(
        JSON.stringify({
          type: "conversation_initiation_client_data",
          dynamic_variables: options.dynamicVariables ?? {},
        }),
      );
    } catch {
      cleanup("error");
      handlers.onError?.("Nie udało się rozpocząć rozmowy.");
    }
  });

  ws.addEventListener("message", (event: MessageEvent) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(String(event.data)) as ServerMessage;
    } catch {
      return;
    }
    switch (msg?.type) {
      case "conversation_initiation_metadata": {
        const meta = msg.conversation_initiation_metadata_event ?? {};
        inputRate = parsePcmRate(meta.user_input_audio_format);
        outputRate = parsePcmRate(meta.agent_output_audio_format);
        // Nawet gdy przeglądarka da AudioContext w innej częstotliwości,
        // do agenta zawsze idzie strumień w formacie, którego oczekuje.
        void playCtx.resume().catch(() => {});
        setState("listening");
        break;
      }
      case "audio": {
        const b64 = msg.audio_event?.audio_base_64 ?? msg.audio_event?.audio_base64;
        if (typeof b64 === "string" && b64) playChunk(int16FromBase64(b64));
        break;
      }
      case "agent_response": {
        const text = msg.agent_response_event?.agent_response;
        if (typeof text === "string" && text.trim()) handlers.onAgentMessage?.(text.trim());
        break;
      }
      case "user_transcript": {
        const text = msg.user_transcription_event?.user_transcript;
        if (typeof text === "string" && text.trim()) handlers.onUserMessage?.(text.trim());
        break;
      }
      case "interruption": {
        // Klient zaczął mówić — natychmiast urywamy wypowiedź Ani.
        stopPlayback();
        setState("listening");
        break;
      }
      case "ping": {
        try {
          ws.send(JSON.stringify({ type: "pong", event_id: msg.ping_event?.event_id }));
        } catch {
          /* ignorujemy — zamknięcie obsłuży close */
        }
        break;
      }
      default:
        break;
    }
  });

  ws.addEventListener("error", () => {
    handlers.onError?.("Połączenie z asystentką zostało przerwane.");
    cleanup("error");
  });
  ws.addEventListener("close", () => cleanup("ended"));

  return {
    stop: () => cleanup("ended"),
    setMuted: (value: boolean) => {
      muted = value;
      stream.getAudioTracks().forEach((t) => (t.enabled = !value));
    },
  };
}
