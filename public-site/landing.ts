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
      <button class="nikki-poster" id="poke-nikki" type="button" aria-label="Tap Nikki for a fresh AI thought" aria-describedby="nikki-message" aria-controls="nikki-chat" aria-expanded="false"><span class="nikki-poster-top"><span>MEET NIKKI</span><span aria-hidden="true">♡ / ∞</span></span><img src="/images/nikki-logo.jpg" alt="Nikki’s black-and-white illustrated face on purple" width="1254" height="1254" fetchpriority="high"><span class="nikki-poster-bottom"><span>HERE FOR THE LONG TAKE.</span><span aria-hidden="true">↗</span></span></button>
      <p class="nikki-message" id="nikki-message">Tap for a fresh thought. Stay for a chat.</p><span class="nikki-poke-hint">TAP NIKKI. SHE HAS OPINIONS.</span>
      <section class="nikki-chat" id="nikki-chat" aria-labelledby="nikki-chat-title" hidden>
        <header class="nikki-chat-header"><div><span class="nikki-chat-eyebrow">A LITTLE CURIOUS?</span><h2 id="nikki-chat-title" tabindex="-1">Talk to Nikki <span class="nikki-ai-badge">AI</span></h2></div><button class="nikki-chat-clear" id="nikki-chat-clear" type="button">Clear chat</button></header>
        <div class="nikki-chat-log" id="nikki-chat-log" role="log" aria-label="Your conversation with Nikki" aria-live="polite" aria-relevant="additions text"><p class="nikki-chat-empty">Stories, strange ideas, or what’s on your mind. Pick a thread.</p></div>
        <p class="nikki-chat-thinking" id="nikki-chat-thinking" role="status" aria-live="polite"></p>
        <div class="nikki-chat-error" id="nikki-chat-error" hidden><p id="nikki-chat-error-text" role="alert"></p><button id="nikki-chat-retry" type="button">Try again ↗</button></div>
        <form class="nikki-chat-form" id="nikki-chat-form"><label for="nikki-chat-input">Your turn.</label><div class="nikki-chat-compose"><textarea id="nikki-chat-input" name="message" rows="2" maxlength="500" placeholder="What’s worth keeping forever?" required aria-describedby="nikki-chat-privacy"></textarea><button class="nikki-chat-send" id="nikki-chat-send" type="submit" aria-label="Send message to Nikki">${icon("arrow")}</button></div></form>
        <div class="nikki-chat-footer"><button class="nikki-chat-new" id="nikki-chat-new" type="button">New thought <span aria-hidden="true">✧</span></button><p id="nikki-chat-privacy">AI replies • chats aren’t saved by Nikki.<br><a href="/privacy/#nikki-chat">Privacy</a> · AI can get things wrong.</p></div>
      </section>
    </div>
  </section><div class="landing-strip" aria-label="What Nikki is for"><span>HUMAN HISTORY</span><span class="strip-heart" aria-hidden="true">♡</span><span>SHARED KNOWLEDGE</span><span class="strip-heart" aria-hidden="true">♡</span><span>BEAUTIFULLY LONG VIDEOS</span></div>`;
}
