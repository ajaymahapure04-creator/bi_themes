// layout.cells used to be a plain string[] of visual types. It's now
// {type, binding}[] so each cell can independently bind to user data.
// binding: null means "render the domain's static dummy data" (today's behavior,
// and always true for any project saved before this feature existed).
export const normalizeCell = (c) => (typeof c === "string" ? { type: c, binding: null } : { binding: null, ...c });
export const normalizeCells = (cells) => (cells || []).map(normalizeCell);
