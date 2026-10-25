import { usePersistentState } from "./usePersistentState";

/**
 * The areas (extension ids) the assistant may see and change. None until
 * the person switches some on: whatever it sees is sent to the AI.
 */
export function useAssistantAreas() {
  const [areas, setAreas] = usePersistentState<string[]>("axiom.assistant.areas", (saved) =>
    Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : [],
  );
  const setAllowed = (id: string, on: boolean) => setAreas((ids) => (on ? [...new Set([...ids, id])] : ids.filter((other) => other !== id)));
  return { areas, setAllowed };
}
