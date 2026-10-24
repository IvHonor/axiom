import "./uni.css";
import { GraduationCap } from "lucide-react";
import type { ExtensionManifest } from "../../extensions/types";
import { UniSidebar } from "./UniSidebar";
import { UniSummary } from "./UniSummary";
import { UniSummaryTitle } from "./overview/UniOverviewMenu";
import { UniView } from "./UniView";

export const uni: ExtensionManifest = {
  id: "uni",
  name: "University",
  description: "Your modules each term, their lectures, and which ones you've caught up on.",
  about: [
    "Keep on top of your lectures. Set up the term, add your modules, and put in their lectures straight from your timetable; then tick each one off once you've gone through it.",
    "Anything that's been and gone without you catching up shows under Behind, longest overdue first, so a missed week never quietly turns into a missed month.",
  ],
  features: [
    "Terms with teaching weeks, so every lecture knows its week",
    "Modules with a code, colour, credits and a link to the module page",
    "Add a term's worth of lectures at once: every Tuesday, weeks 1 to 11, skipping reading week",
    "Three ticks per lecture: attended, caught up and reviewed",
    "Mark how well you get each one, and note topics and whether there's a recording",
    "A Behind list and what's coming up in the next week",
    "Syncs between your computers like everything else",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  icon: GraduationCap,
  color: "var(--area-uni)",
  area: { View: UniView, Summary: UniSummary, SummaryTitle: UniSummaryTitle, fittedSummary: true, Sidebar: UniSidebar },
};
