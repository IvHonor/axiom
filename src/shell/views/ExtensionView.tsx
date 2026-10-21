import type { ExtensionManifest } from "../../extensions/types";
import { useLabels } from "../theme/ThemeProvider";
import { Panel } from "../ui/Panel";

/** Hosts an installed area's own view in the main panel. */
export function ExtensionView({ ext }: { ext: ExtensionManifest }) {
  const { label } = useLabels();
  const View = ext.area?.View;
  if (View) return <View />;

  // Coming-soon areas can't be installed, so this only shows if one was
  // installed by an older version of Axiom.
  return (
    <div className="page">
      <Panel title={ext.name} meta={label("Coming soon")}>
        <p>{ext.name} is still being built. It will be ready in a future update.</p>
      </Panel>
    </div>
  );
}
