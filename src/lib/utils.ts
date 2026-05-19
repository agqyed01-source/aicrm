import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const countryAliases: Record<string, string[]> = {
  "united states": ["usa", "us", "united states of america", "america"],
  "united kingdom": ["uk", "great britain", "britain", "england"],
  "china": ["prc", "peoples republic of china"],
  "russia": ["russian federation"],
  "south korea": ["korea republic", "republic of korea"],
  // Add more common ones if needed
};

export function isMatchingSearch(searchStr: string, textStr: string): boolean {
  if (!searchStr || !textStr) return false;
  const s = searchStr.toLowerCase();
  const t = textStr.toLowerCase();
  if (t.includes(s)) return true;

  for (const [key, aliases] of Object.entries(countryAliases)) {
    if (s === key || aliases.includes(s)) {
      if (t.includes(key) || aliases.some(alias => t.includes(alias))) {
        return true;
      }
    }
  }

  return false;
}
