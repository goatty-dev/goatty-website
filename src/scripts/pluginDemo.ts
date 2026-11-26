/**
 * Plugin settings demo data. Each tool lists the controls goatty shows on its
 * settings page and turns the chosen values into the shell lines a person
 * would otherwise write by hand. Shared by the server render and the browser.
 */

export type Control =
  | { kind: "switch"; id: string; label: string; value: boolean }
  | {
      kind: "choice";
      id: string;
      label: string;
      options: readonly string[];
      value: string;
    };

export type Values = Record<string, string | boolean>;

export interface PluginTool {
  id: string;
  name: string;
  summary: string;
  controls: readonly Control[];
  lines: (v: Values) => string[];
}

export const tools: readonly PluginTool[] = [
  {
    id: "eza",
    name: "eza",
    summary: "A friendlier ls, with colors, icons and git status.",
    controls: [
      {
        kind: "switch",
        id: "ls",
        label: "Use eza when I type ls",
        value: true,
      },
      {
        kind: "choice",
        id: "icons",
        label: "File icons",
        options: ["Automatic", "Always", "Never"],
        value: "Automatic",
      },
      {
        kind: "choice",
        id: "folders",
        label: "Folders in listings",
        options: ["First", "Mixed"],
        value: "First",
      },
      {
        kind: "switch",
        id: "git",
        label: "Git status in long listings",
        value: true,
      },
    ],
    lines: (v) => {
      const icons = { Automatic: "auto", Always: "always", Never: "never" }[
        String(v.icons)
      ];
      const flags = [`--icons=${icons}`];
      if (v.folders === "First") flags.push("--group-directories-first");
      const out = [];
      if (v.ls) out.push(`alias ls='eza ${flags.join(" ")}'`);
      out.push(`alias ll='eza -l ${flags.join(" ")}${v.git ? " --git" : ""}'`);
      return out;
    },
  },
  {
    id: "bat",
    name: "bat",
    summary: "cat with syntax highlighting and line numbers.",
    controls: [
      {
        kind: "switch",
        id: "cat",
        label: "Use bat when I type cat",
        value: false,
      },
      {
        kind: "choice",
        id: "theme",
        label: "Colors",
        options: ["Terminal", "Catppuccin", "OneHalf"],
        value: "Terminal",
      },
      { kind: "switch", id: "numbers", label: "Line numbers", value: true },
      {
        kind: "switch",
        id: "changes",
        label: "Mark git changes",
        value: true,
      },
    ],
    lines: (v) => {
      const theme = {
        Terminal: "ansi",
        Catppuccin: "Catppuccin Mocha",
        OneHalf: "OneHalfDark",
      }[String(v.theme)];
      const style = [v.numbers && "numbers", v.changes && "changes"].filter(
        Boolean,
      );
      const out = [
        `export BAT_THEME="${theme}"`,
        `export BAT_STYLE="${style.length ? style.join(",") : "plain"}"`,
      ];
      if (v.cat) out.push(`alias cat='bat --paging=never'`);
      return out;
    },
  },
  {
    id: "zoxide",
    name: "zoxide",
    summary: "Jump to folders you use often by typing part of the name.",
    controls: [
      {
        kind: "choice",
        id: "command",
        label: "Command",
        options: ["z", "Replace cd"],
        value: "z",
      },
      {
        kind: "choice",
        id: "hook",
        label: "Learn folders",
        options: ["When I cd", "Every prompt"],
        value: "When I cd",
      },
      {
        kind: "switch",
        id: "echo",
        label: "Print where I jumped",
        value: false,
      },
    ],
    lines: (v) => {
      const flags = [];
      if (v.command === "Replace cd") flags.push("--cmd cd");
      flags.push(`--hook ${v.hook === "Every prompt" ? "prompt" : "pwd"}`);
      const out = [`eval "$(zoxide init zsh ${flags.join(" ")})"`];
      if (v.echo) out.unshift("export _ZO_ECHO=1");
      return out;
    },
  },
];

export function defaults(tool: PluginTool): Values {
  return Object.fromEntries(tool.controls.map((c) => [c.id, c.value]));
}
