const STORAGE_KEY = "bayan_project_ids";

export function saveProjectId(id: string | number) {
  try {
    const existing = getProjectIds();
    const idStr = String(id);
    if (!existing.includes(idStr)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([idStr, ...existing]));
    }
  } catch {}
}

export function getProjectIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export function removeProjectId(id: string) {
  try {
    const existing = getProjectIds().filter((i) => i !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch {}
}
