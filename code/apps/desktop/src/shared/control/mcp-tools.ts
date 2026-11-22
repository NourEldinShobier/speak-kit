export interface McpTool {
  name: string;
  description: string;
}

/** The tools the MCP server offers. All of them only read text aloud; nothing that reads the person's own words is offered. */
export const MCP_TOOLS: readonly McpTool[] = [
  { name: "read_aloud", description: "Read text aloud, now or after what is playing." },
  { name: "stop_reading", description: "Stop the reading and clear the waiting list, or keep it." },
  { name: "reading_queue", description: "See what is playing and what waits." },
];
