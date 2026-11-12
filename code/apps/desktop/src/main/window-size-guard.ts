type Size = number[];

interface Movable {
  getContentSize(): number[];
  setContentSize(width: number, height: number): void;
  isMaximized(): boolean;
  isFullScreen(): boolean;
}

/**
 * Dragging a window onto a monitor with another scale factor can change its size on Windows. The size at the start of a drag is
 * put back when the drag ends, so a move never resizes. A maximized or full-screen window is left alone.
 */
export function createSizeGuard(win: Movable) {
  let before: Size | null = null;
  return {
    willMove() {
      before ??= win.getContentSize();
    },
    moved() {
      const was = before;
      before = null;
      if (!was || win.isMaximized() || win.isFullScreen()) return;
      const now = win.getContentSize();
      if (now[0] !== was[0] || now[1] !== was[1]) win.setContentSize(was[0]!, was[1]!);
    },
  };
}
