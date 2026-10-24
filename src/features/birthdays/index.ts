import "./birthdays.css";
import { Cake } from "lucide-react";
import type { ExtensionManifest } from "../../extensions/types";
import { BirthdaysSidebar } from "./BirthdaysSidebar";
import { BirthdaysSummary } from "./BirthdaysSummary";
import { BirthdaysView } from "./BirthdaysView";

export const birthdays: ExtensionManifest = {
  id: "birthdays",
  name: "Birthdays",
  description: "Birthdays and anniversaries, ages, gift ideas and reminders ahead of the day, end-to-end encrypted.",
  about: [
    "Never miss a birthday. Add the people you care about (or import your contacts) and see who's next, how old they're turning, and a calendar of the year. Anniversaries too, with how many years it's been.",
    "Keep gift ideas for each person as they come to you, from idea to bought to given, so you're never stuck. Get a reminder on the day and as far ahead as you like, in the app, on your desktop or by email. Synced end-to-end encrypted: only your devices can read it, never the server.",
  ],
  features: [
    "Birthdays and anniversaries, with or without the year",
    "Who's next, with countdowns and the age they're turning",
    "A calendar of the next twelve months",
    "Gift ideas for each person: idea, bought, given",
    "Reminders on the day and up to a month ahead, per person",
    "Groups: family, friends, partner, work",
    "Import from contacts (.vcf) and export to your calendar (.ics)",
    "Star signs and birthstones, for fun",
    "End-to-end encrypted sync, with a recovery code",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: Cake,
  color: "var(--area-birthdays)",
  area: { View: BirthdaysView, Summary: BirthdaysSummary, Sidebar: BirthdaysSidebar },
};
