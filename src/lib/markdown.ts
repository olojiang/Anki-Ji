"use client";
import { Marked, type Tokens } from "marked";
import katex from "katex";
import hljs from "highlight.js/lib/common";
import DOMPurify from "dompurify";

const AUDIO = /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus)(\?|$)/i;
const VIDEO = /\.(mp4|webm|mov)(\?|$)/i;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function embedVideo(url: string): string | null {
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/.exec(url);
  if (yt) return `<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/${yt[1]}" allowfullscreen frameborder="0"></iframe>`;
  const bv = /bilibili\.com\/video\/(BV[\w]+)/.exec(url);
  if (bv) return `<iframe width="560" height="315" src="https://player.bilibili.com/player.html?bvid=${bv[1]}&autoplay=0" allowfullscreen frameborder="0"></iframe>`;
  return null;
}

const math = (tex: string, display: boolean) => {
  try { return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "html" }); } catch { return esc(tex); }
};

const marked = new Marked({
  gfm: true,
  breaks: true,
  extensions: [
    {
      name: "blockMath", level: "block",
      start: (src: string) => src.indexOf("$$"),
      tokenizer(src: string) { const m = /^\$\$([\s\S]+?)\$\$(?:\n|$)/.exec(src); return m ? { type: "blockMath", raw: m[0], text: m[1] } : undefined; },
      renderer: (t: Tokens.Generic) => `<div>${math(t.text, true)}</div>`,
    },
    {
      name: "inlineMath", level: "inline",
      start: (src: string) => src.indexOf("$"),
      tokenizer(src: string) { const m = /^\$(?!\s)([^$\n]+?)(?<!\s)\$/.exec(src); return m ? { type: "inlineMath", raw: m[0], text: m[1] } : undefined; },
      renderer: (t: Tokens.Generic) => math(t.text, false),
    },
  ],
  renderer: {
    code({ text, lang }: Tokens.Code) {
      const l = lang && hljs.getLanguage(lang) ? lang : undefined;
      const html = l ? hljs.highlight(text, { language: l }).value : hljs.highlightAuto(text).value;
      return `<pre><code class="hljs">${html}</code></pre>`;
    },
    image({ href, text }: Tokens.Image) {
      if (!href) return "";
      if (text === "audio" || AUDIO.test(href)) return `<audio controls preload="none" src="${esc(href)}"></audio>`;
      if (text === "video" || VIDEO.test(href)) return `<video controls preload="metadata" src="${esc(href)}"></video>`;
      const v = embedVideo(href);
      if (v) return v;
      return `<img src="${esc(href)}" alt="${esc(text ?? "")}" loading="lazy">`;
    },
    link({ href, text }: Tokens.Link) {
      const v = embedVideo(href ?? "");
      if (v && (text === href || !text)) return v;
      return `<a href="${esc(href ?? "")}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    },
  },
});

let hooked = false;
function purifier() {
  if (!hooked && typeof window !== "undefined") {
    DOMPurify.addHook("uponSanitizeElement", (node, data) => {
      if (data.tagName === "iframe") {
        const src = (node as Element).getAttribute("src") ?? "";
        if (!/^https:\/\/(www\.youtube-nocookie\.com|player\.bilibili\.com)\//.test(src)) node.parentNode?.removeChild(node);
      }
    });
    hooked = true;
  }
  return DOMPurify;
}

/** Markdown (+ inline HTML from Anki imports) → sanitised HTML. */
export function renderMarkdown(md: string): string {
  const html = marked.parse(md ?? "", { async: false }) as string;
  if (typeof window === "undefined") return "";
  return purifier().sanitize(html, {
    ADD_TAGS: ["iframe", "audio", "video", "source"],
    ADD_ATTR: ["controls", "allowfullscreen", "frameborder", "target", "preload", "loading"],
    FORBID_TAGS: ["style", "script", "form", "input"],
  });
}

/** One note field written in Markdown → HTML (unsanitised; the whole card is sanitised afterwards). Inline when it is a single paragraph. */
export function markdownField(md: string): string {
  const s = md ?? "";
  if (!s.trim()) return s;
  const block = /\n\s*\n|^\s*(#{1,6}\s|[-*+]\s|\d+\.\s|>|```|\$\$|\|)/m.test(s);
  return (block ? marked.parse(s, { async: false }) : marked.parseInline(s, { async: false })) as string;
}

/** Sanitise card-template HTML (custom note types): media/ruby/details allowed, scripts/styles/forms removed. */
export function sanitizeCardHtml(html: string): string {
  if (typeof window === "undefined") return "";
  return purifier().sanitize(html ?? "", {
    ADD_TAGS: ["iframe", "audio", "video", "source", "ruby", "rb", "rt", "rp", "details", "summary"],
    ADD_ATTR: ["controls", "allowfullscreen", "frameborder", "target", "preload", "loading", "open"],
    FORBID_TAGS: ["style", "script", "form", "input", "textarea", "select", "button", "link", "meta", "base"],
  });
}
