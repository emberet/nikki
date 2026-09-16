import { escapeHtml as e } from "../lib/public-record";
import { nikkiSocialLink } from "./nikki-social";
import { nikkiCreatorToken } from "./nikki-token";

export type CreatorDropTranscriptEntry = {
  time: string;
  text: string;
};

export type CreatorDropOptions = {
  src: string;
  title: string;
  preview: boolean;
  watchUrl?: string;
  id?: string;
  number?: number | string;
  poster?: string;
  /** Plain text. Newlines become line breaks. */
  intro?: string;
  durationSeconds?: number;
  transcript?: readonly CreatorDropTranscriptEntry[];
  filmLabel?: string;
  description?: string;
};

const launchTranscript: readonly CreatorDropTranscriptEntry[] = [
  { time: "00:00", text: "Good stories. Deserve more." },
  { time: "00:02", text: "Meet Nikki. A thing for forever." },
  { time: "00:06", text: "Big ideas. Real stories. Your people." },
  { time: "00:09", text: "Creator tokens. Hold = subscribe." },
  {
    time: "00:11",
    text: "Nikki. Find your people. nikki.run. Creator channels are live.",
  },
];

export function creatorDrop({
  src,
  title,
  preview,
  watchUrl,
  id = "creator-drop",
  number = 1,
  poster = "/images/nikki-launch-cover.png",
  intro = "Fifteen seconds. A little beautiful trouble.\nA thing for forever.",
  durationSeconds = 15,
  transcript = launchTranscript,
  filmLabel = "PRESS PLAY. MEET NIKKI.",
  description = "A 15-second animated introduction to Nikki, with electronic music and no spoken dialogue.",
}: CreatorDropOptions) {
  const duration = Math.max(0, Math.floor(durationSeconds));
  const durationLabel = `${String(Math.floor(duration / 60)).padStart(2, "0")}:${String(duration % 60).padStart(2, "0")}`;
  const titleId = `${id}-title`;
  const statusId = `${id}-status`;
  const audioId = `${id}-audio`;

  return `<section id="${e(id)}" class="creator-drop" aria-labelledby="${e(titleId)}">
    <div class="creator-drop-copy">
      <p class="creator-drop-kicker"><span aria-hidden="true">✦</span> CREATOR DROP / ${e(String(number).padStart(3, "0"))}</p>
      <div class="creator-drop-byline"><img src="/images/nikki-logo.jpg" width="44" height="44" alt="" loading="lazy"><span><strong>Nikki</strong><span>FOUNDER DROP</span></span>${nikkiSocialLink()}</div>
      <h2 id="${e(titleId)}">${e(title)}</h2>
      <p class="creator-drop-intro">${intro.split(/\r?\n/).map(e).join("<br>")}</p>
      <p id="${e(statusId)}" class="creator-drop-status${preview ? " is-preview" : ""}"><span aria-hidden="true">${preview ? "◌" : "✓"}</span> ${preview ? "Private preview · awaiting permanent storage" : "Permanent storage verified"}</p>
      ${!preview && watchUrl ? `<a class="creator-drop-record" href="${e(watchUrl)}">View the permanent record <span aria-hidden="true">↗</span></a>` : ""}
      ${nikkiCreatorToken()}
      <details class="creator-drop-transcript"><summary>Read the film</summary><p>${e(description)}</p><ol>${transcript.map(({ time, text }) => `<li><span>${e(time)}</span> ${e(text)}</li>`).join("")}</ol></details>
    </div>
    <figure class="creator-drop-film"><div class="creator-drop-film-label"><span>${e(filmLabel)}</span><span>${e(durationLabel)}</span></div><video class="creator-drop-video" controls playsinline preload="none" width="1080" height="1350" poster="${e(poster)}" aria-labelledby="${e(titleId)}" aria-describedby="${e(statusId)} ${e(audioId)}"><source src="${e(src)}" type="video/mp4">Your browser cannot play this video. <a href="${e(src)}">Open the MP4.</a></video><figcaption><span id="${e(audioId)}">Original music · sound on ♡</span><a href="${e(src)}" aria-label="${e(`Open ${title} as an MP4 file`)}">Open MP4 <span aria-hidden="true">↗</span></a></figcaption></figure>
  </section>`;
}
