import { parsePageContext } from "../config";
import { noContent, readBody, validated } from "../http";
import type { Route } from "../router";

/** The browser extension tells the app which page is in front, so dictation can pick the mode of that website. */
export const pageContextRoutes: Route[] = [
  {
    method: "POST",
    path: "/v1/page-context",
    handle: async ({ req, res }, { pageContext }) => {
      const raw = await readBody(req);
      const { host } = validated(() => parsePageContext(raw));
      pageContext?.report(host);
      noContent(res);
    },
  },
];
