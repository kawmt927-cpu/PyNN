const PALETTE = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-indigo-500",
] as const;

export function projectColorClass(projectId: string): string {
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = (hash + projectId.charCodeAt(i) * (i + 1)) % 1000;
  }
  return PALETTE[hash % PALETTE.length];
}

export function projectColorLabel(projectId: string): string {
  return projectColorClass(projectId).replace("bg-", "");
}
