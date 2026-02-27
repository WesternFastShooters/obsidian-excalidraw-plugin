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

  const scrollBackBtn = wrapper.createEl("button", {
    cls: "excalidraw-scroll-back-btn",
    attr: { "aria-label": "滚动回到内容" },
  });
  setIcon(scrollBackBtn, "locate-fixed");
  scrollBackBtn.appendText(" 滚动回到内容");

  const excalidrawContainer = wrapper.createDiv({
    cls: "excalidraw-inline-view-container",
  });

  const openModal = () => {
    const modal = new InlineExcalidrawModal(
      plugin.app, plugin, sceneData, rawSource, ctx, container,
    );
    modal.open();
  };

  mountExcalidrawViewMode(excalidrawContainer, sceneData, plugin, openModal, scrollBackBtn);

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
  openModal: () => void,
  scrollBackBtn: HTMLElement,
) {
  let packages: any = null;
  try {
    packages = plugin.getPackage(window);
  } catch {
    // packageManager not yet initialized
  }

  if (!packages) {
    const retry = () => {
      let pkg: any = null;
      try {
        pkg = plugin.getPackage(window);
      } catch {
        // still not initialized
      }
      if (pkg) {
        doMount(container, sceneData, pkg, openModal, scrollBackBtn);
      } else {
        setTimeout(retry, 200);
      }
    };
    setTimeout(retry, 200);
    return;
  }

  doMount(container, sceneData, packages, openModal, scrollBackBtn);
}

function doMount(
  container: HTMLElement,
  sceneData: InlineExcalidrawScene,
  packages: any,
  openModal: () => void,
  scrollBackBtn: HTMLElement,
) {
  const React = packages.react;
  const ReactDOM = packages.reactDOM;
  const { Excalidraw } = packages.excalidrawLib;

  let viewAPI: any = null;
  let initialScrollX = 0;
  let initialScrollY = 0;
  let initialScrollDone = false;
  let scrollCheckTimer: ReturnType<typeof setTimeout> | null = null;

  const initialData = {
    elements: sceneData.elements || [],
    appState: {
      ...(sceneData.appState || {}),
      collaborators: new Map(),
    },
    files: sceneData.files || {},
    scrollToContent: true,
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
        excalidrawAPI: (api: any) => {
          if (api) {
            viewAPI = api;
            setTimeout(() => {
              api.scrollToContent();
              setTimeout(() => {
                try {
                  const st = api.getAppState();
                  initialScrollX = st.scrollX || 0;
                  initialScrollY = st.scrollY || 0;
                  initialScrollDone = true;
                } catch { /* ignore */ }
              }, 150);
            }, 200);
          }
        },
        onChange: (_elements: any, appState: any) => {
          if (!initialScrollDone) return;
          const sx = appState.scrollX || 0;
          const sy = appState.scrollY || 0;
          if (scrollCheckTimer) clearTimeout(scrollCheckTimer);
          scrollCheckTimer = setTimeout(() => {
            const dx = Math.abs(sx - initialScrollX);
            const dy = Math.abs(sy - initialScrollY);
            scrollBackBtn.style.display = (dx > 20 || dy > 20) ? "flex" : "none";
          }, 100);
        },
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

  const hookDisableViewModeBtn = (retries = 0) => {
    if (retries > 25) return;
    const btn = container.querySelector("button.disable-view-mode");
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.stopImmediatePropagation();
        e.preventDefault();
        openModal();
      }, { capture: true });
    } else {
      setTimeout(() => hookDisableViewModeBtn(retries + 1), 250);
    }
  };
  setTimeout(() => hookDisableViewModeBtn(), 300);

  scrollBackBtn.addEventListener("click", () => {
    if (viewAPI) {
      viewAPI.scrollToContent();
      scrollBackBtn.style.display = "none";
      setTimeout(() => {
        try {
          const st = viewAPI.getAppState();
          initialScrollX = st.scrollX || 0;
          initialScrollY = st.scrollY || 0;
        } catch { /* ignore */ }
      }, 200);
    }
  });
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
