import type { CeidgActivity } from "@/lib/risk-assessment/types";

export type OwnerBusinessCheckOwner = {
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  activity: CeidgActivity;
};

export type OwnerBusinessCheckPayload = {
  applicationId: string;
  kwNumber: string | null;
  checkedAt: string;
  cacheUntil: string | null;
  stale: boolean;
  owners: OwnerBusinessCheckOwner[];
  notes: string[];
  limitations: string[];
};
