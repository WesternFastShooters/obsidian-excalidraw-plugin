import {
  MarkdownPostProcessorContext,
  setIcon,
} from "obsidian";
import ExcalidrawPlugin from "../main";
import { InlineExcalidrawModal } from "src/view/InlineExcalidrawModal";

export interface InlineExcalidrawScene {
  type: string;
  version: number;
  source?: string;
  elements: any[];
  appState?: Record<string, any>;
  files?: Record<string, any>;
}

const reactRoots = new WeakMap<HTMLElement, any>();

export function inlineExcalidrawProcessor(
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

  const elements = (sceneData.elements || []).filter((e: any) => !e.isDeleted);
  if (elements.length === 0) {
    renderEmptyState(el, ctx, plugin);
    return;
  }

  renderViewMode(el, sceneData, trimmed, ctx, plugin);
}

function renderViewMode(
  container: HTMLElement,
  sceneData: InlineExcalidrawScene,
  rawSource: string,
  ctx: MarkdownPostProcessorContext,
  plugin: ExcalidrawPlugin,
) {
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

  const excalidrawContainer = wrapper.createDiv({
    cls: "excalidraw-inline-view-container",
  });

  mountExcalidrawViewMode(excalidrawContainer, sceneData, plugin);

  const observer = new MutationObserver(() => {
    if (!container.isConnected) {
      unmountReactRoot(excalidrawContainer);
      observer.disconnect();
    }
  });
  observer.observe(container.parentElement ?? document.body, { childList: true, subtree: true });
}

function mountExcalidrawViewMode(
  container: HTMLElement,
  sceneData: InlineExcalidrawScene,
  plugin: ExcalidrawPlugin,
) {
  const packages = plugin.getPackage(window);
  if (!packages) {
    const retry = () => {
      const pkg = plugin.getPackage(window);
      if (pkg) {
        doMount(container, sceneData, pkg);
      } else {
        setTimeout(retry, 200);
      }
    };
    setTimeout(retry, 200);
    return;
  }

  doMount(container, sceneData, packages);
}

function doMount(
  container: HTMLElement,
  sceneData: InlineExcalidrawScene,
  packages: any,
) {
  const React = packages.react;
  const ReactDOM = packages.reactDOM;
  const { Excalidraw } = packages.excalidrawLib;

  const initialData = {
    elements: sceneData.elements || [],
    appState: {
      ...(sceneData.appState || {}),
      collaborators: new Map(),
    },
    files: sceneData.files || {},
  };

  const ViewModeWrapper = () => {
    return React.createElement(
      "div",
      {
        className: "excalidraw-wrapper",
        style: { width: "100%", height: "100%" },
      },
      React.createElement(Excalidraw, {
        initialData,
        viewModeEnabled: true,
        UIOptions: {
          canvasActions: {
            loadScene: false,
            saveScene: false,
            saveAsScene: false,
            export: false,
            saveAsImage: false,
            saveToActiveFile: false,
            changeViewBackgroundColor: false,
          },
        },
      }),
    );
  };

  const root = ReactDOM.createRoot(container);
  root.render(React.createElement(ViewModeWrapper));
  reactRoots.set(container, root);
}

function unmountReactRoot(container: HTMLElement) {
  const root = reactRoots.get(container);
  if (root) {
    root.unmount();
    reactRoots.delete(container);
  }
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
