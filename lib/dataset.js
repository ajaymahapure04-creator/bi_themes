// User-uploaded dim/fact tables + relationships between them (star schema, one join
// hop: fact.FK -> dimension.PK). Persisted separately from the theme/layout project
// state so a large dataset hitting the localStorage quota can't jeopardize the
// small, important theme/layout autosave.

const DATASET_KEY = "bi-theme-studio-dataset-v1";

export const EMPTY_DATASET = { version: 1, tables: {}, relationships: [] };

export function loadDataset() {
  try {
    const raw = localStorage.getItem(DATASET_KEY);
    if (!raw) return EMPTY_DATASET;
    const parsed = JSON.parse(raw);
    return { ...EMPTY_DATASET, ...parsed };
  } catch (e) {
    return EMPTY_DATASET;
  }
}

export function saveDataset(dataset) {
  try {
    localStorage.setItem(DATASET_KEY, JSON.stringify(dataset));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e };
  }
}

export function addOrReplaceTable(dataset, table) {
  return { ...dataset, tables: { ...dataset.tables, [table.id]: table } };
}

export function removeTable(dataset, tableId) {
  const tables = { ...dataset.tables };
  delete tables[tableId];
  const relationships = dataset.relationships.filter((r) => r.factTable !== tableId && r.dimTable !== tableId);
  return { ...dataset, tables, relationships };
}

export function addRelationship(dataset, rel) {
  return { ...dataset, relationships: [...dataset.relationships, rel] };
}

export function removeRelationship(dataset, relId) {
  return { ...dataset, relationships: dataset.relationships.filter((r) => r.id !== relId) };
}

export function slugifyTableId(name, existingIds) {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "") || "table";
  let id = base, n = 1;
  while (existingIds.includes(id)) id = `${base}-${n++}`;
  return id;
}
