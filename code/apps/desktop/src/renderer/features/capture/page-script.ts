/** The script tag a development page includes to report to this app's local server (the route and the attribute are the ones the served script reads). */
export function pageScriptTag(port: number, token: string): string | undefined {
  return port > 0 && token ? `<script src="http://127.0.0.1:${port}/v1/capture/page-context/sdk.js" data-token="${token}"></script>` : undefined;
}
