# readTime 技术架构文档

> 本文档与 [PLAN.md](./PLAN.md) 配套:PLAN.md 定义"学什么、学到什么程度",本文档定义"用什么技术、怎么实现、如何演进"。适用于本项目所有开发 contributors,亦是后续评审与迭代的基准。

---

## 目录

1. [架构目标与约束](#一架构目标与约束)
2. [总体架构](#二总体架构)
3. [技术选型](#三技术选型)
4. [前端应用架构](#四前端应用架构)
5. [领域模型](#五领域模型)
6. [核心机制设计](#六核心机制设计)
7. [数据架构](#七数据架构)
8. [API 设计(预留)](#八api-设计预留)
9. [迁移路径:纯前端 → 全栈](#九迁移路径纯前端--全栈)
10. [目录结构](#十目录结构)
11. [质量保障](#十一质量保障)
12. [安全与隐私](#十二安全与隐私)
13. [架构演进路线](#十三架构演进路线)
14. [附录:架构决策记录(ADR)](#十四附录架构决策记录adr)

---

## 一、架构目标与约束

### 1.1 功能性目标(来自 PLAN.md 课程体系 8 大模块)

| 模块 | 架构必须支撑的能力 |
| --- | --- |
| 词汇 | 分级词库加载、SM-2 间隔重复调度、每日任务生成 |
| 语法 | 课程树、练习题流、错题本 |
| 发音 | 录音、播放、评测打分(可升级 AI) |
| 听力 | 分级音频、倍速、精听听写 |
| 口语 | 跟读/独白录音、回放、评分 |
| 阅读 | 分级文章、理解测试、生词一键入复习队列 |
| 测评 | 定级/月度/年度测试、弱项诊断报告 |
| 激励 | 连胜、XP、勋章、学习周报(数据聚合) |

### 1.2 非功能性目标

| 维度 | 目标 |
| --- | --- |
| 可演进性 | 纯前端 → 全栈迁移时,**UI 组件与领域层零改动或极小改动** |
| 性能 | 首屏 JS ≤ 200KB(gzip);路由级代码分割;词库按阶段懒加载 |
| 离线可用 | 学习记录本地持久化,断网可完成学习会话 |
| 可测试性 | 领域逻辑(调度/评分/诊断)为纯函数,100% 可单测 |
| 数据安全 | 本地数据版本化、可导出、可迁移,不因升级丢失学习记录 |

### 1.3 关键约束

- 当前为**纯前端项目**,只能静态托管(无 Node 运行时);
- 词汇数据量最终达 10,000 词级,音频/文章为静态资源;
- 无用户体系(匿名使用),但必须为未来账号与云同步预留。

---

## 二、总体架构

### 2.1 分层架构图

```
┌────────────────────────────────────────────────────────────┐
│  UI 层   app/routes/*  app/features/*  app/components/ui/*  │
│          (页面路由 / 业务组件 / 基础组件,不含任何数据逻辑)      │
├────────────────────────────────────────────────────────────┤
│  状态层  app/features/*/hooks + reducers                    │
│          SessionContext · SettingsContext · 会话状态机        │
├────────────────────────────────────────────────────────────┤
│  领域层  app/lib/srs · scoring · diagnosis · scheduler      │
│          (纯函数:SM-2 调度、评分、弱项诊断、每日任务编排)        │
├────────────────────────────────────────────────────────────┤
│  数据层  app/lib/api (ApiClient) + app/lib/repositories/*   │
│          LocalApiClient ──(阶段2 切换)──▶ HttpApiClient      │
├────────────────────────────────────────────────────────────┤
│  存储层  阶段0: public/data 静态内容 + IndexedDB(唯一本地库)          │
│          阶段1+: Remix resource routes + SQLite/Postgres    │
└────────────────────────────────────────────────────────────┘
        ▲ Outbox 同步队列(本地写 → 后台批量上报,阶段2 激活)
```

**依赖规则(强制):** 上层只能依赖紧邻下层;UI 组件**禁止**直接调用 `indexedDB`、`localStorage`、`fetch` 等浏览器存储/网络 API——一切数据读写必须经数据层接口。这是"平滑过渡全栈"的架构根基。

### 2.2 一次典型数据流(每日词汇任务)

```
用户进入 /learn/vocab
  → route clientLoader 调 VocabService.getTodayTask(userId)
    → DailyScheduler(领域层) 读取 ReviewStates + DailyLog
      → ReviewRepository(数据层) 经 by-due 索引从 IndexedDB 读出到期队列
      → ContentRepository 按进度指针从 public/data/vocab/stage1/ 分片取新词
    → 返回 VocabTask { newWords[], reviews[], goal }
  → 组件渲染;用户答题 → dispatch(ANSWER)
  → 会话结束时 ReviewRepository.batchSave(更新 SM-2 状态)
    → 本地写 + Outbox 追加(联网时 flush 到 /api/vocab/review)
```

---

## 三、技术选型

| 类别 | 选型 | 版本基线 | 选择理由 | 演进考虑 |
| --- | --- | --- | --- | --- |
| 框架 | Remix(Vite 插件模式) | v2.x | 路由即文件、clientLoader/loader 双轨机制天然支持"先前端后全栈" | v3(React Router 7 合并)平滑升级 |
| 语言 | TypeScript(strict) | 5.x | 领域模型即类型,前后端共享 | — |
| UI 样式 | Tailwind CSS | 3.x | 原子化,免自定义 CSS 工程 | — |
| 状态管理 | React Context + useReducer | 内置 | 会话状态规模可控,零依赖 | 状态膨胀再评估 zustand |
| 本地数据库 | IndexedDB + `idb` 轻量封装 | idb 8.x | 容量充裕(数百 MB 级)、按键/索引按记录读写、可直存录音 Blob、异步不阻塞主线程 | localStorage 原则禁用,豁免须经 ADR 评审(当前为零) |
| 数据校验 | zod | 3.x | 校验 schema 前后端复用(API 契约即 schema) | — |
| 单元测试 | Vitest + Testing Library | — | 与 Vite 工具链同构 | — |
| E2E(可选) | Playwright | — | 覆盖关键学习流 | — |
| 语音 | 预生成 m4a 音频包(Reed 神经语音)+ Web Speech API 回退;MediaRecorder 录音 | 浏览器内置 + 静态资源 | 音色统一清晰、离线可用;TTS 仅兜底(精选发音人) | 阶段3 换服务端 AI 评测 |
| 图表(周报) | 轻量 SVG 自绘 或 recharts | — | 学习周报可视化 | — |

**刻意不引入:** Redux(规模不匹配)、Redux-Saga/RTK Query(无服务端)、CSS-in-JS(Tailwind 已覆盖)、ORM(阶段 1 再引入 Drizzle)、Dexie(暂无需查询引擎,`idb` 更轻)、localStorage(本地存储一律走 IndexedDB,见 ADR-007)。

---

## 四、前端应用架构

### 4.1 渲染与部署模式:SPA Mode 起步

- **阶段 0**:Remix **SPA Mode**(`ssr: false`),构建产物为纯静态资源,可托管于任意静态服务器(GitHub Pages / Vercel Static / Nginx)。所有路由数据经 `clientLoader` 获取。
- **阶段 1**:关掉 SPA Mode,开启服务端渲染与 resource routes;页面逐个把 `clientLoader` 替换为服务端 `loader`(**组件与 hooks 不动**,数据层换注入实现)。
- 这保证了第一天起就运行在"未来架构"的骨架上,迁移是配置与数据层的变化,而非重写。

### 4.2 路由设计

**页面路由(`app/routes/`):**

| 路由文件 | 路径 | 说明 | 数据来源 |
| --- | --- | --- | --- |
| `_index.tsx` | `/` | 今日任务台(打卡、连胜、任务入口) | Progress + DailyLog |
| `words.tsx` | `/words` | 词库浏览(三年 10,000 词,按 unit 折叠 + 搜索 + 级别筛选 + 发音) | ContentRepo(静态,按 stage 懒加载) |
| `learn.vocab.tsx` | `/learn/vocab` | 词汇学习会话(新词+复习混合) | ReviewRepo + ContentRepo |
| `learn.grammar._index.tsx` / `learn.grammar.$lessonId.tsx` | `/learn/grammar(/:id)` | 语法课列表 / 微课+练习 | ContentRepo(静态) |
| `learn.listening._index.tsx` | `/learn/listening` | 听力选择页(今日听写入口 + 精听素材库) | ContentRepo + VocabService |
| `learn.listening.dictation.tsx` | `/learn/listening/dictation` | 今日听写(已学词听音选词/听写) | ReviewRepo + ContentRepo |
| `learn.listening.$itemId.tsx` | `/learn/listening/:itemId` | 精听会话(逐句播放/连播/盲听 + 理解题) | ContentRepo(listening) + Audio |
| `learn.reading._index.tsx` / `learn.reading.$articleId.tsx` | `/learn/reading(/:id)` | 阅读文章列表 / 文+理解题+生词摘录 | ContentRepo |
| `learn.pron.tsx` | `/learn/pron` | 发音训练(例句/文章句跟读打分) | PronEvaluator |
| `assess.$type.tsx` | `/assess/:type` | 测评(placement/monthly/annual,规划中) | AssessmentRepo |
| `stats.tsx` | `/stats` | 学习周报/弱项诊断 | DailyLog 聚合 |
| `settings.tsx` | `/settings` | 每日新词量、倍速、数据导出 | SettingsRepo |
| `api.*.ts` | `/api/*` | Resource routes(阶段 1 激活,见第八节) | — |

### 4.3 组件架构:三层组件

```
app/
├── routes/            # ① 页面层:只做路由编排 + clientLoader
├── features/          # ② 业务组件层:按领域分包(核心!)
│   ├── vocab/         #   <VocabSession> <QuizCard> <SessionSummary> + hooks + reducer
│   ├── grammar/
│   ├── pron/
│   ├── listening/
│   ├── reading/
│   ├── assess/
│   └── gamify/        #   <StreakBadge> <XpBar> <WeeklyReport>
└── components/ui/     # ③ 基础组件层:Button/Card/ProgressBar/AudioPlayer/Recorder...
```

规则:① 不含业务 JSX;② 不 import ③;② 是唯一同时接触状态层与 UI 层的地方;③ 无状态或仅受控状态。

### 4.4 状态管理:三类状态 + 会话状态机

| 状态类别 | 例子 | 方案 | 生命周期 |
| --- | --- | --- | --- |
| 会话状态(内存) | 当前题目、答题记录、倒计时 | `useReducer` 状态机(见下) | 单次学习会话 |
| 用户设置(持久) | 每日新词量、音频倍速、主题 | SettingsContext + SettingsRepo | 跨会话 |
| 学习档案(持久) | 复习状态、进度、连胜、测评史 | 领域对象经 Repository 读写,不进 React 全局状态,避免大对象重渲染 | 永久(本地→云端) |

持久化状态均为异步读取(IndexedDB):由各路由 `clientLoader`(配合 `HydrateFallback`)在渲染前就绪,组件内不出现加载闪烁;跨标签页设置同步经 `BroadcastChannel` 广播。

**学习会话状态机(`features/vocab/sessionReducer.ts`):**

```
IDLE ──START──▶ LOADING ──LOADED──▶ ACTIVE ⇄ FEEDBACK ──NEXT──▶ ACTIVE
                   │                    │                        │
                   └─ERROR─▶ FAILED     └─(队列耗尽)──▶ SUMMARY ──EXIT──▶ IDLE
```

事件:`START / LOADED / ANSWER / NEXT / FINISH / EXIT / ERROR`。所有题型(选择、拼写、听音辨词)复用同一状态机,仅渲染层不同。

---

## 五、领域模型(`app/models/`)

```ts
// models/types.ts —— 全量前后端共享类型(阶段1 后 API 契约直接复用)

type CEFR = 'A1' | 'A2' | 'B1' | 'B2';
type Stage = 1 | 2 | 3;              // 对应三年三阶段
type Grade = 0 | 1 | 2 | 3 | 4 | 5;  // SM-2 评分

interface VocabWord {
  id: string;            // 'w-o3k-0001'
  term: string;          // 'abandon'
  phonetic: string;      // '/əˈbændən/'
  meaning: string;       // 中文释义
  level: CEFR;
  stage: Stage;
  unit: string;          // 所属单元(按 PLAN.md 月度计划切分)
  examples: { en: string; zh: string }[];
  tags: string[];        // 场景标签:campus/travel/academic...
}

/** SM-2 复习状态(每词一条) */
interface ReviewState {
  wordId: string;
  easeFactor: number;    // EF,初始 2.5,下限 1.3
  intervalDays: number;  // 当前间隔
  repetitions: number;   // 连续正确次数
  dueDate: string;       // ISO 日期
  lapses: number;        // 遗忘次数
  lastReviewedAt: string | null;
  source?: "main" | "reading";  // 生词来源:主线任务(缺省)或阅读点词加入
  sourceArticleId?: string;       // 阅读来源生词的文章 id,复习卡片提供"回原文"
}

interface SessionItem {
  wordId: string;
  kind: 'new' | 'review';
  grade: Grade | null;
  elapsedMs: number;
}

interface LearningSession {
  id: string;
  type: 'vocab' | 'grammar-quiz' | 'listening-dictation' | 'reading-quiz' | 'pron-drill';
  startedAt: string; endedAt: string | null;
  items: SessionItem[];
  xpEarned: number;
}

interface DailyLog {
  date: string;          // 'YYYY-MM-DD'(本地时区)
  newWordsLearned: number;
  reviewsDone: number;
  minutes: number;
  xp: number;
  modulesTouched: LearningSession['type'][];
}

interface AssessmentResult {
  id: string; type: 'placement' | 'monthly' | 'annual';
  takenAt: string;
  cefrEstimated: CEFR;
  scores: { listening: number; reading: number; grammar: number; vocab: number }; // 0-100
  weakPoints: string[];  // 语法知识点/场景标签,供弱项强化
}

interface Streak {
  current: number; longest: number;
  lastActiveDate: string;   // 'YYYY-MM-DD'
  freezesLeft: number;      // 本月剩余"连胜保护"次数(PLAN: 每月 2 次)
}

interface Progress {
  userId: string;                 // 阶段0 固定 'local-anonymous'
  stage: Stage;
  vocabPointer: string;           // 新词进度指针(wordId)
  completedGrammarLessons: string[];
  readArticles: string[];
  assessmentHistory: AssessmentResult[];
  streak: Streak;
  xp: number;
  updatedAt: string;
}

interface Settings {
  dailyNewWords: number;          // 默认 10
  audioRate: 0.5 | 0.75 | 1 | 1.25 | 1.5;
  reminderEnabled: boolean;
}
```

---

## 六、核心机制设计

### 6.1 SM-2 间隔重复调度器(`app/lib/srs/`)

纯函数、无 IO,是全项目最关键的领域资产(前后端通用):

```ts
// lib/srs/sm2.ts
export interface SrsScheduler {
  init(wordId: string, now: Date): ReviewState;
  schedule(state: ReviewState, grade: Grade, now: Date): ReviewState;
  isDue(state: ReviewState, now: Date): boolean;
}

export function createSm2Scheduler(): SrsScheduler { /* 标准SM-2实现 */ }
```

算法要点:
- `grade >= 3` 视为通过:`repetitions+1`,间隔序列 `1 → 6 → round(prev × EF)`;
- `grade < 3` 遗忘:`repetitions=0`、`intervalDays=1`、`lapses+1`、EF 惩罚;
- EF 更新:`EF' = max(1.3, EF + (0.1 − (5−q)×(0.08+(5−q)×0.02)))`;
- 接口化是为阶段 3 可替换为 FSRS 等更优算法,调用方无感。

### 6.2 每日任务调度器(`lib/scheduler/daily.ts`)

```ts
interface DailyScheduler {
  buildTask(input: {
    reviewStates: ReviewState[];     // 到期词
    vocabPointer: string;            // 新词位置
    settings: Settings; dailyLog: DailyLog;
  }, now: Date): VocabTask;
}
```

规则:到期复习优先(复习:新词占比随月度留存率自适应——留存率 <80% 时新词量自动下调,落实 PLAN 风险应对);输出混合队列并交错排序(不允许连续 3 题同类型)。

### 6.3 激励系统(`lib/gamify/`)

| 规则 | 逻辑 |
| --- | --- |
| XP | 新词 10/词、复习通过 5/词、会话完成 +20、测评完成 +100 |
| 连胜 | 当日任意会话完成即维持;跨日以**本地时区**判断;复盘日不计断卡;`freezesLeft` 消耗保护 |
| 勋章 | 里程碑驱动(词汇 1000/3000/6000/10000、连胜 7/30/100、CEFR 达标),纯配置表 `models/badges.ts` |

### 6.4 发音评测适配器(`lib/speech/`)

```ts
export interface PronEvaluator {
  evaluate(input: { audio: Blob; script: string }): Promise<PronScore>;
}
export interface PronScore {
  overall: number;                  // 0-100,对齐 PLAN 的 85/88/90+ 指标
  wordAccuracies: { word: string; score: number }[];
  engine: 'web-speech' | 'server-ai';
}
```

- **阶段 0(已落地,`lib/speech/scoring.ts` 的 `scoreSpeech`)**:SpeechRecognition 转写与目标句做词级多重集匹配——`overall` = 词命中率 × 100,`wordAccuracies` 命中记 100/未命中记 0;MediaRecorder 采集与录音 Blob 存档回放列为增强项,阶段 0 不落库;
- **阶段 3**:`ApiPronEvaluator`——POST `/api/pron/evaluate`,获得音素级评分;
- 两者同接口热插拔,`overall` 口径统一,历史分数可比。

### 6.5 测评与弱项诊断(`lib/diagnosis/`)

- 阶段 0:固定卷库(按 CEFR 级别),百分制分科得分;
- 诊断 = 知识点(语法点/场景标签)错误率聚合,取错误率 > 40% 的前 3 项写入 `weakPoints`,供 6.2 的调度器加权出题与周报展示;
- 阶段 3 升级为自适应出题(依答题实时估力,接口预留 `AdaptiveAssessEngine`)。

---

## 七、数据架构

### 7.1 静态内容分发(`public/data/`)

代码与内容严格分离(ADR-003):

```
public/data/
├── vocab/stage1/          # 第一年 3000 词(99 主题单元,u01–u99)= manifest.json + part-01..02
├── vocab/stage2/          # 第二年 3000 词(100 主题单元,u01–u100:通用主题 + 8 大场景)= manifest + 2 片
├── vocab/stage3/          # 第三年 4000 词(135 单元,u01–u135:AWL 学术词 + 主题/场景单元,全局 term 零重复)= manifest + 3 片
├── grammar/               # 3,426 课 = 每 stage 1,142 课;part 28 片 + 索引拆 7 片
│   ├── index.json         #   { total, parts, indexParts, items:[{id,title,summary,level,stage,questionCount,part}] } 列表页只拉这个
│   ├── index-part-XX.json #   索引 meta 过大时的分片(indexParts > 1 时 index.items 为空)
│   └── part-XX.json       #   完整课程(知识点/例句/6 题),详情页按 meta.part 懒加载单片
├── reading/l2/            # 3,250 篇 = A1 816 + A2 1,218 + B1 1,216(16 大场景);part 19 片 + 索引拆 7 片
├── reading/l3/            # 116 篇 B2 深度文(每篇 ≥ 700 词/glossary ⊆ 三 stage 词库);part 3 片 + 索引内联
├── listening/             # 2,040 篇精听素材 = 第一年 1,432 + 第二年 608;part 11 片 + 索引拆 5 片
└── audio-manifest.json    # 预生成音频清单(语音、时间、覆盖范围;生成记录,不参与运行时)

public/audio/              # 预生成 m4a:vocab/{id|-ex}.m4a、reading/{article}/s{n}.m4a、listening/{item}/s{n}.m4a
```

语法/阅读/听力内容量大(全量 JSON 25MB+),构建期按 id 数字序分片,单文件卡 §11 预算(构建目标 450KB、上限 500KB:字节优先、语法/阅读/听力 200 条封顶;索引 meta 过大再拆 index-part-XX):列表页只加载 index.json 轻量索引(带 questionCount 等展示字段),详情页经 `ContentRepository.getGrammarLesson/getReadingArticle/getListeningItem` 只取所在分片;发音跟读的"回原文"按已读文章 id 反查分片(`getReadingArticlesByIds`),不整库加载。词库无列表页 meta,按 stage 拆成 manifest.json({total,parts})+ part-XX.json 顺序整段加载。批量内容由 `scripts/generate-bulk/` 生成(模板 + 槽位库填充、词库例句嵌入、append-only 编号),手写 TSV 与生成 TSV 同一管线构建。

运行时按 stage 懒加载 fetch + 内存缓存(`ContentRepository`),避免 10k 词打包进 JS。所有 JSON 经 zod schema 校验后才进入领域层。静态内容与音频的离线缓存归 Cache API(Service Worker,已启用:导航 network-first 回退缓存壳、`/assets/*` 构建时全量预缓存(`scripts/patch-sw-assets.mjs` 在 `npm run build` 末尾把带哈希的资源清单注入 `build/client/sw.js`,保证未访问过的路由离线也有 chunk)、词库全部分片 + 各模块 index/index-part 安装时预缓存、`/data/*` network-first 静默更新(访问过的分片自动入缓存)、`/audio/*` cache-first 听过即缓存),与 IndexedDB 的领域数据存储分工明确。

**语音两层的策略(`app/lib/speech.ts`):** 单词/例句/跟读句/精听句一律优先播预生成音频包(macOS 神经语音 Reed,`npm run audio:gen` 增量重产,`scripts/generate-audio.mjs` 复刻 pron 句索引规则 `pi*100+si` 保证与训练页同一 URL;听力素材句为 `listening/{itemId}/s{1起句序}.m4a`),音频缺失或加载失败时回退 Web Speech TTS——回退侧精选清晰发音人(优先 Google/Microsoft/Reed 系,正则排除 Fred/Zarvox 等系统搞怪音色),倍速经 `playbackRate`/`utterance.rate` 透传。

内容的单一编辑源是 `scripts/build-content/` 下的 TSV:`vocab/stage{1,2,3}/*.tsv`(每单元一个文件,每词一行)、`grammar/stage{1,2,3}/*.tsv`(每课一个文件,`#` 指令行写课程元信息,其余每行一题)、`reading/{l2,l3}/*.tsv`(每篇一个文件,`# para`/`# glossary` 写正文与词汇表,题目行同语法)与 `listening/{l1,l2}/*.tsv`(每篇一个文件,`# s` 指令写逐句双语,题目行同语法,合并产出 `public/data/listening/` 分片)。`npm run build:content` 生成 `public/data/` 下的 JSON 并做结构校验(列完整、level 枚举、term 查重、id 顺序、每课 6 题、每篇 3–8 题、听力 3–10 句/3–5 题、选项唯一、wordCount 自动统计),`tests/content.test.ts` 对生成 JSON 做 zod 契约卡口。生成物不要手改;`--import` 可把旧 JSON 反向迁出成 TSV。

### 7.2 本地持久化(IndexedDB 唯一本地存储)

**决策(ADR-007):IndexedDB 是阶段 0 唯一本地持久化,localStorage 原则上禁用**;仅当出现必须同步读取的场景(如防主题闪烁)才可经 ADR 评审豁免,当前为零。

**为什么 IndexedDB 优先:**

| 维度 | IndexedDB | localStorage |
| --- | --- | --- |
| 容量 | 通常数百 MB 以上(按站点配额) | ~5MB,复习状态 + 三年日志 + 录音必然超限 |
| 读写粒度 | 按记录/按索引,游标分页 | 整字典 JSON 序列化/反序列化 |
| 主线程 | 异步,不阻塞渲染 | 同步 API,阻塞 |
| 数据类型 | 结构化克隆,可直存 Blob(录音) | 仅字符串 |

**数据库设计(库名 `readtime`,经 `idb` 轻量 Promise 封装):**

| Object Store | keyPath | 索引 | 内容 |
| --- | --- | --- | --- |
| `meta` | `key` | — | `schemaVersion` 等元信息 |
| `settings` | `'singleton'` | — | Settings 单记录 |
| `progress` | `'singleton'` | — | Progress 单记录(测评史/连胜内嵌) |
| `reviewStates` | `wordId` | `by-due`、`by-lapse` | SM-2 复习状态,每词一条 |
| `dailyLogs` | `date` | — | 每日学习日志 |
| `sessions` | `id` | `by-startedAt` | 学习会话(可含录音 Blob) |
| `assessments` | `id` | `by-takenAt` | 测评结果 |
| `outbox` | `id` | `by-createdAt` | 离线同步队列 |

**版本迁移:** 应用启动单例开库,`onupgradeneeded` 内依 `meta.schemaVersion` 执行单向迁移链(`v1 → v2 → ...`),全部在版本升级事务内完成——三年学习记录不因发版丢失;`settings` 页提供各 store 全量导出/导入(JSON + 录音 Blob 打包)。

**工程细节:**
- 到期复习队列经 `by-due` 索引游标读取(`IDBKeyRange.upperBound(今天)`),禁止全表扫描;
- 写入统一走 `lib/storage/` 的事务封装,业务数据与 Outbox 条目**同事务落盘**(原子性);
- 跨标签页:设置变更经 `BroadcastChannel` 广播(不依赖 localStorage 的 storage 事件);
- 单元测试注入 `fake-indexeddb` 内存实现,Repository 契约测试与真实存储解耦;
- 隐私模式下 IndexedDB 可能受限:启动探测失败时降级内存实现并明示"数据不会持久"。

### 7.3 Outbox 离线同步(阶段 2 激活,阶段 0 只写不传)

```
写路径:Repository.save() → IndexedDB 事务写入(业务数据与 Outbox 条目同事务,见 7.2)
同步:`online` 事件 / requestIdleCallback → flush 批量 POST /api/vocab/review 等
      → 成功则移除条目;失败退避重试(attempts++),幂等键 = entry.id
```

学习永远本地优先,云端是副本——天然支持多端合并前的单机体验。

### 7.4 未来数据库 Schema(阶段 1,SQLite + Drizzle)

```ts
// server/db/schema.ts(节选)
users(id pk, display_name, created_at)
review_states(user_id fk, word_id fk, ef, interval_days, reps, lapses, due_date,
              pk(user_id, word_id))
daily_logs(user_id fk, date, new_words, reviews_done, minutes, xp, pk(user_id, date))
assessments(id pk, user_id fk, type, taken_at, cefr, scores_json, weak_points_json)
sessions(id pk, user_id fk, type, started_at, ended_at, items_json, xp)
```

单词库 `words` 表内容与 `public/data/vocab/*.json` 同构,由内容管线生成(单一数据源)。

---

## 八、API 设计(预留)

SPA 模式下没有服务端进程,阶段 0 的预留形式为 **API 契约先行**:所有请求/响应 body 以 zod schema 定义于 `app/lib/api/schemas.ts`,并附 `HttpApiClient` 客户端骨架(`app/lib/api/http.ts`);阶段 1 开启 `ssr: true` 后实装 resource routes。所有 body 以 zod schema 定义(`app/lib/api/schemas.ts`),schema 即契约文档。

| 端点 | 方法 | 请求 → 响应(要点) | 激活 |
| --- | --- | --- | --- |
| `/api/vocab/today` | GET | `?userId` → `{ newWords[], reviews[], goal }` | 阶段1 |
| `/api/vocab/review` | POST | `{ results: [{wordId, grade, reviewedAt}] }[]` → `{ updated }`(批量、幂等) | 阶段1 |
| `/api/grammar/lessons/:id` | GET | → `GrammarLesson`(含题目) | 阶段1 |
| `/api/listening/materials` | GET | `?level&topic` → 分页素材清单 | 阶段1 |
| `/api/reading/articles` | GET | `?level&topic&page` → 分页文章 | 阶段1 |
| `/api/assess/submit` | POST | `{ answers }` → `AssessmentResult`(含 weakPoints 诊断) | 阶段1 |
| `/api/progress` | GET/PUT | 读写 `Progress`(云同步入口,接受 last-write-wins + mergedStreak) | 阶段2 |
| `/api/pron/evaluate` | POST | multipart 音频 + `script` → `PronScore`(音素级) | 阶段3 |
| `/api/auth/*` | POST | session 签发/刷新 | 阶段2 |

---

## 九、迁移路径:纯前端 → 全栈

**数据获取双轨(Remix clientLoader):**

```
阶段0(SPA Mode):
  route.clientLoader → LocalApiClient(读 IndexedDB + fetch 静态 JSON)

阶段1(SSR 开启):
  route.loader      → HttpApiClient/DB 查询(服务端)
  ↑ 替换发生且仅发生在 route 文件内;
  features/hooks/UI、领域层、Repository 实现全部不动。

阶段2(账号 + 云同步):
  root.loader 注入 user(此前恒为 'local-anonymous')
  Repository 绑定从 Local* 切到 Api*(依赖注入点在 app/context/providers.tsx,一处切换)
```

**迁移检查清单(每阶段验收):**
- [ ] `grep -rE "localStorage|indexedDB" app/features app/components app/routes` 为空(存储访问只允许出现在 `lib/storage` 与 `lib/repositories`);
- [ ] `grep -r "fetch(" app/features` 为空(网络访问只在 `lib/api`);
- [ ] 领域层(`lib/srs|scheduler|diagnosis|gamify`)零浏览器/Node API 依赖,Vitest 可直接跑;
- [ ] 切换 Repository 实现仅需改动 providers.tsx 单文件。

---

## 十、目录结构

```
readTime/
├── public/
│   ├── data/                    # 静态学习内容(见 7.1)
│   └── audio/                   # 音频资源
├── app/
│   ├── routes/                  # ① 页面路由 + api.* resource routes(占位)
│   ├── features/                # ② 业务模块:vocab/grammar/pron/listening/reading/assess/gamify
│   │   └── vocab/
│   │       ├── VocabSession.tsx · QuizCard.tsx · SessionSummary.tsx
│   │       ├── sessionReducer.ts        # 会话状态机
│   │       └── useVocabTask.ts          # 领域服务调用 hook
│   ├── components/ui/           # ③ 基础组件:Button/Card/Progress/AudioPlayer/Recorder
│   ├── lib/
│   │   ├── api/                 # ApiClient 接口 + Local/Http 实现 + zod schemas
│   │   ├── repositories/        # ReviewRepo/ProgressRepo/SettingsRepo/ContentRepo/AssessmentRepo
│   │   ├── storage/             # IndexedDB(idb 封装):建库、版本迁移链、事务与索引
│   │   ├── srs/                 # SM-2(纯函数)
│   │   ├── scheduler/           # 每日任务编排
│   │   ├── diagnosis/           # 测评诊断
│   │   ├── gamify/              # XP/连胜/勋章规则
│   │   ├── pron/                # PronEvaluator 适配器
│   │   └── outbox/              # 离线同步队列
│   ├── models/                  # 共享 TS 类型 + 常量(CEFR/勋章配置)
│   ├── context/providers.tsx    # Repository 依赖注入唯一入口
│   ├── root.tsx
│   └── server/                  # ⬆ 阶段1 预留:db/ + services/(服务端业务)
├── scripts/build-content/       # 内容管线:原始词表 → public/data JSON + words 表
├── vite.config.ts               # remix({ spaMode: true }) ← 阶段1 移除
└── ARCHITECTURE.md / PLAN.md / README.md
```

---

## 十一、质量保障

| 层 | 工具 | 必测内容 |
| --- | --- | --- |
| 领域层(纯函数) | Vitest | SM-2 各 grade 分支与边界(EF 下限、遗忘重置)、每日调度配比、连胜跨月/时区、诊断阈值 |
| 组件 | Testing Library | 会话状态机流转、答题交互、ErrorBoundary |
| 数据层 | Vitest + InMemory / fake-indexeddb | Repository 契约一致性、IndexedDB 版本迁移链、Outbox 重试幂等 |
| E2E(关键路径) | Playwright | 完成一个词汇会话 → 连胜+1 → 周报可见 |
| CI | GitHub Actions | `typecheck + lint + test + build` 全绿方可合并 |

**性能预算(CI 卡口):** 首屏路由 JS ≤ 200KB gz;`public/data` 单文件 ≤ 500KB(`tests/content.test.ts` 逐文件卡口,构建目标 450KB——超限时重跑 `npm run build:content` 按字节重新分片);音频一律不随路由预载。

---

## 十二、安全与隐私

- 阶段 0 无账号、无网络上报,**学习数据不出本机**;导出功能明示用户数据范围;
- 阶段 2 起:session 用 HttpOnly Cookie(Remix createCookieSessionStorage),action 一律 zod 校验 + CSRF 由 SameSite 策略覆盖;
- 内容 JSON 在加载时校验(防静态资源被篡改导致的 XSS 注入文本);
- 评测音频仅在用户主动触发的请求中上传,不静默采集。

---

## 十三、架构演进路线(与 PLAN.md 7.5 对齐)

| 阶段 | 时间 | 架构变化 | 验收标志 |
| --- | --- | --- | --- |
| 阶段 0 | 开发第 1–2 月 | SPA Mode;LocalApiClient + IndexedDB + Outbox(仅落盘);词汇/语法模块跑通 | 30 天学习记录不丢;断网可学 |
| 阶段 1 | 第 3–6 月 | 关闭 SPA Mode;`api.*` resource routes 实装;SQLite + Drizzle;内容入 `words` 表 | clientLoader→loader 迁移零组件改动 |
| 阶段 2 | 第 7–10 月 | 用户系统 + `/api/progress` 云同步;Outbox flush 激活;Repository 切 Api* | 双设备进度合并正确 |
| 阶段 3 | 第 11–12 月 | `/api/pron/evaluate` 接 AI(音素级);SRS 服务端调度(可换 FSRS);自适应出题 | 发音分数口径与历史可比 |

---

## 十四、附录:架构决策记录(ADR)

| # | 决策 | 理由 | 放弃的替代方案 |
| --- | --- | --- | --- |
| ADR-001 | Remix SPA Mode(ssr:false)起步 | 纯静态托管即可上线;clientLoader→loader 迁移路径是框架内建能力 | CRA/Vite-SPA(无迁移路径)、Next(迁移成本高) |
| ADR-002 | Repository + ApiClient 双适配器 | 存储/网络实现可整体替换,UI 与领域层不动 | 组件直连 localStorage(不可演进) |
| ADR-003 | 学习内容与代码分离(public/data) | 10k 词不进 bundle;内容管线单一数据源同时产 DB | 内容硬编码 TS 模块 |
| ADR-004 | SM-2 作为 SRS 基线,接口化 | 实现简单、久经验证;接口留 FSRS 升级位 | 直接上 FSRS(复杂度不匹配阶段0) |
| ADR-005 | Web Speech API 临时实现发音评测 | 零后端成本;PronScore 口径统一保证历史可比 | 阶段0 就接商用 AI(违背纯前端约束) |
| ADR-006 | Context + useReducer,不引 Redux | 状态规模可控;少一个依赖 | Redux Toolkit |
| ADR-007 | IndexedDB 为唯一本地存储,localStorage 原则禁用 | 复习状态 + 三年日志 + 录音 Blob 远超 5MB 限额;按键/索引读写、可存 Blob、异步不阻塞 | localStorage(容量小/阻塞/仅字符串)、Dexie(暂无需查询引擎,`idb` 更轻) |
| ADR-008 | zod schema 即 API 契约 | 前后端复用校验,阶段1 实装 API 时零额外文档 | 手写接口文档(易漂移) |
