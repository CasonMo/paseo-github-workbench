import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

function describeFailure(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
    return "GitHub CLI (gh) 未安装或不在 daemon 的 PATH 中。";
  }
  const stderr =
    typeof error === "object" && error !== null && "stderr" in error
      ? String((error as { stderr: unknown }).stderr ?? "").trim()
      : "";
  if (stderr.includes("gh auth login") || stderr.toLowerCase().includes("authentication")) {
    return "GitHub CLI 未认证，请在 daemon 机器上运行 `gh auth login`。";
  }
  if (stderr !== "") return stderr;
  return error instanceof Error ? error.message : String(error);
}

export async function gh(args: readonly string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("gh", [...args], { maxBuffer: MAX_OUTPUT_BYTES });
    return stdout;
  } catch (error) {
    throw new Error(describeFailure(error));
  }
}

export async function ghJson<T>(args: readonly string[]): Promise<T> {
  return JSON.parse(await gh(args)) as T;
}