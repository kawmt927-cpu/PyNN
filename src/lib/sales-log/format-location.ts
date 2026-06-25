export function formatCheckInLocation(input: {
  addressProvince?: string | null;
  addressCity?: string | null;
  addressDistrict?: string | null;
  addressStreet?: string | null;
  locationText?: string | null;
}): string {
  const parts = [
    input.addressProvince?.trim(),
    input.addressCity?.trim(),
    input.addressDistrict?.trim(),
    input.addressStreet?.trim(),
  ].filter(Boolean) as string[];

  if (parts.length > 0) {
    return parts.join("");
  }

  const fallback = input.locationText?.trim();
  return fallback || "—";
}

export type CheckInLocationFields = {
  latitude?: number | null;
  longitude?: number | null;
  addressProvince?: string | null;
  addressCity?: string | null;
  addressDistrict?: string | null;
  addressStreet?: string | null;
  locationText?: string | null;
};

export function hasCheckInLocation(input: CheckInLocationFields): boolean {
  return formatCheckInLocation(input) !== "—";
}
