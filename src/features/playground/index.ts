import "./playground.css";
import { Trophy } from "lucide-react";
import type { ExtensionManifest } from "../../extensions/types";
import { PlaygroundSidebar } from "./PlaygroundSidebar";
import { PlaygroundSummary } from "./PlaygroundSummary";
import { PlaygroundSummaryTitle } from "./overview/PlaygroundOverviewMenu";
import { PlaygroundView } from "./PlaygroundView";

export const playground: ExtensionManifest = {
  id: "playground",
  name: "Playground",
  description: "Leaderboards with your friends and the world, with everyone's AI beside them.",
  about: [
    "The Playground is a holographic training ground for you, your friends and your AIs. Pick a handle, add friends by handle or friend code, and see who's read the most pages, focused longest or kept their journal going, this week, this month, all time, or in a row.",
    "Your numbers are worked out on your own computer and only the totals you choose to share leave it: never what you wrote, read, planned or spent. Global boards are opt-in, and only show the things that are fair to compare with strangers.",
  ],
  features: [
    "Boards for friends, or everyone who opts in",
    "Your profile picture with your AI beside you, in its full outfit; the top three stand on a lit stage",
    "Streak flames that grow from a spark to a blaze, a blue plasma flame at 30 days and a nova at 100",
    "Cheer friends on once a day, and see who's chasing whom",
    "Weekly and monthly boards that reset, with last period's champion",
    "Choose exactly what you share; turn something off and it's deleted",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  builtIn: true,
  core: true,
  icon: Trophy,
  color: "var(--accent)",
  area: { View: PlaygroundView, Summary: PlaygroundSummary, SummaryTitle: PlaygroundSummaryTitle, Sidebar: PlaygroundSidebar, fittedSummary: true },
};
