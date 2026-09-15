export {};

type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatRequest = {
  action: "spark" | "chat";
  messages: ChatMessage[];
  previous?: string;
};

const mascot = document.querySelector<HTMLButtonElement>("#poke-nikki");
const status = document.querySelector<HTMLElement>("#nikki-message");
const panel = document.querySelector<HTMLElement>("#nikki-chat");
const heading = document.querySelector<HTMLElement>("#nikki-chat-title");
const log = document.querySelector<HTMLElement>("#nikki-chat-log");
const form = document.querySelector<HTMLFormElement>("#nikki-chat-form");
const input = document.querySelector<HTMLTextAreaElement>("#nikki-chat-input");
const send = document.querySelector<HTMLButtonElement>("#nikki-chat-send");
const fresh = document.querySelector<HTMLButtonElement>("#nikki-chat-new");
const clear = document.querySelector<HTMLButtonElement>("#nikki-chat-clear");
const retry = document.querySelector<HTMLButtonElement>("#nikki-chat-retry");
const errorBox = document.querySelector<HTMLElement>("#nikki-chat-error");
const errorText = document.querySelector<HTMLElement>("#nikki-chat-error-text");
const thinking = document.querySelector<HTMLElement>("#nikki-chat-thinking");
let messages: ChatMessage[] = [];
let pending = false;
let failedRequest: ChatRequest | undefined;
let reset: ReturnType<typeof setTimeout>;
let mood = 0;

function reducedMotion() {
  return (
    document.documentElement.dataset.motion === "off" ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function animateMascot() {
  if (!mascot) return;
  mascot.dataset.mood = String(++mood % 3);
  mascot.classList.remove("nikki-boop");
  if (!reducedMotion()) {
    requestAnimationFrame(() => mascot.classList.add("nikki-boop"));
    clearTimeout(reset);
    reset = setTimeout(() => mascot.classList.remove("nikki-boop"), 420);
  }
}

function setPending(value: boolean) {
  pending = value;
  if (thinking) thinking.textContent = value ? "✧ Nikki is thinking…" : "";
  log?.setAttribute("aria-busy", String(value));
  panel?.setAttribute("data-pending", String(value));
  for (const control of [mascot, send, fresh, clear, retry, input]) {
    if (control) control.disabled = value;
  }
  if (status)
    status.textContent = value
      ? "Nikki is thinking…"
      : "Your turn. Or tap Nikki for a new thought.";
}

function hideError() {
  if (errorBox) errorBox.hidden = true;
  if (errorText) errorText.textContent = "";
}

function appendMessage(item: ChatMessage) {
  if (!log) return;
  const bubble = document.createElement("div");
  bubble.className = `nikki-chat-bubble nikki-chat-${item.role}`;
  const label = document.createElement("span");
  label.className = "nikki-chat-speaker";
  label.textContent = item.role === "user" ? "YOU" : "NIKKI · AI";
  const text = document.createElement("p");
  text.textContent = item.content;
  bubble.append(label, text);
  log.append(bubble);
}

async function requestReply(request: ChatRequest) {
  if (pending || !panel || !log) return;
  if (panel.hidden) {
    panel.hidden = false;
    mascot?.setAttribute("aria-expanded", "true");
    heading?.focus({ preventScroll: true });
    panel.scrollIntoView({
      block: "nearest",
      behavior: reducedMotion() ? "instant" : "smooth",
    });
  }
  animateMascot();
  hideError();
  failedRequest = undefined;
  const activeControl =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : undefined;
  const returnToComposer =
    request.action === "chat" &&
    (activeControl === input || activeControl === send);
  setPending(true);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  let succeeded = false;
  try {
    const response = await fetch("/api/creators/nikki-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      cache: "no-store",
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      const detail =
        data && typeof data === "object" && "error" in data
          ? data.error
          : undefined;
      throw new Error(
        typeof detail === "string" && detail.length <= 250
          ? detail
          : "Nikki couldn’t reply just now. Give it another try.",
      );
    }
    if (
      !data ||
      typeof data !== "object" ||
      !("reply" in data) ||
      typeof data.reply !== "string" ||
      !data.reply.trim() ||
      data.reply.length > 700
    ) {
      throw new Error("Nikki lost her train of thought. Try once more.");
    }
    const reply: ChatMessage = {
      role: "assistant",
      content: data.reply.trim(),
    };
    if (request.action === "spark") {
      messages = [reply];
      log.replaceChildren();
      appendMessage(reply);
    } else {
      const userMessage = request.messages.at(-1)!;
      log.querySelector(".nikki-chat-empty")?.remove();
      appendMessage(userMessage);
      appendMessage(reply);
      messages = [...request.messages, reply].slice(-6);
      while (log.children.length > 6) log.firstElementChild?.remove();
      if (input && input.value.trim() === userMessage.content) input.value = "";
    }
    log.scrollTop = log.scrollHeight;
    succeeded = true;
  } catch (error) {
    failedRequest = request;
    if (errorText)
      errorText.textContent = controller.signal.aborted
        ? "That took a little too long. Your message is still here—try again."
        : error instanceof Error &&
            !(error instanceof TypeError) &&
            !(error instanceof SyntaxError)
          ? error.message
          : "Couldn’t reach Nikki. Check your connection and try again.";
    if (errorBox) errorBox.hidden = false;
  } finally {
    clearTimeout(timeout);
    setPending(false);
    if (
      returnToComposer &&
      (document.activeElement === document.body ||
        document.activeElement === activeControl)
    ) {
      input?.focus({ preventScroll: true });
    }
    if (!succeeded && status)
      status.textContent = "Nikki couldn’t reply. Try again below.";
  }
}

function newThought() {
  const previous = [...messages]
    .reverse()
    .find((item) => item.role === "assistant")?.content;
  void requestReply({
    action: "spark",
    messages: [],
    ...(previous ? { previous } : {}),
  });
}

mascot?.addEventListener("click", newThought);
fresh?.addEventListener("click", newThought);
form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const content = input?.value.trim();
  if (!content || content.length > 500 || pending) return;
  void requestReply({
    action: "chat",
    messages: [...messages.slice(-5), { role: "user", content }],
  });
});
input?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form?.requestSubmit();
  }
});
retry?.addEventListener("click", () => {
  if (failedRequest) void requestReply(failedRequest);
});
clear?.addEventListener("click", () => {
  if (pending || !log) return;
  messages = [];
  failedRequest = undefined;
  if (input) input.value = "";
  hideError();
  const empty = document.createElement("p");
  empty.className = "nikki-chat-empty";
  empty.textContent = "A clean slate. Ask something or tap New thought.";
  log.replaceChildren(empty);
  if (status) status.textContent = "Chat cleared. Start anywhere.";
});
