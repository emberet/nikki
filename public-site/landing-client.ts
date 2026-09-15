const mascot = document.querySelector<HTMLButtonElement>("#poke-nikki");
const message = document.querySelector<HTMLElement>("#nikki-message");
const moods = [
  "Good stories? I get attached.",
  "Here for the long take. Obviously.",
  "Keep talking. This is getting interesting.",
  "Human history looks good on you.",
  "A short attention span? Couldn’t be me.",
];
let mood = 0;
let reset: ReturnType<typeof setTimeout>;
mascot?.addEventListener("click", () => {
  mood = (mood + 1) % moods.length;
  if (message) message.textContent = moods[mood];
  mascot.dataset.mood = String(mood % 3);
  mascot.classList.remove("nikki-boop");
  if (
    document.documentElement.dataset.motion !== "off" &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    requestAnimationFrame(() => mascot.classList.add("nikki-boop"));
    clearTimeout(reset);
    reset = setTimeout(() => mascot.classList.remove("nikki-boop"), 420);
  }
});
