// Lead magnety — logika serwerowa: zapis e-maila (subskrybent + osobisty
// link), mail z plikiem, podpisany link do pobrania, odpowiedzi na komentarze
// pod postami (Facebook / Instagram przez webhook, YouTube przez tick).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { sendResendEmail } from "@/lib/resend-send.server";
import {
  DEFAULT_TEMPLATES,
  consentTextFor,
  dmConsentTextFor,
  downloadUrl,
  extractEmail,
  firstNameOf,
  isFreshComment,
  isValidDownloadToken,
  leadMagnetUrl,
  matchLeadMagnetForComment,
  newDownloadToken,
  renderTemplate,
  subscriberTagsFor,
  usesEmailInDm,
  type LeadMagnetAudience,
  type LeadMagnetPlatform,
  type LinkedPost,
  type MatchableMagnet,
  type PublicLeadMagnet,
} from "./core";

export type LeadMagnetRow = Database["public"]["Tables"]["lead_magnets"]["Row"];
export type LeadMagnetPostRow = Database["public"]["Tables"]["lead_magnet_posts"]["Row"];
export type LeadMagnetSignupRow = Database["public"]["Tables"]["lead_magnet_signups"]["Row"];
export type LeadMagnetTriggerRow = Database["public"]["Tables"]["lead_magnet_triggers"]["Row"];

export const LEAD_MAGNETS_BUCKET = "lead-magnets";
/** Podpisany link do pliku żyje krótko — każde kliknięcie w /pobierz-plik generuje nowy. */
const SIGNED_URL_TTL_SECONDS = 15 * 60;
/** Tick YouTube: limity na przebieg (kwota API: comments.insert = 50 jednostek). */
const YT_MAX_VIDEOS_PER_TICK = 20;
const YT_MAX_REPLIES_PER_TICK = 15;

/** Pola strony publicznej /pobierz/<slug>. */
export const PUBLIC_LEAD_MAGNET_COLUMNS =
  "id,slug,title,audience,headline,subheadline,benefits,cta_text,cover_image_url,og_image_url,meta_description,thank_you_message,instant_download,file_name,published";

export async function getPublicLeadMagnet(slug: string): Promise<PublicLeadMagnet | null> {
  const { data, error } = await supabaseAdmin
    .from("lead_magnets")
    .select(PUBLIC_LEAD_MAGNET_COLUMNS)
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  try {
    await supabaseAdmin.rpc("lead_magnet_increment_views", { p_id: data.id });
  } catch {
    /* licznik nie może zepsuć strony */
  }
  return {
    ...data,
    consent_text: consentTextFor(data.audience as LeadMagnetAudience),
    url: leadMagnetUrl(data.slug),
  };
}

// ── Zapis e-maila ────────────────────────────────────────────────────────────

export type SignupUtm = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
};

export type RegisterSignupInput = {
  slug: string;
  email: string;
  first_name?: string | null;
  utm?: SignupUtm | null;
  /** Id komentarza / inna referencja z linku (`?ref=`). */
  ref?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** Własna treść zgody (np. e-mail podany w wiadomości prywatnej). */
  consentText?: string | null;
};

export type RegisterSignupResult = {
  ok: true;
  signup_id: string;
  thank_you_message: string;
  /** Link do pliku od razu na stronie (gdy lead magnet ma instant_download). */
  download_url: string | null;
  email_sent: boolean;
  already_subscribed: boolean;
};

/**
 * Zapis z formularza: subskrybent (upsert z tagami lead-magnet / grupa / slug,
 * reaktywacja po wypisie — osoba właśnie wyraziła nową zgodę), wiersz zapisu
 * z osobistym tokenem (jeden na e-mail i lead magnet), opcjonalny lead w CRM
 * i mail z linkiem. Ponowny zapis tego samego adresu wysyła mail jeszcze raz.
 */
export async function registerLeadMagnetSignup(
  input: RegisterSignupInput,
): Promise<RegisterSignupResult> {
  const { data: magnet, error: mErr } = await supabaseAdmin
    .from("lead_magnets")
    .select("*")
    .eq("slug", input.slug)
    .eq("published", true)
    .maybeSingle();
  if (mErr) throw new Error(mErr.message);
  if (!magnet) throw new Error("Ten materiał nie jest już dostępny.");

  const email = input.email.trim().toLowerCase();
  const firstName = (input.first_name ?? "").trim().slice(0, 80) || null;
  const audience = magnet.audience as LeadMagnetAudience;
  const utm = input.utm ?? null;
  const consentText = input.consentText?.trim() || consentTextFor(audience);
  const source =
    utm?.source && /^(facebook|instagram|youtube)$/.test(utm.source) ? utm.source : "page";

  // 1) Subskrybent newslettera.
  const subscriberId = await upsertSubscriber({
    email,
    firstName,
    magnet,
    audience,
    utm,
  });

  // 2) Wiersz zapisu (token pobrania).
  const { data: existing } = await supabaseAdmin
    .from("lead_magnet_signups")
    .select("id, download_token, first_name")
    .eq("lead_magnet_id", magnet.id)
    .eq("email", email)
    .maybeSingle();

  let signupId: string;
  let token: string;
  if (existing) {
    signupId = existing.id;
    token = existing.download_token;
    const { error } = await supabaseAdmin
      .from("lead_magnet_signups")
      .update({
        first_name: existing.first_name ?? firstName,
        source,
        source_ref: input.ref ?? null,
        utm: utm ?? null,
        consent: true,
        consent_text: consentText,
        subscriber_id: subscriberId,
        ip_address: input.ip ?? null,
        user_agent: input.userAgent ?? null,
      })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    token = newDownloadToken();
    const { data: ins, error } = await supabaseAdmin
      .from("lead_magnet_signups")
      .insert({
        lead_magnet_id: magnet.id,
        email,
        first_name: firstName,
        consent: true,
        consent_text: consentText,
        source,
        source_ref: input.ref ?? null,
        utm: utm ?? null,
        download_token: token,
        subscriber_id: subscriberId,
        ip_address: input.ip ?? null,
        user_agent: input.userAgent ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    signupId = ins.id;
  }

  // 3) Lead w CRM (opcjonalnie — domyślnie wyłączone, to zimny kontakt).
  if (magnet.create_crm_lead && !existing) {
    try {
      const { upsertLeadFromSource } = await import("@/lib/lead-comms.server");
      const leadId = await upsertLeadFromSource({
        type: audience === "inwestor" ? "inwestorski" : "pozyczkowy",
        source: "lead_magnet",
        firstName,
        email,
        utmSource: utm?.source ?? null,
        utmMedium: utm?.medium ?? null,
        utmCampaign: utm?.campaign ?? `lm-${magnet.slug}`,
        applicationData: { lead_magnet: magnet.slug },
      });
      if (leadId) {
        await supabaseAdmin
          .from("lead_magnet_signups")
          .update({ lead_id: leadId })
          .eq("id", signupId);
      }
    } catch (e) {
      console.error("[lead-magnet] crm lead failed", e);
    }
  }

  // 4) Mail z linkiem.
  const link = downloadUrl(token);
  const sent = await sendLeadMagnetEmail({ magnet, email, firstName, link });
  await supabaseAdmin
    .from("lead_magnet_signups")
    .update({
      email_sent_at: sent.ok ? new Date().toISOString() : null,
      email_error: sent.ok ? null : (sent.error ?? "unknown"),
    })
    .eq("id", signupId);

  return {
    ok: true,
    signup_id: signupId,
    thank_you_message: magnet.thank_you_message,
    download_url: magnet.instant_download ? link : null,
    email_sent: sent.ok,
    already_subscribed: Boolean(existing),
  };
}

async function upsertSubscriber(opts: {
  email: string;
  firstName: string | null;
  magnet: LeadMagnetRow;
  audience: LeadMagnetAudience;
  utm: SignupUtm | null;
}): Promise<string | null> {
  try {
    const { data: sub } = await supabaseAdmin
      .from("email_subscribers")
      .select("id, tags, status, first_name")
      .eq("email", opts.email)
      .maybeSingle();
    const tags = subscriberTagsFor({
      slug: opts.magnet.slug,
      audience: opts.audience,
      extra: opts.magnet.subscriber_tags,
      existing: sub?.tags ?? [],
    });
    if (sub) {
      const patch: Database["public"]["Tables"]["email_subscribers"]["Update"] = {
        tags,
        first_name: sub.first_name ?? opts.firstName,
      };
      // Nowa, wyraźna zgoda przywraca wypisanego; odbicia (bounce) zostają.
      if (sub.status === "unsubscribed") {
        patch.status = "active";
        patch.unsubscribed_at = null;
      }
      await supabaseAdmin.from("email_subscribers").update(patch).eq("id", sub.id);
      return sub.id;
    }
    const { data: ins, error } = await supabaseAdmin
      .from("email_subscribers")
      .insert({
        email: opts.email,
        first_name: opts.firstName,
        source: "lead_magnet",
        source_id: opts.magnet.id,
        tags,
        status: "active",
        utm_source: opts.utm?.source ?? null,
        utm_medium: opts.utm?.medium ?? null,
        utm_campaign: opts.utm?.campaign ?? `lm-${opts.magnet.slug}`,
      })
      .select("id")
      .single();
    if (error) throw error;
    return ins.id;
  } catch (e) {
    console.error("[lead-magnet] subscriber upsert failed", e);
    return null;
  }
}

async function sendLeadMagnetEmail(opts: {
  magnet: LeadMagnetRow;
  email: string;
  firstName: string | null;
  link: string;
}): Promise<{ ok: boolean; error?: string }> {
  const vars = {
    imie: opts.firstName,
    tytul: opts.magnet.title,
    link: opts.link,
    strona: leadMagnetUrl(opts.magnet.slug),
  };
  try {
    // Osoba właśnie poprosiła o ten plik — mail jest odpowiedzią na jej akcję,
    // więc przechodzi mimo wcześniejszego wypisu z mailingu (bounce nadal blokuje).
    return await sendResendEmail({
      to: opts.email,
      subject: renderTemplate(opts.magnet.email_subject, vars),
      text: renderTemplate(opts.magnet.email_body, vars),
      category: "transactional",
      showReplyHint: true,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Pobranie pliku ───────────────────────────────────────────────────────────

export type DownloadResolution =
  | { ok: true; url: string; slug: string }
  | { ok: false; reason: "invalid_token" | "not_found" | "no_file" | "error"; slug?: string };

/** Token z maila → krótki podpisany link do pliku (albo zewnętrzny adres) + licznik. */
export async function resolveLeadMagnetDownload(rawToken: string): Promise<DownloadResolution> {
  const token = String(rawToken ?? "")
    .trim()
    .toLowerCase();
  if (!isValidDownloadToken(token)) return { ok: false, reason: "invalid_token" };

  const { data: signup } = await supabaseAdmin
    .from("lead_magnet_signups")
    .select("id, lead_magnet_id, download_count, first_downloaded_at")
    .eq("download_token", token)
    .maybeSingle();
  if (!signup) return { ok: false, reason: "not_found" };

  const { data: magnet } = await supabaseAdmin
    .from("lead_magnets")
    .select("slug, file_path, file_url, file_name")
    .eq("id", signup.lead_magnet_id)
    .maybeSingle();
  if (!magnet) return { ok: false, reason: "not_found" };

  let url: string | null = null;
  if (magnet.file_path) {
    const { data, error } = await supabaseAdmin.storage
      .from(LEAD_MAGNETS_BUCKET)
      .createSignedUrl(magnet.file_path, SIGNED_URL_TTL_SECONDS, {
        download: magnet.file_name ?? true,
      });
    if (error || !data?.signedUrl) {
      console.error("[lead-magnet] signed url failed", error);
      return { ok: false, reason: "error", slug: magnet.slug };
    }
    url = data.signedUrl;
  } else if (magnet.file_url) {
    url = magnet.file_url;
  }
  if (!url) return { ok: false, reason: "no_file", slug: magnet.slug };

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("lead_magnet_signups")
    .update({
      download_count: (signup.download_count ?? 0) + 1,
      first_downloaded_at: signup.first_downloaded_at ?? now,
      last_downloaded_at: now,
    })
    .eq("id", signup.id);

  return { ok: true, url, slug: magnet.slug };
}

// ── Automat social: komentarz → link ─────────────────────────────────────────

export type SocialCommentEvent = {
  platform: LeadMagnetPlatform;
  /** FB: id posta strony, IG: id mediów, YouTube: id filmu. */
  postId: string | null | undefined;
  commentId: string;
  authorId?: string | null;
  authorName?: string | null;
  text: string;
  /** Lead z CRM, jeśli webhook go zna (Facebook). */
  leadId?: string | null;
};

export type ReplyStatus =
  | "sent_private"
  | "sent_public"
  | "sent_both"
  | "failed"
  | "skipped"
  | "not_possible";

export type SocialCommentOutcome = {
  /** true = komentarz obsłużony przez lead magnet (webhook pomija zwykłego agenta). */
  handled: boolean;
  duplicate?: boolean;
  magnet: { id: string; slug: string; title: string } | null;
  via?: "linked_post" | "keyword" | "linked_post_no_keyword" | "none";
  reply_status?: ReplyStatus;
  /** `link` — odpowiedź z linkiem; `email_in_dm` — prośba o e-mail w wiadomości (bez linku). */
  mode?: "link" | "email_in_dm";
  link?: string;
  /** Teksty, które faktycznie poszły (do dziennika komunikacji). */
  sent?: { private?: string; public?: string };
  error?: string;
};

type MatchRow = Pick<
  LeadMagnetRow,
  | "id"
  | "slug"
  | "title"
  | "published"
  | "trigger_keywords"
  | "match_any_post"
  | "reply_public_template"
  | "reply_private_template"
  | "reply_fallback_template"
  | "email_in_dm_platforms"
  | "reply_ask_email_template"
>;

async function loadMatchables(): Promise<{ magnets: MatchRow[]; posts: LinkedPost[] }> {
  const { data: magnets } = await supabaseAdmin
    .from("lead_magnets")
    .select(
      "id, slug, title, published, trigger_keywords, match_any_post, reply_public_template, reply_private_template, reply_fallback_template, email_in_dm_platforms, reply_ask_email_template",
    )
    .eq("published", true)
    .order("created_at", { ascending: true });
  if (!magnets?.length) return { magnets: [], posts: [] };
  const { data: posts } = await supabaseAdmin
    .from("lead_magnet_posts")
    .select("lead_magnet_id, platform, external_post_id")
    .in(
      "lead_magnet_id",
      magnets.map((m) => m.id),
    );
  return {
    magnets: magnets as MatchRow[],
    posts: (posts ?? []).map((p) => ({
      lead_magnet_id: p.lead_magnet_id,
      platform: p.platform as LeadMagnetPlatform,
      external_post_id: p.external_post_id,
    })),
  };
}

async function recordTrigger(
  row: Database["public"]["Tables"]["lead_magnet_triggers"]["Insert"],
): Promise<"inserted" | "duplicate" | "error"> {
  const { error } = await supabaseAdmin.from("lead_magnet_triggers").insert(row);
  if (!error) return "inserted";
  if (error.code === "23505") return "duplicate";
  console.error("[lead-magnet] trigger insert failed", error);
  return "error";
}

type SendResult = { ok: boolean; error?: string };

async function sendPrivate(
  platform: LeadMagnetPlatform,
  commentId: string,
  text: string,
): Promise<SendResult> {
  try {
    const mc = await import("@/lib/meta-comments.server");
    if (platform === "facebook") return await mc.sendPrivateReplyToComment({ commentId, text });
    if (platform === "instagram") return await mc.sendIgPrivateReplyToComment({ commentId, text });
    return { ok: false, error: "YouTube nie ma wiadomości prywatnych" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function sendPublic(
  platform: LeadMagnetPlatform,
  commentId: string,
  text: string,
): Promise<SendResult> {
  try {
    if (platform === "facebook") {
      const mc = await import("@/lib/meta-comments.server");
      return await mc.replyToCommentPublic({ commentId, text });
    }
    if (platform === "instagram") {
      const api = await import("@/lib/meta-api.server");
      await api.replyIgComment(commentId, text);
      return { ok: true };
    }
    const yt = await import("@/lib/youtube-api.server");
    await yt.replyToComment(commentId, text);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Komentarz pod postem: dopasowanie do lead magnetu, odpowiedź z linkiem
 * (wiadomość prywatna + publiczne potwierdzenie; gdy DM się nie uda albo to
 * YouTube — publicznie z linkiem) i wpis w dzienniku. Każdy komentarz
 * obsługujemy raz (unikalny indeks na id komentarza).
 */
export async function handleSocialCommentForLeadMagnet(
  ev: SocialCommentEvent,
): Promise<SocialCommentOutcome> {
  const { magnets, posts } = await loadMatchables();
  if (!magnets.length) return { handled: false, magnet: null, via: "none" };

  const match = matchLeadMagnetForComment({
    platform: ev.platform,
    postId: ev.postId,
    text: ev.text,
    magnets: magnets as MatchableMagnet[],
    posts,
  });
  if (match.via === "none") return { handled: false, magnet: null, via: "none" };

  // Dedupe: ten komentarz już był (webhook Meta dostarcza zdarzenia ponownie,
  // tick YouTube czyta te same wątki).
  const { data: prior } = await supabaseAdmin
    .from("lead_magnet_triggers")
    .select("matched, reply_status, lead_magnet_id")
    .eq("platform", ev.platform)
    .eq("external_comment_id", ev.commentId)
    .maybeSingle();
  if (prior) {
    const m = magnets.find((x) => x.id === prior.lead_magnet_id);
    return {
      handled: prior.matched,
      duplicate: true,
      magnet: m ? { id: m.id, slug: m.slug, title: m.title } : null,
      reply_status: prior.reply_status as ReplyStatus,
    };
  }

  const base = {
    platform: ev.platform,
    kind: "comment",
    external_post_id: ev.postId ?? null,
    external_comment_id: ev.commentId,
    author_id: ev.authorId ?? null,
    author_name: ev.authorName ?? null,
    comment_text: ev.text.slice(0, 2000),
    lead_id: ev.leadId ?? null,
  };

  if (match.via === "linked_post_no_keyword") {
    await recordTrigger({
      ...base,
      lead_magnet_id: match.linkedMagnet.id,
      matched: false,
      reply_status: "skipped",
    });
    return {
      handled: false,
      magnet: {
        id: match.linkedMagnet.id,
        slug: match.linkedMagnet.slug,
        title: match.linkedMagnet.title,
      },
      via: match.via,
      reply_status: "skipped",
    };
  }

  const magnet = magnets.find((m) => m.id === match.magnet.id)!;
  const emailMode = usesEmailInDm(ev.platform, magnet.email_in_dm_platforms);
  const link = emailMode
    ? ""
    : leadMagnetUrl(magnet.slug, { platform: ev.platform, ref: ev.commentId });
  const vars = { imie: firstNameOf(ev.authorName), tytul: magnet.title, link };
  const publicAck = renderTemplate(magnet.reply_public_template, vars);

  let status: ReplyStatus = "failed";
  let error: string | undefined;
  let awaitingEmail = false;
  const sent: { private?: string; public?: string } = {};

  if (emailMode) {
    // Bez linku (np. Instagram z zablokowanymi linkami): w wiadomości prywatnej
    // prosimy o adres e-mail; odpowiedź obsłuży handleDirectMessageForLeadMagnet.
    const askText = renderTemplate(magnet.reply_ask_email_template, vars);
    const askPublic = renderTemplate(DEFAULT_TEMPLATES.reply_ask_email_public, vars);
    const priv = await sendPrivate(ev.platform, ev.commentId, askText);
    if (priv.ok) {
      sent.private = askText;
      awaitingEmail = true;
      const pub = await sendPublic(ev.platform, ev.commentId, publicAck);
      if (pub.ok) sent.public = publicAck;
      else error = pub.error;
      status = pub.ok ? "sent_both" : "sent_private";
    } else {
      // Wiadomość prywatna nie przeszła — publicznie prosimy o napisanie do nas.
      const pub = await sendPublic(ev.platform, ev.commentId, askPublic);
      if (pub.ok) {
        status = "sent_public";
        sent.public = askPublic;
        awaitingEmail = true;
        error = priv.error ? `DM: ${priv.error}` : undefined;
      } else {
        status = "failed";
        error = [priv.error && `DM: ${priv.error}`, pub.error && `publicznie: ${pub.error}`]
          .filter(Boolean)
          .join("; ");
      }
    }
  } else if (ev.platform === "youtube") {
    const fallbackText = renderTemplate(magnet.reply_fallback_template, vars);
    const pub = await sendPublic("youtube", ev.commentId, fallbackText);
    if (pub.ok) {
      status = "sent_public";
      sent.public = fallbackText;
    } else error = pub.error;
  } else {
    const privateText = renderTemplate(magnet.reply_private_template, vars);
    const fallbackText = renderTemplate(magnet.reply_fallback_template, vars);
    const priv = await sendPrivate(ev.platform, ev.commentId, privateText);
    if (priv.ok) {
      sent.private = privateText;
      const pub = await sendPublic(ev.platform, ev.commentId, publicAck);
      if (pub.ok) sent.public = publicAck;
      else error = pub.error;
      status = pub.ok ? "sent_both" : "sent_private";
    } else {
      // Bez DM (np. ograniczenia konta) — link publicznie pod komentarzem.
      const pub = await sendPublic(ev.platform, ev.commentId, fallbackText);
      if (pub.ok) {
        status = "sent_public";
        sent.public = fallbackText;
        error = priv.error ? `DM: ${priv.error}` : undefined;
      } else {
        status = "failed";
        error = [priv.error && `DM: ${priv.error}`, pub.error && `publicznie: ${pub.error}`]
          .filter(Boolean)
          .join("; ");
      }
    }
  }

  const rec = await recordTrigger({
    ...base,
    lead_magnet_id: magnet.id,
    matched: true,
    reply_status: status,
    reply_error: error ?? null,
    awaiting_email: awaitingEmail,
  });

  return {
    handled: true,
    duplicate: rec === "duplicate",
    magnet: { id: magnet.id, slug: magnet.slug, title: magnet.title },
    via: match.via,
    reply_status: status,
    mode: emailMode ? "email_in_dm" : "link",
    link: link || undefined,
    sent,
    error,
  };
}

// ── Tryb „e-mail w wiadomości”: odpowiedź z adresem ──────────────────────────

/** Ile dni po komentarzu czekamy na e-mail w wiadomości (Private Reply działa 7 dni). */
const AWAITING_EMAIL_DAYS = 7;

export type DirectMessageOutcome = {
  /** true = wiadomość obsłużył lead magnet (webhook pomija agenta AI). */
  handled: boolean;
  status?: "email_saved" | "reminded" | "send_failed";
  email?: string;
  magnet?: { id: string; slug: string; title: string };
  /** Tekst, który poszedł do rozmówcy (do dziennika komunikacji). */
  reply?: string;
  reply_ok?: boolean;
  error?: string;
};

type PendingTrigger = {
  id: string;
  lead_magnet_id: string;
  author_name: string | null;
  external_comment_id: string | null;
  email_reminded_at: string | null;
};

/** Ostatni komentarz tej osoby, po którym czekamy na e-mail — po id, a awaryjnie po nazwie. */
async function findPendingTrigger(
  platform: "facebook" | "instagram",
  senderId: string,
): Promise<PendingTrigger | null> {
  const since = new Date(Date.now() - AWAITING_EMAIL_DAYS * 86_400_000).toISOString();
  const cols = "id, lead_magnet_id, author_name, external_comment_id, email_reminded_at";
  const { data: byId } = await supabaseAdmin
    .from("lead_magnet_triggers")
    .select(cols)
    .eq("platform", platform)
    .eq("author_id", senderId)
    .eq("awaiting_email", true)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (byId) return byId;

  // Nikt na tej platformie nie czeka na e-mail — bez zapytania do Meta o profil
  // (ta funkcja działa przy każdej przychodzącej wiadomości).
  const { count } = await supabaseAdmin
    .from("lead_magnet_triggers")
    .select("id", { count: "exact", head: true })
    .eq("platform", platform)
    .eq("awaiting_email", true)
    .gte("created_at", since);
  if (!count) return null;

  // Id autora komentarza i id rozmówcy w wiadomościach nie zawsze są takie same
  // (zależnie od API Meta) — wtedy dopasowujemy po imieniu i nazwisku (FB)
  // albo po nazwie użytkownika (IG) z profilu rozmówcy.
  let name: string | null = null;
  try {
    const api = await import("@/lib/meta-api.server");
    if (platform === "instagram") {
      const p = await api.graphRequest(senderId, { query: { fields: "username" }, token: "ig" });
      name = p?.username ? `@${p.username}` : null;
    } else {
      const p = await api.graphRequest(senderId, {
        query: { fields: "first_name,last_name" },
        token: "page",
      });
      name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || null;
    }
  } catch (e) {
    console.warn("[lead-magnet] profile lookup for pending email failed", e);
  }
  if (!name) return null;
  const { data: byName } = await supabaseAdmin
    .from("lead_magnet_triggers")
    .select(cols)
    .eq("platform", platform)
    .ilike("author_name", name)
    .eq("awaiting_email", true)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return byName ?? null;
}

/**
 * Wiadomość prywatna od osoby, która skomentowała post lead magnetu w trybie
 * „e-mail w wiadomości”: adres → zapis na listę (jak z formularza; zgoda z
 * informacją z naszej prośby) + mail z materiałem + potwierdzenie bez linku.
 * Bez adresu — jedno przypomnienie, potem rozmowę przejmuje agent AI.
 */
export async function handleDirectMessageForLeadMagnet(ev: {
  platform: "facebook" | "instagram";
  senderId: string;
  text: string;
  leadId?: string | null;
}): Promise<DirectMessageOutcome> {
  const pending = await findPendingTrigger(ev.platform, ev.senderId);
  if (!pending) return { handled: false };

  const { data: magnet } = await supabaseAdmin
    .from("lead_magnets")
    .select("id, slug, title, published, audience, reply_email_received_template")
    .eq("id", pending.lead_magnet_id)
    .maybeSingle();
  if (!magnet || !magnet.published) {
    await supabaseAdmin
      .from("lead_magnet_triggers")
      .update({ awaiting_email: false })
      .eq("id", pending.id);
    return { handled: false };
  }
  const info = { id: magnet.id, slug: magnet.slug, title: magnet.title };
  const greeting = firstNameOf(pending.author_name);
  const metaPlatform = ev.platform === "instagram" ? "instagram" : "messenger";
  const { sendMetaMessage } = await import("@/lib/meta-send.server");

  const email = extractEmail(ev.text);
  if (!email) {
    if (pending.email_reminded_at) return { handled: false, magnet: info };
    const reminder = DEFAULT_TEMPLATES.reply_email_missing;
    const send = await sendMetaMessage({
      recipientId: ev.senderId,
      text: reminder,
      platform: metaPlatform,
    });
    await supabaseAdmin
      .from("lead_magnet_triggers")
      .update({ email_reminded_at: new Date().toISOString() })
      .eq("id", pending.id);
    return {
      handled: true,
      status: "reminded",
      magnet: info,
      reply: reminder,
      reply_ok: send.ok,
      error: send.ok ? undefined : send.error,
    };
  }

  let signupId: string;
  try {
    const res = await registerLeadMagnetSignup({
      slug: magnet.slug,
      email,
      // Login z Instagrama („@jan.k”) nie jest imieniem — nie zapisujemy go jako imię.
      first_name: greeting && !greeting.startsWith("@") ? greeting : null,
      utm: { source: ev.platform, medium: "dm", campaign: `lm-${magnet.slug}` },
      ref: pending.external_comment_id,
      consentText: dmConsentTextFor(magnet.audience as LeadMagnetAudience, ev.platform),
    });
    signupId = res.signup_id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[lead-magnet] dm signup failed", e);
    return { handled: false, magnet: info, email, error: msg };
  }

  await supabaseAdmin
    .from("lead_magnet_triggers")
    .update({ awaiting_email: false, signup_id: signupId })
    .eq("id", pending.id);
  if (ev.leadId) {
    await supabaseAdmin.from("leads").update({ email }).eq("id", ev.leadId).is("email", null);
  }

  const reply = renderTemplate(magnet.reply_email_received_template, {
    imie: greeting,
    tytul: magnet.title,
    link: "",
    email,
  });
  const send = await sendMetaMessage({
    recipientId: ev.senderId,
    text: reply,
    platform: metaPlatform,
  });
  return {
    handled: true,
    status: send.ok ? "email_saved" : "send_failed",
    email,
    magnet: info,
    reply,
    reply_ok: send.ok,
    error: send.ok ? undefined : send.error,
  };
}

/**
 * Reakcja (polubienie) pod powiązanym postem Facebooka: Meta nie pozwala
 * napisać do osoby, która tylko polubiła post, więc zapisujemy ją wyłącznie
 * do statystyk („ile osób polubiło, a nie skomentowało”).
 */
export async function handleSocialReactionForLeadMagnet(ev: {
  platform: LeadMagnetPlatform;
  postId: string | null | undefined;
  authorId?: string | null;
  authorName?: string | null;
  reactionType?: string | null;
}): Promise<{ recorded: boolean }> {
  if (!ev.postId) return { recorded: false };
  const { magnets, posts } = await loadMatchables();
  const match = matchLeadMagnetForComment({
    platform: ev.platform,
    postId: ev.postId,
    text: "",
    magnets: magnets.map((m) => ({ ...m, trigger_keywords: [] })) as MatchableMagnet[],
    posts,
  });
  if (!match.magnet) return { recorded: false };
  const rec = await recordTrigger({
    lead_magnet_id: match.magnet.id,
    platform: ev.platform,
    kind: "reaction",
    external_post_id: ev.postId,
    external_comment_id: null,
    author_id: ev.authorId ?? null,
    author_name: ev.authorName ?? null,
    comment_text: ev.reactionType ?? "like",
    matched: false,
    reply_status: "not_possible",
  });
  return { recorded: rec === "inserted" };
}

// ── Tick YouTube ─────────────────────────────────────────────────────────────

export type YoutubeTickResult = {
  ok: boolean;
  skipped?: string;
  error?: string;
  videos: number;
  scanned: number;
  replied: number;
  failed: number;
  ignored: number;
};

/**
 * YouTube nie wysyła webhooków komentarzy, więc co 10 minut czytamy wątki pod
 * powiązanymi filmami i odpowiadamy na nowe komentarze z hasłem. Komentarze
 * sprzed powiązania filmu i nasze własne pomijamy; obsłużone pamięta dziennik.
 */
export async function runLeadMagnetYoutubeTick(): Promise<YoutubeTickResult> {
  const empty: YoutubeTickResult = {
    ok: true,
    videos: 0,
    scanned: 0,
    replied: 0,
    failed: 0,
    ignored: 0,
  };
  const { data: posts } = await supabaseAdmin
    .from("lead_magnet_posts")
    .select("external_post_id, linked_at, lead_magnet_id, lead_magnets!inner(published)")
    .eq("platform", "youtube")
    .eq("lead_magnets.published", true)
    .limit(YT_MAX_VIDEOS_PER_TICK);
  if (!posts?.length) return { ...empty, skipped: "no_youtube_posts" };

  let yt: typeof import("@/lib/youtube-api.server");
  let myChannelId: string | null = null;
  try {
    yt = await import("@/lib/youtube-api.server");
    const ch = await yt.getMyChannel();
    myChannelId = ch?.id ?? null;
  } catch (e) {
    return { ...empty, ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const result: YoutubeTickResult = { ...empty, videos: posts.length };
  for (const post of posts) {
    if (result.replied >= YT_MAX_REPLIES_PER_TICK) break;
    let threads: any[] = [];
    try {
      const r = await yt.listCommentThreads(post.external_post_id, { limit: 50, order: "time" });
      threads = r.threads;
    } catch (e) {
      console.error(`[lead-magnet] youtube comments ${post.external_post_id}`, e);
      result.failed++;
      continue;
    }
    const comments = threads
      .map((t) => t?.snippet?.topLevelComment)
      .filter(Boolean)
      .map((c: any) => ({
        id: String(c.id ?? ""),
        authorChannelId: c?.snippet?.authorChannelId?.value as string | undefined,
        authorName: c?.snippet?.authorDisplayName as string | undefined,
        text: String(c?.snippet?.textOriginal ?? c?.snippet?.textDisplay ?? ""),
        publishedAt: c?.snippet?.publishedAt as string | undefined,
      }))
      .filter((c) => c.id && c.authorChannelId !== myChannelId)
      .filter((c) => isFreshComment(c.publishedAt, post.linked_at));
    result.scanned += comments.length;
    if (!comments.length) continue;

    const { data: seen } = await supabaseAdmin
      .from("lead_magnet_triggers")
      .select("external_comment_id")
      .eq("platform", "youtube")
      .in(
        "external_comment_id",
        comments.map((c) => c.id),
      );
    const seenIds = new Set((seen ?? []).map((s) => s.external_comment_id));

    for (const c of comments) {
      if (seenIds.has(c.id)) continue;
      if (result.replied >= YT_MAX_REPLIES_PER_TICK) break;
      const out = await handleSocialCommentForLeadMagnet({
        platform: "youtube",
        postId: post.external_post_id,
        commentId: c.id,
        authorId: c.authorChannelId ?? null,
        authorName: c.authorName ?? null,
        text: c.text,
      });
      if (!out.handled) {
        result.ignored++;
        continue;
      }
      if (out.reply_status === "failed") result.failed++;
      else result.replied++;
    }
  }
  return result;
}

// ── Copy z briefu (AI) ───────────────────────────────────────────────────────

export type GeneratedLeadMagnetCopy = {
  title: string;
  headline: string;
  subheadline: string;
  benefits: string[];
  cta_text: string;
  meta_description: string;
  trigger_keywords: string[];
  caption: string;
};

export async function generateLeadMagnetContent(
  brief: string,
  audience: LeadMagnetAudience,
): Promise<GeneratedLeadMagnetCopy> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) throw new Error("LOVABLE_API_KEY missing");
  const kto =
    audience === "inwestor"
      ? "inwestorzy prywatni lokujący kapitał w pożyczki zabezpieczone hipoteką"
      : "osoby i firmy szukające pożyczki pod zastaw nieruchomości";
  const sys = `Jesteś copywriterem konwersji Finance You (pożyczki pod nieruchomość, inwestowanie w pożyczki hipoteczne, Polska). Piszesz stronę lead magnetu — bezpłatny materiał do pobrania w zamian za e-mail. Grupa docelowa: ${kto}. Konkretnie, po polsku, bez clickbaitu i bez obietnic zysku, których nie da się obronić.
Zwracaj WYŁĄCZNIE JSON:
{
  "title": "nazwa materiału, do 80 znaków",
  "headline": "główna obietnica strony, do 90 znaków",
  "subheadline": "1-2 zdania, do 200 znaków",
  "benefits": ["4-6 punktów: co dokładnie jest w środku, każdy do 120 znaków"],
  "cta_text": "do 30 znaków, tryb rozkazujący",
  "meta_description": "do 160 znaków",
  "trigger_keywords": ["1-3 krótkie hasła do komentarza, WIELKIMI LITERAMI, np. PRZEWODNIK"],
  "caption": "post na Facebooka/Instagram (do 600 znaków): zachęta, by polubić i napisać hasło w komentarzu"
}`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: brief },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { choices: { message: { content: string } }[] };
  const parsed = JSON.parse(body.choices?.[0]?.message?.content ?? "{}");
  const strs = (v: unknown, max: number) =>
    Array.isArray(v)
      ? v
          .filter((x) => typeof x === "string")
          .map((x: string) => x.trim())
          .filter(Boolean)
          .slice(0, max)
      : [];
  return {
    title: String(parsed.title ?? "").slice(0, 200),
    headline: String(parsed.headline ?? "").slice(0, 300),
    subheadline: String(parsed.subheadline ?? "").slice(0, 500),
    benefits: strs(parsed.benefits, 12).map((b) => b.slice(0, 200)),
    cta_text: String(parsed.cta_text ?? "Wyślij mi materiał").slice(0, 80),
    meta_description: String(parsed.meta_description ?? "").slice(0, 300),
    trigger_keywords: strs(parsed.trigger_keywords, 3).map((k) => k.replace(/^#/, "").slice(0, 60)),
    caption: String(parsed.caption ?? "").slice(0, 2000),
  };
}
