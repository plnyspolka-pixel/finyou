import { useState } from "react";
import { UserRound } from "lucide-react";
export function FounderPhoto({ joint = false, small = false }: { joint?: boolean; small?: boolean }) {
  const [missing, setMissing] = useState(false);
  const name = joint ? "Filip Bielak i Daniel Siwiec" : "Filip Bielak";
  return <div className={`fy-founder-photo ${joint ? "fy-founder-photo--joint" : ""} ${small ? "fy-founder-photo--small" : ""}`}>{!missing ? <img src={`/marketing/o-nas/${joint ? "filip-daniel" : "filip-bielak"}.jpg`} alt={name} width={joint ? 1536 : 1122} height={joint ? 1024 : 1402} onError={() => setMissing(true)} /> : <div role="img" aria-label={`Miejsce na zdjęcie: ${name}`}><UserRound size={small ? 24 : 64} /><span>{name}</span></div>}</div>;
}