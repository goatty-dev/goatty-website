// @ts-check
import sitemap from "@astrojs/sitemap";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

// Update this URL once your Cloudflare Workers subdomain or custom domain is finalized.
const site =
  process.env.SITE_URL ?? "https://goatty-website.goatty-dev.workers.dev";

export default defineConfig({
  site,
  output: "static",
  trailingSlash: "never",
  redirects: {
    "/docs": "/docs/getting-started",
  },
  integrations: [
    starlight({
      title: "goatty",
      description:
        "Documentation for goatty — the GPU-rendered Linux terminal with managed Zsh, visual GPUI settings, and persistent daemon sessions.",
      disable404Route: true,
      credits: false,
      favicon: "/favicon.svg",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/goatty-dev/goatty",
        },
      ],
      head: [
        {
          tag: "meta",
          attrs: { name: "theme-color", content: "#080809" },
        },
        {
          tag: "link",
          attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" },
        },
        {
          tag: "link",
          attrs: {
            rel: "preconnect",
            href: "https://fonts.gstatic.com",
            crossorigin: true,
          },
        },
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://fonts.googleapis.com/css2?family=Epilogue:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Silkscreen:wght@400&display=swap",
          },
        },
      ],
      customCss: ["./src/styles/starlight.css"],
      components: {
        SiteTitle: "./src/components/docs/DocsSiteTitle.astro",
        ThemeProvider: "./src/components/docs/DocsThemeProvider.astro",
        ThemeSelect: "./src/components/docs/EmptyThemeSelect.astro",
        PageTitle: "./src/components/docs/DocsPageTitle.astro",
      },
      expressiveCode: {
        themes: ["vesper"],
        styleOverrides: {
          borderRadius: "6px",
          borderColor: "#202026",
          codeBackground: "#0f0f12",
          codeFontFamily:
            '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
          uiFontFamily: '"Epilogue", system-ui, -apple-system, sans-serif',
          frames: {
            frameBoxShadowCssValue: "none",
            editorBackground: "#0f0f12",
            editorTabBarBackground: "#0a0a0d",
            editorTabBarBorderBottomColor: "#202026",
            editorActiveTabBackground: "#0f0f12",
            editorActiveTabBorderColor: "#202026",
            editorActiveTabIndicatorTopColor: "#ff5a00",
            terminalBackground: "#0f0f12",
            terminalTitlebarBackground: "#0a0a0d",
            terminalTitlebarBorderBottomColor: "#202026",
            inlineButtonBackground: "#141418",
            inlineButtonBorder: "#32323c",
          },
        },
      },
      sidebar: [
        {
          label: "Getting Started",
          items: [
            {
              label: "Quickstart & Install",
              slug: "docs/getting-started",
            },
          ],
        },
      ],
    }),
    sitemap(),
  ],
  server: {
    port: 4815,
    host: false,
  },
  vite: {
    server: {
      port: 4815,
      strictPort: true,
    },
    preview: {
      port: 4816,
      strictPort: true,
    },
  },
});
