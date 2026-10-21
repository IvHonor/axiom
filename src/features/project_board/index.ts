import "./board.css";
import { SquareKanban } from "lucide-react";
import type { ExtensionManifest } from "../../extensions/types";
import { BoardSummary } from "./BoardSummary";
import { ProjectBoardView } from "./ProjectBoardView";

export const projectBoard: ExtensionManifest = {
  id: "project_board",
  name: "Project Board",
  description: "Boards for your projects: tasks, columns, checklists and progress.",
  about: [
    "Plan and track your projects on boards. Each project gets columns of cards you drag from Backlog to Done, with the detail you need on every card.",
    "Switch between a board, a table and a timeline, and see how a project is going with its activity feed and progress charts.",
  ],
  features: [
    "Drag-and-drop boards with custom columns and card limits",
    "Cards with descriptions, labels, priorities, dates, estimates and checklists",
    "Sub-tasks, repeating tasks and reusable card templates",
    "Board, table and timeline views, with filters",
    "Activity history and progress charts for each project",
    "Archive finished cards without losing their history",
  ],
  version: "0.1.0",
  publisher: "Axiom",
  icon: SquareKanban,
  area: { View: ProjectBoardView, Summary: BoardSummary },
};
