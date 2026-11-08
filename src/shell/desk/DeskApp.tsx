// The page the desktop view's window loads (`index.html?desk`, see
// src-tauri/src/desk.rs): Lemma in the person's theme, on nothing at all.
import { EXTENSIONS } from "../../extensions";
import { ThemeProvider } from "../theme/ThemeProvider";
import { useInstalled } from "../useInstalled";
import { Desk } from "./Desk";

export function DeskApp() {
  const { isOn } = useInstalled();
  return (
    <ThemeProvider installed={EXTENSIONS.filter(isOn)} transparent>
      <Desk />
    </ThemeProvider>
  );
}
