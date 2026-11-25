import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { stateSchema, type WorkbenchState } from "../shared/contracts";

function statePath(): string {
  const base = process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state");
  return join(base, "paseo-github-workbench", "state.json");
}

const MAX_RUNS = 200;

let cache: WorkbenchState | null = null;
let writing: Promise<void> = Promise.resolve();

export async function readState(): Promise<WorkbenchState> {
  if (cache) return cache;
  try {
    const raw = await readFile(statePath(), "utf8");
    cache = stateSchema.parse(JSON.parse(raw));
  } catch {
    cache = stateSchema.parse({});
  }
  return cache;
}

/** 串行化写盘：临时文件 + rename，避免并发写坏状态。 */
export async function updateState(mutate: (state: WorkbenchState) => void): Promise<WorkbenchState> {
  const state = await readState();
  mutate(state);
  if (state.runs.length > MAX_RUNS) {
    state.runs = state.runs.slice(state.runs.length - MAX_RUNS);
  }
  const snapshot = JSON.stringify(state, null, 2);
  writing = writing.then(async () => {
    const path = statePath();
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(`${path}.tmp`, snapshot, "utf8");
    await rename(`${path}.tmp`, path);
  });
  await writing;
  return state;
}