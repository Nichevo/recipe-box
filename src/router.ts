import { useEffect, useState } from "react";

/** Tiny hash router: #/, #/recipe/<id>, #/edit/<id>, #/new, #/add, #/import, #/link/<url>, #/scan, #/draft, #/settings, #/pantry */
export type Route =
  | { page: "browse" }
  | { page: "recipe"; id: string }
  | { page: "edit"; id: string }
  | { page: "new" }
  | { page: "add" }
  | { page: "import" }
  | { page: "link"; url?: string }
  | { page: "scan" }
  | { page: "draft" }
  | { page: "settings" }
  | { page: "pantry" };

export function parseRoute(hash: string): Route {
  const [, page, id] = hash.replace(/^#/, "").split("/");
  if (page === "recipe" && id) return { page: "recipe", id: decodeURIComponent(id) };
  if (page === "edit" && id) return { page: "edit", id: decodeURIComponent(id) };
  if (page === "new") return { page: "new" };
  if (page === "add") return { page: "add" };
  if (page === "import") return { page: "import" };
  if (page === "link") {
    // The shared link is everything after "#/link/" (it may contain slashes).
    const rest = hash.replace(/^#?\/link\/?/, "");
    return rest ? { page: "link", url: decodeURIComponent(rest) } : { page: "link" };
  }
  if (page === "scan" || page === "draft" || page === "settings") return { page };
  if (page === "pantry") return { page: "pantry" };
  return { page: "browse" };
}

/**
 * The phone's share menu opens /share?url=…&text=… (see the web app manifest).
 * Turn that into the "add from a link" page.
 */
export function takeShareTarget() {
  if (location.pathname !== "/share") return;
  const q = new URLSearchParams(location.search);
  const shared = [q.get("url"), q.get("text"), q.get("title")].filter(Boolean).join(" ");
  history.replaceState(null, "", `/#/link/${encodeURIComponent(shared)}`);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export const go = (hash: string) => {
  location.hash = hash;
};
