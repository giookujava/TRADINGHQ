export type ThemePref = "light" | "dark" | "system";
export const THEME_KEY = "thq-theme";
export const SIDEBAR_KEY = "thq-sidebar";

/**
 * Runs inline in <head> before first paint so the correct theme (and sidebar state) is applied
 * immediately — no flash of the wrong theme. Keep it dependency-free and tiny.
 */
export const themeInitScript = `(function(){var h=document.documentElement;try{var p=localStorage.getItem('${THEME_KEY}')||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);h.dataset.theme=d?'dark':'light';h.dataset.themePref=p;if(localStorage.getItem('${SIDEBAR_KEY}')==='collapsed')h.dataset.sidebar='collapsed';}catch(e){h.dataset.theme='dark';}})();`;

export function resolveTheme(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(pref: ThemePref) {
  const el = document.documentElement;
  el.dataset.theme = resolveTheme(pref);
  el.dataset.themePref = pref;
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* storage unavailable: theme still applies for this page */
  }
  window.dispatchEvent(new Event("thq-theme-change"));
}

export function setSidebarCollapsed(collapsed: boolean) {
  const el = document.documentElement;
  if (collapsed) el.dataset.sidebar = "collapsed";
  else delete el.dataset.sidebar;
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    /* ignore */
  }
}
