import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gh, ghJson } from "./gh";

const execFileAsync = promisify(execFile);

/** 派发前刷新远端引用，保证 worktree 基于最新代码；失败不阻断（离线时仍可用本地基线）。 */
export async function fetchOrigin(repoPath: string): Promise<void> {
  try {
    await execFileAsync("git", ["-C", repoPath, "fetch", "origin", "--prune"], { maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    console.warn(`[paseo-github-workbench] fetch ${repoPath} 失败（用本地基线继续）:`, error instanceof Error ? error.message : error);
  }
}

export interface GhItem {
  number: number;
  title: string;
  body: string;
  url: string;
  author: { login: string };
  labels: { name: string }[];
  headRefOid?: string;
  isDraft?: boolean;
}

const ITEM_FIELDS = "number,title,body,url,author,labels";

export async function authStatus(): Promise<{ ok: boolean; user: string; message: string }> {
  try {
    const user = await gh(["api", "user", "-q", ".login"]);
    return { ok: true, user: user.trim(), message: "" };
  } catch (error) {
    return { ok: false, user: "", message: error instanceof Error ? error.message : String(error) };
  }
}

export function listPullRequests(repo: string): Promise<GhItem[]> {
  return ghJson<GhItem[]>([
    "pr", "list", "--repo", repo, "--state", "open", "--limit", "50",
    "--json", `${ITEM_FIELDS},headRefOid,isDraft`,
  ]);
}

export function listIssues(repo: string): Promise<GhItem[]> {
  return ghJson<GhItem[]>(["issue", "list", "--repo", repo, "--state", "open", "--limit", "50", "--json", ITEM_FIELDS]);
}

export async function fetchItem(repo: string, kind: "pr" | "issue", number: number): Promise<GhItem> {
  const fields = kind === "pr" ? `${ITEM_FIELDS},headRefOid,isDraft` : ITEM_FIELDS;
  return ghJson<GhItem>([kind, "view", String(number), "--repo", repo, "--json", fields]);
}

export function postComment(repo: string, kind: "pr" | "issue", number: number, body: string): Promise<string> {
  return gh([kind, "comment", String(number), "--repo", repo, "--body", body]);
}

export function fetchHead(repo: string, number: number): Promise<string> {
  return ghJson<{ headRefOid: string }>(["pr", "view", String(number), "--repo", repo, "--json", "headRefOid"]).then((r) => r.headRefOid);
}

/** worktree 实际 HEAD；读不到返回空串。 */
export async function worktreeHead(dir: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["-C", dir, "rev-parse", "HEAD"], { maxBuffer: 1024 * 1024 });
    return stdout.trim();
  } catch {
    return "";
  }
}

/** 合并锁定评审时的 head commit：REST merge 带 sha 参数，head 变化时 GitHub 直接拒绝。 */
export async function mergePullRequest(repo: string, number: number, method: "merge" | "squash" | "rebase", auto = false, expectedSha = ""): Promise<string> {
  if (auto) {
    if (expectedSha) {
      const head = await fetchHead(repo, number);
      if (head !== expectedSha) throw new Error("PR head 已变化，需重新评审后才能开启自动合并");
    }
    return gh(["pr", "merge", String(number), "--repo", repo, `--${method}`, "--auto"]);
  }
  const args = ["api", "-X", "PUT", `repos/${repo}/pulls/${number}/merge`, "-f", `merge_method=${method}`];
  if (expectedSha) args.push("-f", `sha=${expectedSha}`);
  return gh(args);
}

export interface ItemDetail {
  title: string;
  body: string;
  url: string;
  author: string;
  state: string;
  labels: string[];
  comments: { author: string; body: string; createdAt: string }[];
  isDraft: boolean;
  mergeable: string;
  reviewDecision: string;
  checks: { name: string; status: string; conclusion: string }[];
}

interface DetailRow {
  title: string;
  body: string;
  url: string;
  author: { login: string };
  state: string;
  labels: { name: string }[];
  comments: { author: { login: string }; body: string; createdAt: string }[];
  isDraft?: boolean;
  mergeable?: string;
  reviewDecision?: string;
  statusCheckRollup?: { name?: string; context?: string; status?: string; conclusion?: string; state?: string }[];
}

export async function fetchComments(repo: string, kind: "pr" | "issue", number: number): Promise<{ author: string; body: string; createdAt: string }[]> {
  const row = await ghJson<{ comments: { author: { login: string }; body: string; createdAt: string }[] }>([kind, "view", String(number), "--repo", repo, "--json", "comments"]);
  return (row.comments ?? []).map((c) => ({ author: c.author?.login ?? "", body: c.body, createdAt: c.createdAt }));
}

export async function fetchDetail(repo: string, kind: "pr" | "issue", number: number): Promise<ItemDetail> {
  const fields =
    kind === "pr"
      ? "title,body,url,author,state,labels,comments,isDraft,mergeable,reviewDecision,statusCheckRollup"
      : "title,body,url,author,state,labels,comments";
  const row = await ghJson<DetailRow>([kind, "view", String(number), "--repo", repo, "--json", fields]);
  return {
    title: row.title,
    body: row.body ?? "",
    url: row.url,
    author: row.author?.login ?? "",
    state: row.state,
    labels: (row.labels ?? []).map((l) => l.name),
    comments: (row.comments ?? []).map((c) => ({ author: c.author?.login ?? "", body: c.body, createdAt: c.createdAt })),
    isDraft: row.isDraft === true,
    mergeable: row.mergeable ?? "",
    reviewDecision: row.reviewDecision ?? "",
    checks: (row.statusCheckRollup ?? []).map((c) => ({
      name: c.name ?? c.context ?? "check",
      status: c.status ?? c.state ?? "",
      conclusion: c.conclusion ?? "",
    })),
  };
}

export async function listRepos(): Promise<string[]> {
  const rows = await ghJson<{ nameWithOwner: string }[]>(["repo", "list", "--limit", "200", "--json", "nameWithOwner"]);
  return rows.map((r) => r.nameWithOwner);
}

export async function listLabels(repo: string): Promise<string[]> {
  const rows = await ghJson<{ name: string }[]>(["label", "list", "--repo", repo, "--limit", "100", "--json", "name"]);
  return rows.map((r) => r.name);
}

/** 协作作者列表；无权限或失败时返回空（UI 隐藏快捷选择，保留手填）。 */
export async function listCollaborators(repo: string): Promise<string[]> {
  try {
    const rows = await ghJson<{ login: string }[]>(["api", `repos/${repo}/collaborators`]);
    return rows.map((r) => r.login);
  } catch {
    return [];
  }
}

export interface BoardItem {
  repo: string;
  kind: "pr" | "issue";
  number: number;
  title: string;
  url: string;
  author: string;
  updatedAt: string;
  state: string;
  isDraft: boolean;
  labels: string[];
}

interface SearchRow {
  number: number;
  title: string;
  url: string;
  author: { login: string };
  updatedAt: string;
  state: string;
  repository: { nameWithOwner: string };
  isDraft?: boolean;
  labels?: { name: string }[];
}

/** 跨仓库搜索：owned = 名下仓库；all = 名下 + 本人作为作者（含外部仓库），去重合并。 */
export async function searchBoard(user: string, kind: "pr" | "issue", state: "open" | "closed" | "all" = "open", scope: "owned" | "all" = "all"): Promise<BoardItem[]> {
  // isDraft 仅 PR 搜索支持；issue 搜索带上会报 Unknown JSON field
  const fields = kind === "pr"
    ? "number,title,url,author,updatedAt,state,repository,isDraft,labels"
    : "number,title,url,author,updatedAt,state,repository,labels";
  const base = [
    "search", kind === "pr" ? "prs" : "issues",
    "--limit", "100",
    "--json", fields,
    ...(state === "all" ? [] : ["--state", state]),
  ];
  const searches = [ghJson<SearchRow[]>([...base, "--owner", user])];
  if (scope === "all") searches.push(ghJson<SearchRow[]>([...base, "--author", user]));
  const results = await Promise.all(searches);
  const seen = new Set<string>();
  const rows = results.flat().filter((r) => {
    const key = `${r.repository.nameWithOwner}#${r.number}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return rows.map((r) => ({
    repo: r.repository.nameWithOwner,
    kind,
    number: r.number,
    title: r.title,
    url: r.url,
    author: r.author?.login ?? "",
    updatedAt: r.updatedAt,
    state: (r.state ?? "open").toLowerCase(),
    isDraft: r.isDraft === true,
    labels: (r.labels ?? []).map((l) => l.name),
  }));
}

const boardCache = new Map<string, { at: number; items: BoardItem[] }>();
const BOARD_CACHE_TTL_MS = 60_000;

/** 看板与侧边栏徽章共用的搜索缓存，避免 gh 调用翻倍。 */
export async function searchBoardCached(user: string, kind: "pr" | "issue", state: "open" | "closed" | "all" = "open", scope: "owned" | "all" = "all"): Promise<BoardItem[]> {
  const key = `${kind}:${state}:${scope}`;
  const hit = boardCache.get(key);
  if (hit && Date.now() - hit.at < BOARD_CACHE_TTL_MS) return hit.items;
  const items = await searchBoard(user, kind, state, scope);
  boardCache.set(key, { at: Date.now(), items });
  return items;
}

export function cloneRepo(repo: string, dest: string): Promise<string> {
  return gh(["repo", "clone", repo, dest]);
}