import { useEffect, useState } from "react";

/** Tiny hash router: #/, #/recipe/<id>, #/edit/<id>, #/new, #/add, #/pantry */
export type Route =
  | { page: "browse" }
  | { page: "recipe"; id: string }
  | { page: "edit"; id: string }
  | { page: "new" }
  | { page: "add" }
  | { page: "pantry" };

export function parseRoute(hash: string): Route {
  const [, page, id] = hash.replace(/^#/, "").split("/");
  if (page === "recipe" && id) return { page: "recipe", id: decodeURIComponent(id) };
  if (page === "edit" && id) return { page: "edit", id: decodeURIComponent(id) };
  if (page === "new") return { page: "new" };
  if (page === "add") return { page: "add" };
  if (page === "pantry") return { page: "pantry" };
  return { page: "browse" };
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
