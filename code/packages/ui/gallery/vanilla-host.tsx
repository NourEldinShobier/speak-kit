import { useEffect, useRef } from "react";
import * as V from "../src/vanilla";

/** The vanilla builders (src/vanilla.ts) mounted into the same page as the React gallery. */
export function VanillaHost() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    if (!host || host.childElementCount) return;
    host.append(
      V.button({ variant: "primary", iconLeft: "arrow-narrow-up", label: "Send" }),
      V.button({ variant: "secondary", iconLeft: "share", label: "Share" }),
      V.button({ variant: "danger", label: "Delete", loading: true }),
      V.iconButton({ name: "dots", label: "More" }),
      V.toggle({ checked: true, label: "Vanilla toggle" }),
      V.pill("Indexed", "green", "check"),
      V.kbd("Ctrl"),
      V.tooltip(V.iconButton({ name: "settings", label: "Settings" }), "Settings", "Ctrl ,"),
    );
  }, []);
  return <div ref={ref} className="g-row" data-vanilla />;
}
