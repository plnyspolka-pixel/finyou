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

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "finance-you-mcp",
  title: "Finance You",
  version: "0.2.0",
  instructions:
    "Narzędzia platformy Finance You (pożyczki pozabankowe + inwestycje). Obejmują CRM (leady, klienci, wnioski, oferty inwestorów), treści (blog, FAQ, landing pages, materiały marketingowe, szkolenia), program pośredników, windykację, czat klient↔inwestor oraz kalkulator raty. Widoczność danych ograniczają polityki RLS bazy — użytkownik widzi tylko to, do czego ma uprawnienia.",
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
  ],
});
