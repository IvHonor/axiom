"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { setPlanTransport } from "../../../../src/features/daily_plan/api";
import { setDataChangedSubscriber } from "../../../../src/lib/sync";
import { createDesktopPlanner } from "@/lib/terminal/desktopPlanner";
import { readWorkspace } from "@/lib/terminal/database";
import type { Workspace } from "./useWorkspace";
import { fetchCalendarFeed } from "./useCalendarFeeds";

const CHANGED = "axiom:web-planner-changed";
export function useDesktopPlanner(workspace: Workspace) {
  const current = useRef(workspace);
  useLayoutEffect(() => { current.current = workspace; });
  useLayoutEffect(() => {
    const accountId = workspace.accountId;
    const transport = createDesktopPlanner({ read: () => readWorkspace(accountId), save: edits => current.current.save(edits), feed: url => fetchCalendarFeed(accountId, url) });
    const reset = setPlanTransport(transport);
    const unsubscribe = setDataChangedSubscriber(handler => { window.addEventListener(CHANGED, handler); return () => window.removeEventListener(CHANGED, handler); });
    return () => { reset(); unsubscribe(); };
  }, [workspace.accountId]);
  useEffect(() => { window.dispatchEvent(new Event(CHANGED)); }, [workspace.records]);
}
