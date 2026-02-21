import {
  MarkdownPostProcessorContext,
  setIcon,
} from "obsidian";
import ExcalidrawPlugin from "../main";
import { InlineExcalidrawModal } from "src/view/InlineExcalidrawModal";
import { getSVG } from "src/utils/utils";

export interface InlineExcalidrawScene {
  type: string;
  version: number;
  source?: string;
  elements: any[];
  appState?: Record<string, any>;
  files?: Record<string, any>;
}

const svgCache = new Map<string, SVGSVGElement>();
const MAX_CACHE_SIZE = 50;

function getCacheKey(sceneData: InlineExcalidrawScene): string {
  if (!sceneData.elements || sceneData.elements.length === 0) return "";
  return sceneData.elements
    .map((el: any) => `${el.id}:${el.versionNonce}`)
    .join(",");
}

export async function inlineExcalidrawProcessor(
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  plugin: ExcalidrawPlugin,
) {
  const trimmed = source.trim();

  if (!trimmed) {
    renderEmptyState(el, ctx, plugin);
    return;
  }

  let sceneData: InlineExcalidrawScene;
  try {
    sceneData = JSON.parse(trimmed);
  } catch {
    el.createEl("p", {
      text: "⚠️ Invalid Excalidraw JSON",
      cls: "excalidraw-inline-error",
    });
    return;
  }

  if (sceneData.type !== "excalidraw" || !Array.isArray(sceneData.elements)) {
    el.createEl("p", {
      text: "⚠️ Invalid Excalidraw data format",
      cls: "excalidraw-inline-error",
    });
    return;
  }

  await renderPreview(el, sceneData, trimmed, ctx, plugin);
}

function renderEmptyState(
  container: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  plugin: ExcalidrawPlugin,
) {
  const wrapper = container.createDiv({ cls: "excalidraw-inline-preview excalidraw-inline-empty" });
  const btn = wrapper.createEl("button", {
    cls: "excalidraw-inline-create-btn",
  });
  setIcon(btn, "pencil");
  btn.appendText(" 创建 Excalidraw 绘图");
  btn.addEventListener("click", () => {
    const emptyScene: InlineExcalidrawScene = {
      type: "excalidraw",
      version: 2,
      elements: [],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
    };
    const modal = new InlineExcalidrawModal(
      plugin.app, plugin, emptyScene, "", ctx, container,
    );
    modal.open();
  });
}

async function renderPreview(
  container: HTMLElement,
  sceneData: InlineExcalidrawScene,
  rawSource: string,
  ctx: MarkdownPostProcessorContext,
  plugin: ExcalidrawPlugin,
) {
  const elements = (sceneData.elements || []).filter((el: any) => !el.isDeleted);

  if (elements.length === 0) {
    renderEmptyState(container, ctx, plugin);
    return;
  }

  let svg: SVGSVGElement;
  const cacheKey = getCacheKey(sceneData);

  if (cacheKey && svgCache.has(cacheKey)) {
    svg = svgCache.get(cacheKey)!.cloneNode(true) as SVGSVGElement;
  } else {
    try {
      svg = await getSVG(
        {
          elements,
          appState: sceneData.appState || {},
          files: sceneData.files ?? {},
        },
        {
          withBackground: true,
          withTheme: true,
          isMask: false,
          skipInliningFonts: true,
        },
        16,
        null,
      );

      if (cacheKey) {
        svgCache.set(cacheKey, svg.cloneNode(true) as SVGSVGElement);
        if (svgCache.size > MAX_CACHE_SIZE) {
          const firstKey = svgCache.keys().next().value;
          if (firstKey) svgCache.delete(firstKey);
        }
      }
    } catch (e) {
      console.error("Excalidraw inline preview: failed to render SVG", e);
      container.createEl("p", {
        text: "⚠️ Failed to render Excalidraw preview",
        cls: "excalidraw-inline-error",
      });
      return;
    }
  }

  const wrapper = container.createDiv({ cls: "excalidraw-inline-preview" });

  const editBtn = wrapper.createEl("button", {
    cls: "excalidraw-inline-edit-btn",
    attr: { "aria-label": "编辑 Excalidraw" },
  });
  setIcon(editBtn, "pencil");
  editBtn.appendText(" 编辑");
  editBtn.addEventListener("click", () => {
    const modal = new InlineExcalidrawModal(
      plugin.app, plugin, sceneData, rawSource, ctx, container,
    );
    modal.open();
  });

  svg.setAttribute("width", "100%");
  svg.removeAttribute("height");
  wrapper.appendChild(svg);
}
