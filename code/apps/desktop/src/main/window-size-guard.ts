interface Movable {
  getContentSize(): number[];
  setContentSize(width: number, height: number): void;
  isMaximized(): boolean;
  isFullScreen(): boolean;
  /** Scale factor of the monitor the window is on. */
  scaleFactor(): number;
}

/**
 * Dragging a window onto a monitor with another scale factor can change its size on Windows. When a drag ends on a monitor with a different
 * scale factor and the size is not what it was, the size from the start of the drag is put back. A drag that stays on one monitor (a snap to a
 * screen edge, for one) and a maximized or full-screen window are left alone.
 */
export function createSizeGuard(win: Movable) {
  let before: { size: number[]; scale: number } | null = null;
  return {
    willMove() {
      before ??= { size: win.getContentSize(), scale: win.scaleFactor() };
    },
    moved() {
      const was = before;
      before = null;
      if (!was || win.isMaximized() || win.isFullScreen() || win.scaleFactor() === was.scale) return;
      const now = win.getContentSize();
      if (now[0] !== was.size[0] || now[1] !== was.size[1]) win.setContentSize(was.size[0]!, was.size[1]!);
    },
  };
}
