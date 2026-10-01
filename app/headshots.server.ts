// Looks up a contestant's headshot in public/headshots by name, tolerating
// the mismatches between the seeded contestant names and however the actual
// image files got named (spaces, nicknames). Files there are served
// statically at "/headshots/<file>" by React Router/Vite, same as any other
// file under public/.
import fs from "node:fs";
import path from "node:path";

const HEADSHOTS_DIR = path.join(process.cwd(), "public", "headshots");

// A contestant name maps to whatever the headshot file is actually named,
// for the cases where that isn't just a spaces-and-case difference (e.g. a
// nickname on the file itself) — add to this as more mismatches turn up.
const NAME_ALIASES: Record<string, string> = {
  michael: "mike",
  deven: "devin",
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

function buildHeadshotIndex(): Map<string, string> {
  const index = new Map<string, string>();
  let files: string[] = [];
  try {
    files = fs.readdirSync(HEADSHOTS_DIR);
  } catch {
    return index;
  }
  for (const file of files) {
    index.set(normalize(path.parse(file).name), file);
  }
  return index;
}

// Built once per server process — the headshots directory doesn't change
// while the app is running.
const headshotIndex = buildHeadshotIndex();

export function getHeadshotUrl(contestantName: string): string | null {
  const normalizedName = normalize(contestantName);
  const key = NAME_ALIASES[normalizedName] ?? normalizedName;
  const file = headshotIndex.get(key);
  return file ? `/headshots/${encodeURIComponent(file)}` : null;
}
