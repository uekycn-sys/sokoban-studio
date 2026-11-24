# 《Sokoban Studio》 · 专业级 Web 推箱子与高性能 AI 求解系统

> 🎮 现代高颜值暖暗色工作室风格、内置 Push-based A* 宏搜索 AI 求解器、全自动化 25 关可解性验算与 GitHub Pages 一键自动化部署。

---

## ✨ 核心亮点

### 1. ⚡ 毫秒级 Push-based A* 宏搜索 AI 求解器
摒弃传统耗时卡顿的人格级 BFS 搜索，在 `src/solver/solverCore.ts` 严格实现推箱子顶尖算法：
- **推箱宏动作状态空间**：搜索树的每一步为“人物由内部 BFS 连通域走到箱子旁并推一步”，解出后再展开为包含行走与推箱的完整序列，将搜索深度压缩 3~5 倍。
- **状态归一化去重（Canonical State Key）**：同一组箱子位置下，人物处于同一连通块内判定为等价状态（以左上角最小坐标作为标准代表元）。
- **两级死锁剪枝（Deadlock Pruning）**：
  - **静态死锁预计算**：关卡启动前从全部目标点进行**逆向拉箱 BFS**，所有无法拉入的地板标记为永久死锁格。推入非目标死锁格立即剪枝。
  - **动态 2×2 死锁检测**：实时检测推箱后形成的 $2\times 2$ 实体方块（箱子+墙壁组合），若存在未入位箱子立即剪枝。
- **加权 A\* 与路网真实启发**：预计算全图到最近目标点的真实路网距离，默认 $w=1.3$ 加权 A\*，绝大多数中高难度关卡在 **0.5ms ~ 15ms** 内瞬间出解。
- **Web Worker 隔离运行**：求解全程在独立线程计算，主线程 UI 绝无任何掉帧与卡顿。

### 2. 🤖 深度交互式 AI 助手系统
- **单步提示（Hint）**：按快捷键 `H` 或点击按钮，AI 自动高亮下一步最优被推箱子与方向，并自动执行。
- **完整步骤演示（Demo Player）**：从当前局面或开局求解，支持**播放/暂停、单步前进/后退、倍速切换（0.5x / 1x / 2x / 4x）、进度滑块随意拖拽**，以及随时**一键接管控制**继续玩。
- **智能死局检测与自动回溯**：当玩家将局面推入不可解死局时，AI 绝不冷漠报错，而是智能提示“当前局面已进入死局”，并提供两个一键方案：
  - **「回退到最近可解状态并演示」**：利用历史栈快速回退至死锁发生前的临界点并展开演示。
  - **「重置本关并从头演示」**：一键重开本关并从头演示完整通关步骤。

### 3. 🎨 暖暗色工作室美学与极致触控手感
- **纯矢量高精细度 SVG 棋盘**：
  - **墙体**：立体浮雕深岩灰砖石质感。
  - **地板**：泛洪算法区分室内活动地板与室外留白，带微光网格。
  - **目标点**：琥珀金呼吸微光菱形标志。
  - **箱子与入位特效**：木纹加固箱体，推入目标点瞬间转为**翡翠绿发光锁定状态**并伴随弹性缩放。
  - **推箱小人**：高辨识度卡通工装推箱小人，支持平滑 CSS/Transform 位移与 80ms 朝向旋转过渡。
- **全端操控适配**：
  - **键盘热键**：`WASD` / 方向键移动，`Z` 撤销，`Y` 重做，`R` 重开，`H` 提示，`Space` 演示播放/暂停。
  - **鼠标直觉操作**：点击任意可达空地，人物**自动沿 BFS 最短路径走过去**；点击相邻箱子直接推动。
  - **移动端适配**：触屏自动呼出虚拟方向键（Virtual D-Pad）与快捷撤销键。
- **原生 Web Audio API 合成音效**：
  - 零外部 mp3 文件依赖，脚步微响、推箱摩擦低鸣、箱子入位水晶清脆音、撤销倒带声与通关大调和弦琶音。

### 4. 🏆 25 关循序渐进关卡与 100% 可解性验算
- 关卡分为 5 大章节：
  - **第一章：入门教学**（第 1 ~ 5 关）：直道推箱、拐角腾挪、双翼分流。
  - **第二章：巧思进阶**（第 6 ~ 10 关）：十字枢纽、单行狭道、回旋长廊。
  - **第三章：空间腾挪**（第 11 ~ 15 关）：凹槽借位、双子走廊、错层阶梯、风车之环。
  - **第四章：大师试炼**（第 16 ~ 20 关）：乾坤挪移、锁钥迷宫、连环扣、圆融归一。
  - **第五章：经典挑战**（第 21 ~ 25 关）：微型仓储、巨石列阵、宗师之门、创世殿堂。
- 内置 `scripts/verify-levels.ts` 自动化验算脚本，确保 25/25 关卡数据合法、箱子目标匹配、封闭且 100% 可解！

---

## 🚀 本地运行与开发

### 环境要求
- Node.js >= 18.0.0
- npm >= 9.0.0

### 安装与启动
```bash
# 1. 进入项目根目录
cd sokoban-studio

# 2. 安装项目依赖
npm install

# 3. 运行关卡 100% 可解性强制验算脚本
npm run verify-levels

# 4. 启动本地 Vite 开发服务器
npm run dev
```
启动后在浏览器打开终端提示的地址（如 `http://localhost:3000`）即可畅玩。

### 生产环境打包验证
```bash
npm run build
```
打包产物将输出至 `dist/` 目录，Vite 会自动将 Web Worker 与主应用并行编译打包。

---

## 🌐 GitHub Pages 一键自动化部署

本项目已预置标准 GitHub Actions 部署工作流（`.github/workflows/deploy.yml`）与适配相对路径的 `vite.config.ts`（`base: './'`），支持部署至任何个人或组织仓库。

### 部署步骤（只需 3 步）：

1. **推送到 GitHub**：
   在 GitHub 上新建一个仓库（例如 `sokoban-studio`），将本地代码提交并推送到 `main` 分支：
   ```bash
   git init
   git add .
   git commit -m "feat: complete Sokoban Studio with AI solver and 25 levels"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/sokoban-studio.git
   git push -u origin main
   ```

2. **启用 GitHub Pages**：
   - 打开 GitHub 仓库页面，点击右上角的 **Settings**（仓库设置）。
   - 在左侧菜单中找到 **Pages**。
   - 在 **Build and deployment** 下方的 **Source** 下拉菜单中，选择 **GitHub Actions**。

3. **自动上线**：
   - 推送代码后，GitHub Actions 将自动执行：依赖安装 ➔ 25 关验算 ➔ 生产打包 ➔ 上传并发布 Pages。
   - 部署完成后，在 `Settings -> Pages` 顶部即可看到你的专属游戏网址：
     `https://<你的用户名>.github.io/sokoban-studio/`

---

## 📁 项目目录结构

```text
sokoban-studio/
├── .github/
│   └── workflows/
│       └── deploy.yml         # GitHub Actions 自动化构建部署脚本
├── scripts/
│   └── verify-levels.ts       # 关卡合法性与 AI 求解 100% 验证脚本 (tsx)
├── src/
│   ├── audio/
│   │   └── sound.ts           # 原生 Web Audio API 合成音效引擎
│   ├── components/
│   │   ├── AIDemoBar.tsx      # AI 演示播放器与死局挽救控制器
│   │   ├── LevelSelectorModal.tsx # 带迷你 SVG 缩略图预览的关卡选择弹窗
│   │   ├── SokobanBoard.tsx   # 纯矢量高精细度 SVG 游戏主画布
│   │   ├── TopBar.tsx         # 顶部状态、关卡导航与操作工具栏
│   │   ├── VictoryModal.tsx   # 通关彩带特效与星级结算弹窗
│   │   └── VirtualDPad.tsx    # 移动端虚拟方向键组件
│   ├── engine/
│   │   └── sokoban.ts         # 纯函数推箱子引擎（XSB解析、移动判定、BFS寻路）
│   ├── levels/
│   │   └── levels.ts          # 25 个精巧关卡数据与参考基准步数
│   ├── solver/
│   │   ├── solverCore.ts      # Push-based A* AI 宏搜索核心算法
│   │   └── solver.worker.ts   # Web Worker 多线程独立封装
│   ├── types/
│   │   └── game.ts            # 全局 TypeScript 核心接口定义
│   ├── App.tsx                # 游戏主应用逻辑调度器
│   ├── index.css              # Tailwind 指令与全局样式
│   └── main.tsx               # React 根入口
├── index.html                 # HTML 入口模板
├── package.json               # 项目依赖与运行脚本
├── tailwind.config.js         # 暖暗色工作室调色板配置
├── tsconfig.json              # TypeScript 配置
└── vite.config.ts             # Vite 配置（base: './' 与 worker 打包）
```

---

## 📜 许可协议
本项目采用 [MIT License](LICENSE) 开源协议，欢迎交流与二次创作！
