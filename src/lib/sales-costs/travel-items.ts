export const TRAVEL_ITEM_FIELDS = [
  { amountKey: "accommodation", noteKey: "accommodationNote", label: "住宿" },
  { amountKey: "transportation", noteKey: "transportationNote", label: "交通" },
  { amountKey: "meals", noteKey: "mealsNote", label: "餐饮" },
  { amountKey: "otherTravel", noteKey: "otherTravelNote", label: "其他" },
] as const;

export type TravelAmountKey = (typeof TRAVEL_ITEM_FIELDS)[number]["amountKey"];
export type TravelNoteKey = (typeof TRAVEL_ITEM_FIELDS)[number]["noteKey"];
