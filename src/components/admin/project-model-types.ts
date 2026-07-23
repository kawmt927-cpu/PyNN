export type ProjectModelListItem = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  totalDurationDays: number;
  phaseCount: number;
};

export type ProjectModelDetail = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  totalDurationDays: number;
  phases: Array<{
    id: string;
    name: string;
    sortOrder: number;
    progressWeight: number;
    startRef: string;
    startOffset: number;
    endRef: string;
    endOffset: number;
    durationDays: number | null;
    tasks: Array<{
      id: string;
      name: string;
      sortOrder: number;
      durationDays: number;
    }>;
  }>;
  nodes: Array<{
    id: string;
    name: string;
    sortOrder: number;
    timeRef: string;
    timeOffset: number;
  }>;
};

export const PROJECT_MODELS_LIST_HREF = "/admin/settings?tab=project-models";
export const PROJECT_MODELS_NEW_HREF = "/admin/settings?tab=project-models&model=new";

export function projectModelEditHref(id: string) {
  return `/admin/settings?tab=project-models&model=${id}`;
}
