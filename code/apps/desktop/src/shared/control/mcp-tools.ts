export interface McpTool {
  /** The name an AI app calls. Stable: it is stored in the settings file. */
  name: string;
  title: string;
  description: string;
  group: "Reading" | "Your data";
  /** Reads what the person said or recorded. Off until they turn it on. */
  private: boolean;
}

/** The tools the MCP server offers. The Automation page lists these with a switch each, and the server offers only the ones that are on. */
export const MCP_TOOLS: readonly McpTool[] = [
  { name: "read_aloud", title: "Read aloud", description: "Read text aloud, now or after what is playing.", group: "Reading", private: false },
  { name: "stop_reading", title: "Stop reading", description: "Stop the reading and clear the waiting list, or keep it.", group: "Reading", private: false },
  { name: "reading_queue", title: "Reading queue", description: "See what is playing and what waits.", group: "Reading", private: false },
  { name: "history_search", title: "Search dictation history", description: "Search what was dictated. Read only.", group: "Your data", private: true },
  { name: "meetings_list", title: "List meetings", description: "List recorded meetings. Read only.", group: "Your data", private: true },
  { name: "meetings_search", title: "Search meetings", description: "Search meeting titles, summaries and transcripts. Read only.", group: "Your data", private: true },
  { name: "meetings_show", title: "Read a meeting", description: "Read one meeting, or a time range or chapter of it. Read only.", group: "Your data", private: true },
  { name: "capture_list", title: "List captures", description: "List saved captures. Read only.", group: "Your data", private: true },
  { name: "capture_show", title: "Read a capture", description: "Read what was said in one capture. Read only.", group: "Your data", private: true },
];

/** Whether a tool is on: the person's choice when they made one, else on for reading text aloud and off for anything that reads their own words. */
export function toolOn(flags: Readonly<Record<string, boolean>>, name: string): boolean {
  const tool = MCP_TOOLS.find((t) => t.name === name);
  if (!tool) return false;
  return flags[name] ?? !tool.private;
}
