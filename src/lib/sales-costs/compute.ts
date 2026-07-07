export function sumAmounts(...values: Array<number | string | null | undefined>): number {
  return values.reduce<number>((sum, v) => sum + (Number(v) || 0), 0);
}

export function computeTravelTotal(input: {
  accommodation?: number | null;
  transportation?: number | null;
  meals?: number | null;
  otherTravel?: number | null;
}): number {
  return sumAmounts(
    input.accommodation,
    input.transportation,
    input.meals,
    input.otherTravel
  );
}

export function computePresalesPersonnelCost(dailyRate: number, days: number): number {
  return Math.round(dailyRate * days * 100) / 100;
}
