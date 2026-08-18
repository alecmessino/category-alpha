/* Entry point.
 *
 * Mounts once Leaflet and the design-system bundle are on the page. Both are classic scripts
 * loaded by index.html and shared with the terminal, so they are usually already in the HTTP
 * cache; this waits for them rather than assuming, the way the terminal's own mount does.
 */

import React from "react";
import { createRoot } from "react-dom/client";
import { Atlas } from "./ui/atlas.jsx";

function mount() {
  if (!globalThis.L || !globalThis.CategoryAlphaDesignSystem_a835cf) {
    setTimeout(mount, 20);
    return;
  }
  const el = document.getElementById("atlas");
  createRoot(el).render(React.createElement(Atlas));
}

mount();
