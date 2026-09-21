import { auth, defineMcp } from "@lovable.dev/mcp-js";

import getMyProfile from "./tools/get-my-profile";
import listMyLeads from "./tools/list-my-leads";
import getLead from "./tools/get-lead";
import searchLeads from "./tools/search-leads";
import listLeadCommunications from "./tools/list-lead-communications";
import createLead from "./tools/create-lead";
import updateLeadStatus from "./tools/update-lead-status";
import logLeadCommunication from "./tools/log-lead-communication";
import listApplications from "./tools/list-applications";
import getApplication from "./tools/get-application";
import listInvestorOffers from "./tools/list-investor-offers";
import listClients from "./tools/list-clients";
import listInvestors from "./tools/list-investors";
import listProperties from "./tools/list-properties";
import getPropertyAnalysis from "./tools/get-property-analysis";
import searchBlog from "./tools/search-blog";
import getBlogArticle from "./tools/get-blog-article";
import listBlogTopics from "./tools/list-blog-topics";
import listMarketingMaterials from "./tools/list-marketing-materials";
import listTrainingVideos from "./tools/list-training-videos";
import listFaqs from "./tools/list-faqs";
import listAffiliatePartners from "./tools/list-affiliate-partners";
import listAffiliateCommissions from "./tools/list-affiliate-commissions";
import listCollectionCases from "./tools/list-collection-cases";
import listLandingPages from "./tools/list-landing-pages";
import getPlatformStats from "./tools/get-platform-stats";
import calculateLoanInstallment from "./tools/calculate-loan-installment";
import listChatThreads from "./tools/list-chat-threads";
import listChatMessages from "./tools/list-chat-messages";
import sendChatMessage from "./tools/send-chat-message";
import getUpdatesSince from "./tools/get-updates-since";
import listInboxThreads from "./tools/list-inbox-threads";
import readInboxThread from "./tools/read-inbox-thread";
import { crmExtraTools } from "./tools/crm-extra";
import { applicationsExtraTools } from "./tools/applications-extra";
import { analysisTools } from "./tools/analysis";
import { clientsAmlTools } from "./tools/clients-aml";
import { investorsExtraTools } from "./tools/investors-extra";
import { projectsTools } from "./tools/projects";
import { financeTools } from "./tools/finance";
import { affiliateExtraTools } from "./tools/affiliate-extra";
import { collectionsExtraTools } from "./tools/collections-extra";
import { marketingTools } from "./tools/marketing";
import { opsTools } from "./tools/ops";
import { calculatorTools } from "./tools/calculators";
import { writesCrmTools } from "./tools/writes-crm";
import { writesCommsTools } from "./tools/writes-comms";
import { writesInvestorsTools } from "./tools/writes-investors";
import { writesFinanceTools } from "./tools/writes-finance";
import { writesMarketingTools } from "./tools/writes-marketing";
import { elevenLabsTools } from "./tools/elevenlabs";
import { twilioTools } from "./tools/twilio";
import { metaTools } from "./tools/meta";
import { youtubeTools } from "./tools/youtube";
import { heygenTools } from "./tools/heygen";
import { googleTools } from "./tools/google";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "finance-you-mcp",
  title: "Finance You",
  version: "0.3.0",
  instructions:
    "Narzędzia platformy Finance You (pożyczki pozabankowe + inwestycje). Obejmują CRM (leady, klienci, wnioski, oferty inwestorów), treści (blog, FAQ, landing pages, materiały marketingowe, szkolenia), program pośredników, windykację, czat klient↔inwestor oraz kalkulator raty. Dla zespołu (administrator/operator): `get_updates_since` — raport „co nowego” od wskazanego momentu (zacznij od niego, gdy użytkownik pyta o nowości; zapamiętaj `next_since` na kolejne pytanie), `list_inbox_threads` — skrzynka z wątkami czekającymi na odpowiedź, `read_inbox_thread` — pełna korespondencja z jedną osobą. Narzędzia działają w obie strony: poza odczytem są akcje panelu (edycja leadów, klientów, wniosków, decyzje o ofertach i propozycjach, kryteria instytucji, dostępy, windykacja, treści) oraz wysyłki (`send_email`, `send_sms`, `send_messenger_message`, `send_chat_reply`, `reply_institution_thread`). Boty i głos ElevenLabs: `eleven_status`, `eleven_list_agents`, `get_text_agent_prompt` / `update_text_agent_prompt`, `eleven_get_conversation` (transkrypty), `place_voice_call` (telefon Anią — realne połączenie), `ask_voice_agent` (tura testowa), `text_to_speech`, `speech_to_text`, `compose_music`, `create_dubbing`, `generate_video`; Twilio: `twilio_status`, `list_twilio_messages`, `list_twilio_calls`, `get_twilio_recording`, `twilio_place_call`; Meta (Facebook, Instagram, Messenger, reklamy, formularze leadów, piksel): `meta_status`, `list_facebook_posts`, `publish_facebook_post`, `list_instagram_media`, `publish_instagram_post`, `list_messenger_conversations`, `get_meta_campaigns_live`, `get_meta_ads_insights`, `update_meta_ad_status`, `get_meta_form_leads`; YouTube: `youtube_status`, `list_youtube_videos`, `list_youtube_comments`, `reply_youtube_comment`, `update_youtube_video`, `queue_youtube_publication`; HeyGen i Studio publikacji (filmy z awatarem Filipa): `heygen_status`, `generate_studio_script`, `create_studio_video_job`, `get_studio_job`, `poll_studio_jobs`, `publish_studio_job`, `generate_avatar_video`, `get_heygen_video`, `list_avatar_faqs`, `generate_avatar_faq_video`; Google (pozycjonowanie i ruch): `google_search_status`, `get_search_performance`, `get_search_trend`, `get_top_queries`, `get_top_pages`, `get_page_search_data`, `compare_search_periods`, `inspect_url`, `list_sitemaps`, `get_site_traffic` (GA4), `get_pagespeed`. Gdy użytkownik pyta „jak się pozycjonuje strona”, zacznij od `get_search_trend` i `get_top_queries`. Każdy zapis wykonuj tylko na wyraźne polecenie użytkownika; przed wysyłką wiadomości pokaż dokładną treść i poczekaj na potwierdzenie. Widoczność danych ograniczają polityki RLS bazy i role — użytkownik widzi i zmienia tylko to, do czego ma uprawnienia.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    getMyProfile,
    listMyLeads,
    getLead,
    searchLeads,
    listLeadCommunications,
    createLead,
    updateLeadStatus,
    logLeadCommunication,
    listApplications,
    getApplication,
    listInvestorOffers,
    listClients,
    listInvestors,
    listProperties,
    getPropertyAnalysis,
    searchBlog,
    getBlogArticle,
    listBlogTopics,
    listMarketingMaterials,
    listTrainingVideos,
    listFaqs,
    listAffiliatePartners,
    listAffiliateCommissions,
    listCollectionCases,
    listLandingPages,
    getPlatformStats,
    calculateLoanInstallment,
    listChatThreads,
    listChatMessages,
    sendChatMessage,
    getUpdatesSince,
    listInboxThreads,
    readInboxThread,
    ...crmExtraTools,
    ...applicationsExtraTools,
    ...analysisTools,
    ...clientsAmlTools,
    ...investorsExtraTools,
    ...projectsTools,
    ...financeTools,
    ...affiliateExtraTools,
    ...collectionsExtraTools,
    ...marketingTools,
    ...opsTools,
    ...calculatorTools,
    ...writesCrmTools,
    ...writesCommsTools,
    ...writesInvestorsTools,
    ...writesFinanceTools,
    ...writesMarketingTools,
    ...elevenLabsTools,
    ...twilioTools,
    ...metaTools,
    ...youtubeTools,
    ...heygenTools,
    ...googleTools,
  ],
});
