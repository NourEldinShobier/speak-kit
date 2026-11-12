import { createTrayNotices, NOTICE_TTL_MS, noticeText } from "../shared/tray-notices";

/**
 * The tray notice for a problem that happened while the window was closed: kept until the window opens or ten minutes pass, and the tray
 * menu is rebuilt when it appears and when it expires.
 */
export function createNoticeCenter(refresh: () => void, windowVisible: () => boolean) {
  const notices = createTrayNotices();
  let timer: NodeJS.Timeout | undefined;
  return {
    report(kind: string, title: string): void {
      const note = noticeText({ kind, title });
      if (!note || windowVisible()) return;
      notices.add(note);
      refresh();
      clearTimeout(timer);
      timer = setTimeout(refresh, NOTICE_TTL_MS + 1000);
      timer.unref();
    },
    clear(): void {
      notices.clear();
      refresh();
    },
    current: () => notices.current(),
  };
}
