/**
 * The scripted session played in the hero terminal.
 *
 * The same script renders twice: on the server, played instantly, to produce
 * the final frame (what no-JS and reduced-motion visitors see), and in the
 * browser, played with typing delays on a loop, as the page's one
 * orchestrated moment.
 */

export type AgentState = "working" | "waiting";

interface Seg {
  text: string;
  cls?: string;
}

type Line = Seg[];

type Op =
  | { op: "pause"; ms: number }
  | { op: "type"; text: string; suggest?: string }
  | { op: "erase"; count: number }
  | { op: "accept" }
  | { op: "expand"; from: string; to: string }
  | { op: "run"; output: Line[] }
  | { op: "agent"; state: AgentState };

export interface TermState {
  history: Line[];
  input: string;
  suggestion: string;
  hint: string;
  keycap: string;
  agent: AgentState;
}

const KNOWN_COMMANDS = new Set(["git", "cargo", "journalctl", "head"]);
const PLAIN_ENGLISH = new Set(["first"]);

/** Nerd Font glyphs, as Starship draws them with a patched font. */
export const ICONS = {
  folder: "\uF07C",
  branch: "\uE0A0",
  rust: "\uE7A8",
  clock: "\uF017",
} as const;

const PROMPT_INFO: Line = [
  { text: `${ICONS.folder}  ~/code/api`, cls: "t-dir" },
  { text: "  " },
  { text: `${ICONS.branch} main`, cls: "t-git" },
  { text: " !1", cls: "t-warn" },
  { text: "  " },
  { text: `${ICONS.rust} 1.83`, cls: "t-lang" },
];

const SCRIPT: readonly Op[] = [
  { op: "pause", ms: 900 },
  { op: "type", text: "gti" },
  { op: "pause", ms: 700 },
  { op: "erase", count: 3 },
  { op: "pause", ms: 200 },
  { op: "type", text: "git status" },
  { op: "pause", ms: 380 },
  {
    op: "run",
    output: [
      [{ text: "On branch main" }],
      [{ text: "Changes not staged for commit:" }],
      [{ text: "        modified:   src/billing.rs", cls: "t-err" }],
    ],
  },
  { op: "pause", ms: 700 },
  { op: "type", text: "car", suggest: "cargo test --workspace" },
  { op: "pause", ms: 650 },
  { op: "accept" },
  { op: "pause", ms: 420 },
  {
    op: "run",
    output: [
      [
        { text: "   Compiling", cls: "t-ok" },
        { text: " api v0.4.2 (~/code/api)" },
      ],
      [
        { text: "    Finished", cls: "t-ok" },
        { text: " test profile in 3.18s" },
      ],
      [
        { text: "test result: " },
        { text: "ok", cls: "t-ok" },
        { text: ". 48 passed; 0 failed" },
      ],
    ],
  },
  { op: "pause", ms: 700 },
  { op: "type", text: "journalctl -u nginx | first 20 lines" },
  { op: "pause", ms: 420 },
  { op: "expand", from: "first 20 lines", to: "head -n 20" },
  { op: "pause", ms: 1100 },
  { op: "agent", state: "waiting" },
];

export function initialState(): TermState {
  return {
    history: [],
    input: "",
    suggestion: "",
    hint: "",
    keycap: "",
    agent: "working",
  };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderLine(line: Line): string {
  const inner = line
    .map((seg) =>
      seg.cls
        ? `<span class="${seg.cls}">${escapeHtml(seg.text)}</span>`
        : escapeHtml(seg.text),
    )
    .join("");
  return `<div class="t-line">${inner || "&nbsp;"}</div>`;
}

/** Colors a command line the way goatty's syntax highlighting would. */
function highlight(input: string): Line {
  const line: Line = [];
  let expectCommand = true;
  for (const part of input.split(/(\s+)/)) {
    if (part === "") continue;
    if (/^\s+$/.test(part)) {
      line.push({ text: part });
    } else if (part === "|") {
      line.push({ text: part, cls: "t-dim" });
      expectCommand = true;
    } else if (expectCommand) {
      const cls = PLAIN_ENGLISH.has(part)
        ? "t-snip"
        : KNOWN_COMMANDS.has(part)
          ? "t-ok"
          : "t-err";
      line.push({ text: part, cls });
      expectCommand = false;
    } else {
      line.push({ text: part, cls: part.startsWith("-") ? "t-flag" : "" });
    }
  }
  // Words after a plain-English verb belong to the phrase, not to arguments.
  let inPhrase = false;
  for (const seg of line) {
    if (seg.cls === "t-snip") inPhrase = true;
    else if (seg.cls === "t-dim") inPhrase = false;
    else if (inPhrase && seg.text.trim()) seg.cls = "t-snip";
  }
  return line;
}

function promptLines(input: string): Line[] {
  return [PROMPT_INFO, [{ text: "❯ ", cls: "t-caret" }, ...highlight(input)]];
}

export function renderScreen(state: TermState): string {
  const history = state.history.map(renderLine).join("");
  const ghost = state.suggestion.startsWith(state.input)
    ? state.suggestion.slice(state.input.length)
    : "";
  const [info, prompt] = promptLines(state.input);
  const promptHtml = renderLine(prompt).replace(
    /<\/div>$/,
    `<span class="t-cursor" aria-hidden="true"></span>${
      ghost ? `<span class="t-ghost">${escapeHtml(ghost)}</span>` : ""
    }${state.keycap ? `<kbd class="t-key">${escapeHtml(state.keycap)}</kbd>` : ""}${
      state.hint ? `<span class="t-hint">${escapeHtml(state.hint)}</span>` : ""
    }</div>`,
  );
  return `${history}${renderLine(info)}${promptHtml}`;
}

function typingDelay(index: number): number {
  // A fixed, uneven rhythm reads as a person typing without random jitter.
  const rhythm = [62, 48, 85, 54, 70, 44, 96, 58];
  return rhythm[index % rhythm.length];
}

/**
 * Advances `state` through the script. Each yielded number is how long the
 * current frame should stay on screen, so the caller paints, then waits.
 */
export function* steps(state: TermState): Generator<number, void, void> {
  for (const step of SCRIPT) {
    switch (step.op) {
      case "pause":
        yield step.ms;
        break;
      case "type":
        if (step.suggest) state.suggestion = step.suggest;
        for (let i = 0; i < step.text.length; i++) {
          state.input += step.text[i];
          yield typingDelay(i);
        }
        break;
      case "erase":
        for (let i = 0; i < step.count; i++) {
          state.input = state.input.slice(0, -1);
          yield 70;
        }
        break;
      case "accept":
        state.keycap = "→";
        yield 380;
        state.input = state.suggestion;
        state.suggestion = "";
        state.keycap = "";
        yield 0;
        break;
      case "expand":
        state.input = state.input.replace(step.from, step.to);
        state.hint = `expanded from “${step.from}”`;
        yield 0;
        break;
      case "run":
        state.history.push(...promptLines(state.input), ...step.output);
        state.input = "";
        state.suggestion = "";
        state.hint = "";
        yield 0;
        break;
      case "agent":
        state.agent = step.state;
        yield 0;
        break;
    }
  }
}

/** The finished session, computed without any delays. */
export function finalState(): TermState {
  const state = initialState();
  for (const _ of steps(state)) {
    // Drain the script; only the end state matters here.
  }
  return state;
}
