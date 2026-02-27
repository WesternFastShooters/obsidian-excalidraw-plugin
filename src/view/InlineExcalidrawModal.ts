import {
  App,
  Modal,
  TFile,
  Scope,
  MarkdownPostProcessorContext,
} from "obsidian";
import ExcalidrawPlugin from "../core/main";
import { InlineExcalidrawScene } from "../core/managers/InlineExcalidrawProcessor";

const PERSIST_APPSTATE_KEYS = [
  "theme", "viewBackgroundColor",
  "currentItemStrokeColor", "currentItemBackgroundColor",
  "currentItemFillStyle", "currentItemStrokeWidth",
  "currentItemStrokeStyle", "currentItemRoughness",
  "currentItemOpacity", "currentItemFontFamily",
  "currentItemFontSize", "currentItemTextAlign",
  "currentItemStartArrowhead", "currentItemEndArrowhead",
  "currentItemArrowType", "currentItemRoundness",
  "scrollX", "scrollY", "zoom",
  "gridSize", "gridStep", "gridModeEnabled", "gridColor",
  "frameRendering", "objectsSnapModeEnabled",
];

export class InlineExcalidrawModal extends Modal {
  private plugin: ExcalidrawPlugin;
  private sceneData: InlineExcalidrawScene;
  private rawSource: string;
  private ctx: MarkdownPostProcessorContext;
  private previewContainer: HTMLElement;
  private excalidrawAPI: any = null;
  private excalidrawRoot: any = null;
  public declare scope: Scope;

  constructor(
    app: App,
    plugin: ExcalidrawPlugin,
    sceneData: InlineExcalidrawScene,
    rawSource: string,
    ctx: MarkdownPostProcessorContext,
    previewContainer: HTMLElement,
  ) {
    super(app);
    this.plugin = plugin;
    this.sceneData = sceneData;
    this.rawSource = rawSource;
    this.ctx = ctx;
    this.previewContainer = previewContainer;
    this.scope = new Scope(this.app.scope);
  }

  async onOpen() {
    const { contentEl, modalEl, containerEl } = this;

    const bgEl = containerEl.querySelector(".modal-bg");
    if (bgEl) bgEl.addClass("excalidraw-editor-modal-bg");
    modalEl.addClass("excalidraw-editor-modal");
    contentEl.addClass("excalidraw-editor-modal-content");

    const editorContainer = contentEl.createDiv({
      cls: "excalidraw-editor-container",
    });

    this.renderExcalidraw(editorContainer);

    this.scope.register([], "Escape", (evt: KeyboardEvent) => {
      evt.preventDefault();
      this.close();
    });
  }

  async onClose() {
    if (this.excalidrawAPI) {
      const elements = this.excalidrawAPI.getSceneElements();
      const appState = this.excalidrawAPI.getAppState();
      const files = this.excalidrawAPI.getFiles();

      if (elements && elements.length > 0) {
        await this.saveToCodeBlock(elements, appState, files);
      }
    }

    if (this.excalidrawRoot) {
      this.excalidrawRoot.unmount();
      this.excalidrawRoot = null;
    }

    this.excalidrawAPI = null;
    this.contentEl.empty();
  }

  private renderExcalidraw(container: HTMLElement) {
    const packages = this.plugin.getPackage(window);
    if (!packages) {
      container.createEl("p", { text: "⚠️ Excalidraw package not loaded" });
      return;
    }

    const React = packages.react;
    const ReactDOM = packages.reactDOM;
    const { Excalidraw } = packages.excalidrawLib;

    const initialData = {
      elements: this.sceneData.elements || [],
      appState: {
        ...(this.sceneData.appState || {}),
        collaborators: new Map(),
      },
      files: this.sceneData.files || {},
    };

    const self = this;
    const ExcalidrawWrapper = () => {
      return React.createElement(
        "div",
        {
          className: "excalidraw-wrapper",
          style: { width: "100%", height: "100%" },
        },
        React.createElement(Excalidraw, {
          excalidrawAPI: (api: any) => {
            self.excalidrawAPI = api;
            if (api) {
              setTimeout(() => api.scrollToContent(), 200);
            }
          },
          initialData,
          UIOptions: {
            useHoverToolbar: true,
            canvasActions: {
              loadScene: false,
              saveScene: false,
              saveAsScene: false,
              export: false,
              saveAsImage: false,
              saveToActiveFile: false,
            },
          },
          langCode: "zh-CN",
        }),
      );
    };

    this.excalidrawRoot = ReactDOM.createRoot(container);
    this.excalidrawRoot.render(React.createElement(ExcalidrawWrapper));
  }

  private async saveToCodeBlock(
    elements: any[],
    appState: any,
    files: any,
  ): Promise<void> {
    const sectionInfo = this.ctx.getSectionInfo(this.previewContainer);
    if (!sectionInfo) return;

    const file = this.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
    if (!(file instanceof TFile)) return;

    const filteredElements = elements.filter((el: any) => !el.isDeleted);

    const imgIds = new Set(
      filteredElements
        .filter((e: any) => e.type === "image")
        .map((e: any) => e.fileId),
    );
    const filteredFiles: Record<string, any> = {};
    if (files) {
      for (const [key, value] of Object.entries(files)) {
        if (imgIds.has(key)) filteredFiles[key] = value;
      }
    }

    const newSceneData = {
      type: "excalidraw",
      version: 2,
      source: this.sceneData.source || "obsidian-excalidraw-plugin",
      elements: filteredElements,
      appState: this.sanitizeAppState(appState || {}),
      files: filteredFiles,
    };

    const newJSON = JSON.stringify(newSceneData, null, "\t");

    await this.app.vault.process(file, (content) => {
      const lines = content.split("\n");
      const startLine = sectionInfo.lineStart;
      const endLine = sectionInfo.lineEnd;

      const before = lines.slice(0, startLine + 1).join("\n");
      const after = lines.slice(endLine).join("\n");

      return before + "\n" + newJSON + "\n" + after;
    });
  }

  private sanitizeAppState(appState: any): any {
    const cleaned: Record<string, any> = {};
    for (const key of PERSIST_APPSTATE_KEYS) {
      if (key in appState) cleaned[key] = appState[key];
    }
    return cleaned;
  }
}
