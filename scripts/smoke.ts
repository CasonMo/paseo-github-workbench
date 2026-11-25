import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.XDG_STATE_HOME = mkdtempSync(join(tmpdir(), "gwb-test-"));

import { parseAgentJson, pollRepo, detectLang } from "../server/engine";
import { listPullRequests, authStatus, searchBoard } from "../server/github";
import { readState, updateState } from "../server/store";
import { repoSchema } from "../shared/contracts";

async function main() {
  // 1. JSON 解析
  const cases: [string, boolean][] = [
    ['{"verdict":"approve","summary":"ok"}', true],
    ['前置文字\n```json\n{"verdict":"changes_requested","summary":"x","comments":[]}\n```\n后置', true],
    ['杂文字 {"verdict":"approve"} 尾巴', true],
    ["没有 json", false],
  ];
  for (const [text, expect] of cases) {
    const got = parseAgentJson(text) !== null;
    if (got !== expect) throw new Error(`parseAgentJson 失败: ${text}`);
  }
  console.log("✓ parseAgentJson");

  // 1.5 语言检测
  const langCases: [string, "zh" | "en"][] = [
    ["修复成本估算的缓存读取费率", "zh"],
    ["Fix cache read rates in cost estimation", "en"],
    ["feat: 新增 archive 保留策略", "zh"],
    ["", "en"],
  ];
  for (const [text, expect] of langCases) {
    if (detectLang(text) !== expect) throw new Error(`detectLang 失败: ${text}`);
  }
  console.log("✓ detectLang");

  // 2. 状态读写 roundtrip
  const testRepo = repoSchema.parse({ repo: "getpaseo/paseo", prReview: { enabled: true } });
  await updateState((s) => {
    s.repos.push(testRepo);
  });
  const state = await readState();
  const pushed = state.repos.find((r) => r.repo === "getpaseo/paseo");
  if (!pushed || pushed.prReview.prompt.length === 0) throw new Error("默认 prompt 未填充");
  if (pushed.prReview.mergeMethod !== "squash") throw new Error("默认 mergeMethod 错误");
  console.log("✓ store roundtrip + 默认值");

  // 3. gh 认证 + 真实读取公开仓库 PR
  const auth = await authStatus();
  if (!auth.ok) throw new Error(`gh 认证失败: ${auth.message}`);
  const prs = await listPullRequests("getpaseo/paseo");
  console.log(`✓ gh 读取 getpaseo/paseo open PRs: ${prs.length} 个`);

  // 3.5 跨仓库看板
  const board = await searchBoard(auth.user, "pr");
  console.log(`✓ 看板 searchBoard(${auth.user}, pr): ${board.length} 个`);

  // 4. 轮询：首次基线不派发，二次无新增
  const fakePaseo = {
    workspaces: { create: async () => { throw new Error("基线轮询不应派发"); } },
  } as never;
  const repoConfig = (await readState()).repos.find((r) => r.repo === "getpaseo/paseo")!;
  const n1 = await pollRepo(fakePaseo, repoConfig);
  const s1 = await readState();
  if (!s1.seen["getpaseo/paseo:baseline"]) throw new Error("基线未建立");
  if (n1 !== 0 || s1.runs.length !== 0) throw new Error("首次轮询不应产生 run");
  const n2 = await pollRepo(fakePaseo, repoConfig);
  const s2 = await readState();
  if (n2 !== 0 || s2.runs.length !== 0) throw new Error("无新增时不应产生 run");
  console.log(`✓ 轮询基线与去重（seen ${Object.keys(s2.seen).length} 条）`);

  console.log("全部冒烟通过");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});