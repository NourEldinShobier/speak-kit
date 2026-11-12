import { net } from "electron";

/** The fetch model downloads use. The browser engine's follows the system proxy (manual and PAC scripts) and trusts the system certificate store, so a network that inspects secure traffic works once its certificate is installed; the plain Node fetch would ignore both. Tests use the plain one against local servers. */
export const modelFetch = (testRun: boolean): typeof fetch | undefined => (testRun ? undefined : (net.fetch as typeof fetch));
