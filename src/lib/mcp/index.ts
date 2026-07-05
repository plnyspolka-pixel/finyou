import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfile from "./tools/get-my-profile";
import listMyLeads from "./tools/list-my-leads";
import searchBlog from "./tools/search-blog";

// The OAuth issuer must be the direct Supabase host (not the .lovable.cloud proxy).
// VITE_SUPABASE_PROJECT_ID is inlined by Vite at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "finance-you-mcp",
  title: "Finance You",
  version: "0.1.0",
  instructions:
    "Narzędzia platformy Finance You (pożyczki pozabankowe + inwestycje). Użyj get_my_profile aby sprawdzić role zalogowanego użytkownika, list_my_leads aby pobrać leady widoczne dla pośrednika/operatora, oraz search_blog aby przeszukać publiczny blog.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyProfile, listMyLeads, searchBlog],
});
