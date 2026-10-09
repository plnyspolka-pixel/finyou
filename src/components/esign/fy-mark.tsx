import { FY_ROUND_LOGO_PNG_BASE64 } from "@/lib/esign/esign-logo";

const SRC = `data:image/png;base64,${FY_ROUND_LOGO_PNG_BASE64}`;

/** Okrągły znak Finance You — ten sam co w pasku podpisanych PDF-ów. */
export function FyMark() {
  return (
    <img
      src={SRC}
      alt="Finance You"
      width={36}
      height={36}
      className="h-9 w-9 shrink-0 select-none"
      draggable={false}
    />
  );
}
