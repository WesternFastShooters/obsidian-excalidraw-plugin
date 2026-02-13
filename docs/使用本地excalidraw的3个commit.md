# 让 obsidian-excalidraw-plugin 用上本地 excalidraw 的 3 个 commit

插件当前依赖 npm 包 `@zsviczian/excalidraw`（package.json 里是 `0.18.0-75`）。要让插件用**你在本地 excalidraw 仓库里那 3 个 commit** 的代码，可以用下面两种方式之一。

---

## 方式一：用本地构建 + `file:` 依赖（推荐开发时用）

思路：在本地 excalidraw 里构建出「包」，再让插件通过 `file:` 指向这个本地路径。

### 1. 在 excalidraw 仓库里

- 确保你在分支 **0.18.0-75**（或已包含那 3 个 commit 的分支），且 `yarn start` 能正常跑（之前修过的 textWysiwyg / mindmap / actionMindmapLayout 等都已修好）。
- 构建可被消费的包（只构建 excalidraw 这一个 package）：
  ```bash
  cd /Users/shimo/project/obsidian-plugin/excalidraw
  yarn build:package
  ```
  即执行 `yarn --cwd ./packages/excalidraw build:esm`，会在 `packages/excalidraw/dist` 和类型目录生成产物。

### 2. 包名与插件期望是否一致

- 官方 excalidraw 里 `packages/excalidraw` 的 `package.json` 里 **name** 是 `@excalidraw/excalidraw`。
- 插件安装的是 **@zsviczian/excalidraw**，且代码里写的是：
  - `@zsviczian/excalidraw/types/element/src/types`
  - `@zsviczian/excalidraw/types/excalidraw/types`
  - `@zsviczian/excalidraw/types/common/src/utility-types`
  说明 npm 上的 `@zsviczian/excalidraw` 是**单独的一套构建**（带 `types/element`、`types/excalidraw`、`types/common` 等路径），和官方 monorepo 直接 build 出来的结构可能不一样。

因此有两种子做法：

**2a）不改包名，用 resolve alias 指到本地（适合先跑通）**

- 在 excalidraw 里正常 `yarn build:package`（包名仍是 `@excalidraw/excalidraw`）。
- 在 **obsidian-excalidraw-plugin** 的打包配置（如 rollup.config.js）里，把对 `@zsviczian/excalidraw` 的 resolve 指到你本地的构建结果目录，例如：
  - `resolve.alias`: `'@zsviczian/excalidraw'` → `path.resolve(__dirname, '../excalidraw/packages/excalidraw')`
- 这样插件打包时会用你本地 excalidraw 的 dist，**前提是**：本地构建产物的入口和类型路径要和插件里 import 的路径兼容。若官方构建只有 `dist/types/excalidraw/` 而没有 `types/element`、`types/common`，插件里部分 import 可能会报错，那时需要再对照 npm 上 0.18.0-74 的包结构，看是否要在本地用脚本做一层目录/符号链接或二次构建。

**2b）本地改成和 @zsviczian/excalidraw 一致再 file:（结构一致时最省心）**

- 若你能确认当前 **@zsviczian/excalidraw** 的 npm 包结构（解压 0.18.0-74 的 tgz 看 `types/`、`dist/` 等），可以在 excalidraw 里：
  - 把 `packages/excalidraw/package.json` 的 **name** 改成 `@zsviczian/excalidraw`；
  - 必要时调整构建脚本或 `exports`，使产出目录和 npm 包一致（含 `types/element`、`types/excalidraw`、`types/common` 等）；
  - 再 `yarn build:package`。
- 然后在 **obsidian-excalidraw-plugin** 的 `package.json` 里：
  ```json
  "dependencies": {
    "@zsviczian/excalidraw": "file:../excalidraw/packages/excalidraw"
  }
  ```
  路径按你本机两个仓库的相对位置改（例如同级的 `excalidraw` 和 `obsidian-excalidraw-plugin` 就是 `../excalidraw/packages/excalidraw`）。
- 最后在插件目录执行：
  ```bash
  npm install
  ```
  再 `npm run build` 或 `npm run dev` 即可用上本地那 3 个 commit 的代码。

---

## 方式二：发自己的 npm 包 @whfzgyx/excalidraw（推荐）

你只能发自己 scope 的包（例如 **@whfzgyx/excalidraw**）。用 npm 的**依赖别名**可以让插件继续写 `import ... from "@zsviczian/excalidraw"`，但实际安装的是你的包，无需改插件里任何 import。

### 1. 在 excalidraw 仓库里

- 分支 0.18.0-75（或已包含那 3 个 commit 的分支），确保能正常构建。
- 改包名和版本：
  - 打开 `packages/excalidraw/package.json`
  - 把 **name** 改成 `@whfzgyx/excalidraw`
  - 把 **version** 改成 `0.18.0-75`（或你想要的版本号，如 `0.18.0-75.1`）
- 构建并发布：
  ```bash
  cd /Users/shimo/project/obsidian-plugin/excalidraw
  yarn build:package
  cd packages/excalidraw
  npm publish --access public
  ```
  （若未登录 npm，先 `npm login`；scope 为 `@whfzgyx` 时需确保该 scope 已存在或首次发布时会创建。）

### 2. 在 obsidian-excalidraw-plugin 里

在 `package.json` 的 `dependencies` 里，用 **npm 别名** 把 `@zsviczian/excalidraw` 指到你的包：

```json
"@zsviczian/excalidraw": "npm:@whfzgyx/excalidraw@0.18.0-75"
```

然后执行：

```bash
cd /Users/shimo/project/obsidian-plugin/obsidian-excalidraw-plugin
npm install
```

之后插件里所有 `@zsviczian/excalidraw` 的 import 都会解析到 npm 上的 `@whfzgyx/excalidraw@0.18.0-75`，**不用改任何业务代码**。

---

## 小结

| 目标 | 做法 |
|------|------|
| 开发时立刻用本地 3 个 commit | 用 **方式一**：excalidraw 里 `yarn build:package`，插件里用 **file:** 或 **resolve alias** 指到本地 `packages/excalidraw`（注意包名和 `types/` 结构要和 @zsviczian/excalidraw 一致或自己做 alias）。 |
| 发自己的包、插件用版本号安装且不改 import | 用 **方式二**：excalidraw 改 name 为 `@whfzgyx/excalidraw` 并 `npm publish`，插件里写 `"@zsviczian/excalidraw": "npm:@whfzgyx/excalidraw@0.18.0-75"`，再 `npm install`。 |

注意：插件当前 import 的是 `@zsviczian/excalidraw/types/element/...`、`types/excalidraw/...`、`types/common/...`，而官方 excalidraw 的 `packages/excalidraw` 默认构建可能只暴露 `dist/types/excalidraw/`。若用方式一时出现找不到 `types/element` 或 `types/common`，需要对照 npm 上现有 @zsviczian/excalidraw 的包结构，在本地用构建或目录结构复刻同一布局，或调整插件的 rollup alias 到正确的子路径。
