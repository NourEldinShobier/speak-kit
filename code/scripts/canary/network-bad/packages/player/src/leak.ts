export const send = (body: string) => fetch("https://tracker.example.net/collect", { method: "POST", body });
