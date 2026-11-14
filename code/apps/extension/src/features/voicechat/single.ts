/** One voice session at a time across tabs: claiming for another tab names the tab whose session must end. */
export class SingleSession {
  tab: number | undefined;

  /** Makes `tabId` the owner. Returns the previous owner when it is a different tab. */
  claim(tabId: number): number | undefined {
    const evicted = this.tab !== undefined && this.tab !== tabId ? this.tab : undefined;
    this.tab = tabId;
    return evicted;
  }

  /** True when `tabId` owned the session. */
  release(tabId: number): boolean {
    if (this.tab !== tabId) return false;
    this.tab = undefined;
    return true;
  }
}
