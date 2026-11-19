import { useEffect, useState } from "react";
import type { DisplayMode } from "../shared/units";
import { getSettings, putSettings } from "./api";
import { AddChooser } from "./pages/AddChooser";
import { Browse } from "./pages/Browse";
import { EditRecipe } from "./pages/EditRecipe";
import { ImportNotion } from "./pages/ImportNotion";
import { AddLink } from "./pages/AddLink";
import { AddScan } from "./pages/AddScan";
import { AddDraft } from "./pages/AddDraft";
import { Settings } from "./pages/Settings";
import { RecipePage } from "./pages/RecipePage";
import { takeShareTarget, useRoute } from "./router";

takeShareTarget();

const UNITS_KEY = "units.display";

function readLocalUnits(): DisplayMode {
  try {
    const v = localStorage.getItem(UNITS_KEY);
    if (v === "metric" || v === "imperial" || v === "as_written") return v;
  } catch {
    /* storage unavailable */
  }
  return "as_written";
}

export function App() {
  const route = useRoute();
  const [units, setUnits] = useState<DisplayMode>(readLocalUnits);

  useEffect(() => {
    getSettings()
      .then((s) => {
        const v = s[UNITS_KEY];
        if (v === "metric" || v === "imperial" || v === "as_written") setUnits(v);
      })
      .catch(() => {});
  }, []);

  const changeUnits = (m: DisplayMode) => {
    setUnits(m);
    try {
      localStorage.setItem(UNITS_KEY, m);
    } catch {
      /* ignore */
    }
    putSettings({ [UNITS_KEY]: m }).catch(() => {});
  };

  const tab = route.page === "pantry" ? "pantry" : route.page === "add" || route.page === "new" || ["import", "link", "scan", "draft", "settings"].includes(route.page) ? "add" : "browse";

  return (
    <div className="app">
      <main className="content">
        {route.page === "browse" && <Browse />}
        {route.page === "recipe" && <RecipePage id={route.id} units={units} onUnits={changeUnits} />}
        {route.page === "edit" && <EditRecipe key={route.id} id={route.id} />}
        {route.page === "new" && <EditRecipe key="new" />}
        {route.page === "add" && <AddChooser />}
        {route.page === "import" && <ImportNotion />}
        {route.page === "link" && <AddLink key={route.url ?? ""} initial={route.url} />}
        {route.page === "scan" && <AddScan />}
        {route.page === "draft" && <AddDraft />}
        {route.page === "settings" && <Settings />}
        {route.page === "pantry" && (
          <section>
            <h1>Pantry</h1>
            <p className="muted">Grocery sync and pantry arrive in a later step.</p>
          </section>
        )}
      </main>
      <nav className="tabs" aria-label="Main">
        <a className={tab === "browse" ? "active" : ""} href="#/">Browse</a>
        <a className={tab === "pantry" ? "active" : ""} href="#/pantry">Pantry</a>
        <a className={tab === "add" ? "active" : ""} href="#/add">Add</a>
      </nav>
    </div>
  );
}
