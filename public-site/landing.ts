import { icon } from "./app-shell";
export function landingHero() {
  return `<section class="nikki-landing" aria-labelledby="landing-title">
    <div class="landing-copy"><p class="landing-kicker"><span aria-hidden="true">♡</span> LONG-FORM. LONG-TERM.</p>
      <h1 id="landing-title">A thing for<br><em>forever.</em></h1>
      <p class="landing-intro">Big ideas. Human stories. A little beautiful trouble.<br>A home for creators making something worth keeping.</p>
      <div class="landing-actions"><a class="btn landing-primary" href="/creators/">Find your people ${icon("arrow")}</a><a class="landing-archive-link" href="#archive">Explore the archive <span aria-hidden="true">↓</span></a></div>
      <div class="landing-invite"><span class="status-dot" aria-hidden="true"></span><span>CREATOR CHANNELS ARE OPEN</span><a href="/creator-studio/">Make yours ↗</a></div>
    </div>
    <div class="nikki-object"><span class="nikki-sticker" aria-hidden="true">A LITTLE<br>ATTACHED.</span>
      <button class="nikki-poster" id="poke-nikki" type="button" aria-label="Poke Nikki for a new message" aria-describedby="nikki-message"><span class="nikki-poster-top"><span>MEET NIKKI</span><span aria-hidden="true">♡ / ∞</span></span><img src="/images/nikki-logo.jpg" alt="Nikki’s black-and-white illustrated face on purple" width="1254" height="1254" fetchpriority="high"><span class="nikki-poster-bottom"><span>HERE FOR THE LONG TAKE.</span><span aria-hidden="true">↗</span></span></button>
      <p class="nikki-message" id="nikki-message" role="status" aria-live="polite">Good stories? I get attached.</p><span class="nikki-poke-hint">TAP NIKKI. SHE HAS OPINIONS.</span>
    </div>
  </section><div class="landing-strip" aria-label="What Nikki is for"><span>HUMAN HISTORY</span><span class="strip-heart" aria-hidden="true">♡</span><span>SHARED KNOWLEDGE</span><span class="strip-heart" aria-hidden="true">♡</span><span>BEAUTIFULLY LONG VIDEOS</span></div>`;
}
