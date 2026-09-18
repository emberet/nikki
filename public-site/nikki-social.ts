// Current creator contact information, separate from the signed archive record.
export function nikkiSocialLink() {
  return '<a class="x-link text-link creator-social" href="https://x.com/nikkistreams" target="_blank" rel="noopener noreferrer" aria-label="Nikki on X: @nikkistreams (opens in a new tab)"><span aria-hidden="true">𝕏</span> @nikkistreams <span aria-hidden="true">↗</span></a>';
}
export function nikkiSocialLinks() {
  return (
    nikkiSocialLink() +
    ' <a class="text-link creator-social" href="https://www.tiktok.com/@nikkistreams" target="_blank" rel="noopener noreferrer" aria-label="Nikki on TikTok: @nikkistreams (opens in a new tab)">TikTok @nikkistreams <span aria-hidden="true">↗</span></a> <a class="text-link creator-social" href="https://www.instagram.com/nikki_streams/" target="_blank" rel="noopener noreferrer" aria-label="Nikki on Instagram: @nikki_streams (opens in a new tab)">Instagram @nikki_streams <span aria-hidden="true">↗</span></a>'
  );
}
