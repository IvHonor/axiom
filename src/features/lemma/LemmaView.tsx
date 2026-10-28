import { AssistantView } from "../../shell/views/AssistantView";
import { useLemmaAreas, useName } from "./parts";

/** Lemma's tab: the chats. */
export function LemmaView() {
  return <AssistantView areas={useLemmaAreas()} name={useName()} />;
}
