import { useEffect, useState } from "react";

/** Tiny hash router: #/, #/recipe/<id>, #/edit/<id>, #/new, #/add, #/import, #/link/<url>, #/scan, #/draft, #/settings, #/pantry[/shopping], #/fridge, #/links, #/plan[/make], #/find[/<words>] */
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
  | { page: "pantry"; tab: "pantry" | "shopping" }
  | { page: "fridge" }
  | { page: "links" }
  | { page: "fodmap" }
  | { page: "tidy" }
  | { page: "plan"; tab: "week" | "make" }
  | { page: "find"; query?: string };

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
  if (page === "pantry") return { page: "pantry", tab: id === "shopping" ? "shopping" : "pantry" };
  if (page === "fridge" || page === "links" || page === "fodmap" || page === "tidy") return { page };
  if (page === "plan") return { page: "plan", tab: id === "make" ? "make" : "week" };
  if (page === "find") return id ? { page: "find", query: decodeURIComponent(id) } : { page: "find" };
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
