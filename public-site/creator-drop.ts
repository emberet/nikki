import { escapeHtml as e } from "../lib/public-record";
import { nikkiSocialLink } from "./nikki-social";
import { nikkiCreatorToken } from "./nikki-token";

type CreatorDropOptions = {
  src: string;
  title: string;
  preview: boolean;
  watchUrl?: string;
};

export function creatorDrop({
  src,
  title,
  preview,
  watchUrl,
}: CreatorDropOptions) {
  return `<section id="creator-drop" class="creator-drop" aria-labelledby="creator-drop-title">
    <div class="creator-drop-copy">
      <p class="creator-drop-kicker"><span aria-hidden="true">✦</span> CREATOR DROP / 001</p>
      <div class="creator-drop-byline"><img src="/images/nikki-logo.jpg" width="44" height="44" alt="" loading="lazy"><span><strong>Nikki</strong><span>FOUNDER DROP</span></span>${nikkiSocialLink()}</div>
      <h2 id="creator-drop-title">${e(title)}</h2>
      <p class="creator-drop-intro">Fifteen seconds. A little beautiful trouble.<br>A thing for forever.</p>
      <p id="creator-drop-status" class="creator-drop-status${preview ? " is-preview" : ""}"><span aria-hidden="true">${preview ? "◌" : "✓"}</span> ${preview ? "Private preview · awaiting permanent storage" : "Permanent storage verified"}</p>
      ${!preview && watchUrl ? `<a class="creator-drop-record" href="${e(watchUrl)}">View the permanent record <span aria-hidden="true">↗</span></a>` : ""}
      ${nikkiCreatorToken()}
      <details class="creator-drop-transcript"><summary>Read the film</summary><p>A 15-second animated introduction to Nikki, with electronic music and no spoken dialogue.</p><ol><li><span>00:00</span> Good stories. Deserve more.</li><li><span>00:02</span> Meet Nikki. A thing for forever.</li><li><span>00:06</span> Big ideas. Real stories. Your people.</li><li><span>00:09</span> Creator tokens. Hold = subscribe.</li><li><span>00:11</span> Nikki. Find your people. nikki.run. Creator channels are live.</li></ol></details>
    </div>
    <figure class="creator-drop-film"><div class="creator-drop-film-label"><span>PRESS PLAY. MEET NIKKI.</span><span>00:15</span></div><video class="creator-drop-video" controls playsinline preload="none" width="1080" height="1350" poster="/images/nikki-launch-cover.png" aria-labelledby="creator-drop-title" aria-describedby="creator-drop-status creator-drop-audio"><source src="${e(src)}" type="video/mp4">Your browser cannot play this video. <a href="${e(src)}">Open the MP4.</a></video><figcaption><span id="creator-drop-audio">Original music · sound on ♡</span><a href="${e(src)}" aria-label="Open Nikki is live? as an MP4 file">Open MP4 <span aria-hidden="true">↗</span></a></figcaption></figure>
  </section>`;
}
