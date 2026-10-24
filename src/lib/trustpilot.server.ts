import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TRUSTPILOT_INTEGRATION_NAME, trustpilotLeadMagnetBcc } from "./trustpilot";

/**
 * Adres AFS Trustpilot do ukrytej kopii maila po pobraniu lead magnetu.
 * Każdy błąd (brak wiersza ustawień, awaria bazy) daje pustą listę —
 * zaproszenie do opinii nigdy nie może zablokować wysyłki pliku.
 */
export async function trustpilotLeadMagnetBccAddresses(): Promise<string[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from("integration_settings")
      .select("is_enabled, configuration")
      .eq("integration_name", TRUSTPILOT_INTEGRATION_NAME)
      .maybeSingle();
    if (error) throw error;
    return trustpilotLeadMagnetBcc(data);
  } catch (e) {
    console.error("[trustpilot] settings read failed", e);
    return [];
  }
}
