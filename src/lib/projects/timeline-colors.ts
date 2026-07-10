const PALETTE = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-fuchsia-500",
  "bg-lime-500",
  "bg-sky-500",
] as const;

function hashKey(key: string, salt: string): number {
  let hash = 0;
  const input = `${salt}:${key}`;
  for (let i = 0; i < input.length; i++) {
    hash = (hash + input.charCodeAt(i) * (i + 1)) % 1000;
  }
  return hash;
}

export function projectColorClass(projectId: string): string {
  return PALETTE[hashKey(projectId, "project") % PALETTE.length];
}

export function staffColorClass(userId: string): string {
  return PALETTE[hashKey(userId, "staff") % PALETTE.length];
}

export function projectColorLabel(projectId: string): string {
  return projectColorClass(projectId).replace("bg-", "");
}
