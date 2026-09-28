/**
 * Finance You — profile w mediach społecznościowych.
 * Osobny moduł (nie komponent), żeby stopka i JSON-LD bloga dzieliły jedną listę.
 */

export type SocialKey = "facebook" | "instagram" | "youtube" | "tiktok" | "x" | "linkedin";

/**
 * Profile Finance You w mediach społecznościowych (stopka + `sameAs` w JSON-LD).
 * Adresy pochodzą z kont połączonych w panelu (Meta, YouTube, X); TikTok — handle
 * podany przez zespół (@financeyou.pl). Pusty `href` = konto bez potwierdzonego
 * publicznego adresu — pozycja jest pomijana; wystarczy wpisać adres, a ikona
 * pojawi się w stopce sama.
 */
export const SOCIAL_LINKS: { key: SocialKey; label: string; href: string }[] = [
  { key: "facebook", label: "Facebook", href: "https://www.facebook.com/661893307005604" },
  {
    key: "instagram",
    label: "Instagram",
    href: "https://www.instagram.com/filipbielakconsulting/",
  },
  { key: "youtube", label: "YouTube", href: "https://www.youtube.com/@financeyoufinanceyoupl" },
  { key: "tiktok", label: "TikTok", href: "https://www.tiktok.com/@financeyou.pl" },
  { key: "x", label: "X (Twitter)", href: "https://x.com/FinancePl3813" },
  { key: "linkedin", label: "LinkedIn", href: "" },
];

/** Tylko profile z adresem — to one trafiają do stopki i do `sameAs`. */
export const ACTIVE_SOCIAL_LINKS = SOCIAL_LINKS.filter((s) => s.href.length > 0);
