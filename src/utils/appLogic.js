export function localDateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dateFromLocalKey(dateKey) {
  return new Date(`${dateKey}T00:00:00`);
}

export function shouldShowLateNightPrompt({
  session,
  hour,
  blocks,
  tasks,
  wins,
  hard,
  dayNote,
  hasPromptedForYesterday,
}) {
  if (!session) return false;
  if (hour > 4) return false;
  if (hasPromptedForYesterday) return false;
  return blocks.length > 0 || tasks.length > 0 || Boolean(wins || hard || dayNote);
}

export function computeStaleEventRowIds(existingRows = [], newEvents = []) {
  const nextEventIds = new Set(newEvents.map(e => e.id));
  return existingRows
    .filter(row => !nextEventIds.has(row.event_id))
    .map(row => row.id);
}

export function resolveSavedEvents(previousEvents, newEvents, hasError) {
  return hasError ? previousEvents : newEvents;
}

export function sortJournalEntries(entries = []) {
  return [...entries].sort((a, b) => {
    const aHasPos = a.position !== null && a.position !== undefined;
    const bHasPos = b.position !== null && b.position !== undefined;
    if (aHasPos && bHasPos) return a.position - b.position;
    if (aHasPos) return -1;
    if (bHasPos) return 1;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}
