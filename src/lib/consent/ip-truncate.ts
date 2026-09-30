/**
 * Skraca adres IP do rejestru zgód (minimalizacja danych): IPv4 bez
 * ostatniego oktetu (1.2.3.0), IPv6 — tylko pierwsze 48 bitów (2001:db8:1::).
 */
export function truncateIp(ip: string | null | undefined): string | null {
  const v = ip?.trim();
  if (!v) return null;
  const v4 = v.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/i);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0`;
  if (v.includes(":")) {
    const head = v.split("::")[0].split(":").filter(Boolean).slice(0, 3);
    if (head.length === 0) return null;
    return `${head.join(":").toLowerCase()}::`;
  }
  return null;
}
