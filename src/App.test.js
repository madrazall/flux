import {
  localDateKey,
  shouldShowLateNightPrompt,
  resolveSavedEvents,
  sortJournalEntries,
} from "./utils/appLogic";

test("localDateKey uses local calendar date format", () => {
  const d = new Date(2026, 3, 10, 23, 59); // Apr 10, 2026 local time
  expect(localDateKey(d)).toBe("2026-04-10");
});

test("late-night prompt appears only when there is day content and not already prompted", () => {
  const shouldPrompt = shouldShowLateNightPrompt({
    session: { user: { id: "u1" } },
    hour: 1,
    blocks: [{ id: "b1" }],
    tasks: [],
    wins: "",
    hard: "",
    dayNote: "",
    hasPromptedForYesterday: false,
  });
  const shouldNotPrompt = shouldShowLateNightPrompt({
    session: { user: { id: "u1" } },
    hour: 1,
    blocks: [],
    tasks: [],
    wins: "",
    hard: "",
    dayNote: "",
    hasPromptedForYesterday: true,
  });
  expect(shouldPrompt).toBe(true);
  expect(shouldNotPrompt).toBe(false);
});

test("resolveSavedEvents rolls back to previous events on save error", () => {
  const previous = [{ id: "1", title: "A" }];
  const next = [{ id: "2", title: "B" }];
  expect(resolveSavedEvents(previous, next, true)).toEqual(previous);
  expect(resolveSavedEvents(previous, next, false)).toEqual(next);
});

test("sortJournalEntries uses position first, then created_at", () => {
  const entries = [
    { id: "a", position: null, created_at: "2026-04-10T09:00:00.000Z" },
    { id: "b", position: 2, created_at: "2026-04-10T07:00:00.000Z" },
    { id: "c", position: 1, created_at: "2026-04-10T11:00:00.000Z" },
    { id: "d", position: null, created_at: "2026-04-10T08:00:00.000Z" },
  ];
  expect(sortJournalEntries(entries).map(e => e.id)).toEqual(["c", "b", "d", "a"]);
});
