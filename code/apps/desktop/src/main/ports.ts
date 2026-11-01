interface Listenable {
  listen(): Promise<unknown> | unknown;
}

/** Try `start`, `start + 1`, ... until one binds. Only EADDRINUSE moves on; other errors are real. */
export async function listenWithFallback<T extends Listenable>(start: number, make: (port: number) => T, tries = 20): Promise<{ server: T; port: number }> {
  for (let i = 0; i < tries && start + i <= 65535; i++) {
    const port = start + i;
    const server = make(port);
    try {
      await server.listen();
      return { server, port };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE") throw e;
    }
  }
  throw new Error(`No free port from ${start} to ${start + tries - 1}`);
}
