export function icon(name: string) {
  const paths: Record<string, string> = {
    archive:
      '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4z"/>',
    people:
      '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2"/>',
    community: '<path d="M3 4h18v13H8l-5 4z"/><path d="M7 8h10M7 12h6"/>',
    heart:
      '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    studio:
      '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    share: '<path d="M12 16V3m-4 4 4-4 4 4M5 12v8h14v-8"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  };
  return `<svg class="ui-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.archive}</svg>`;
}
export function mobileNavigation(route: string) {
  const items = [
    ["/", "archive", "Watch"],
    ["/creators/", "people", "Discover"],
    ["/communities/", "community", "Communities"],
    ["/creator-studio/", "studio", "Studio"],
  ];
  return `<nav class="mobile-tabs" aria-label="Mobile navigation">${items.map(([url, mark, label]) => `<a href="${url}"${route === url || (url === "/communities/" && route.startsWith(url)) ? ' aria-current="page"' : ""}>${icon(mark)}<span>${label}</span></a>`).join("")}</nav>`;
}
export function appMenu() {
  return `<dialog id="app-menu" class="creator-dialog app-menu"><form method="dialog"><button class="dialog-close" aria-label="Close menu">${icon("close")}</button></form><span class="eyebrow accent">YOUR NIKKI</span><h2>A little more.</h2><nav aria-label="More navigation"><a href="/communities/">Communities ${icon("community")}</a><a href="/subscriptions/">Your subscriptions ${icon("heart")}</a><a href="/library/">Your library ${icon("archive")}</a><a href="/help/">Help & reports ${icon("arrow")}</a><a href="/ops/" data-founder-only hidden>Founder operations ${icon("arrow")}</a><a href="/about/">The idea behind Nikki ${icon("arrow")}</a><a href="/about/#roadmap">What comes next ${icon("arrow")}</a><a href="/privacy/">Privacy ${icon("arrow")}</a></nav><button class="btn motion-setting" data-toggle-motion>Turn motion off</button><p class="field-help">Wallet signatures sign you in. Every token transaction needs its own confirmation.</p></dialog>`;
}
