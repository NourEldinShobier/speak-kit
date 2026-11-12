import { skillState } from "../../shared/control/skill";
import type { AgentSkillState } from "../../shared/control/info";

/** The file system the skill file lives on, so the rules above it run in a test. A read rejects for anything but a missing file. */
export interface SkillFs {
  read(file: string): Promise<string | undefined>;
  write(file: string, text: string): Promise<void>;
}

export interface AgentSkill {
  status(): Promise<AgentSkillState>;
  /** Writes the skill this app version ships over whatever is there, so Install and Update are the same call. */
  install(): Promise<AgentSkillState>;
}

/** The skill that teaches an AI agent the command line: where its file is, whether it is there, and whether it matches this version. */
export function agentSkill(o: { file: string; text(): string; fs: SkillFs }): AgentSkill {
  const status = async (): Promise<AgentSkillState> => {
    try {
      return { state: skillState(await o.fs.read(o.file), o.text()), where: o.file };
    } catch {
      return { state: "unreadable", where: o.file };
    }
  };
  return {
    status,
    async install() {
      await o.fs.write(o.file, o.text());
      return status();
    },
  };
}
