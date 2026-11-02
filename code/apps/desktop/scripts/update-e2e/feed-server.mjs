// Static server for the update feed (latest.yml + installer): what electron-updater's generic provider reads. Supports Range requests
// (a download can resume) and records every request path so a test can prove which files the app fetched.
import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";

export async function serveFeed(dir) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const name = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
    const file = path.join(dir, path.basename(name));
    requests.push(`${req.method} /${name}`);
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end("not found");
      return;
    }
    const size = statSync(file).size;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    const start = range?.[1] ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    const headers = { "Content-Type": "application/octet-stream", "Accept-Ranges": "bytes" };
    if (range) res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
    else res.writeHead(200, { ...headers, "Content-Length": size });
    if (req.method === "HEAD") return void res.end();
    createReadStream(file, { start, end }).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}/`, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}
