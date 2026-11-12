import type { ComponentType } from "react";

export type ExperimentBadge = "New" | "Experimental" | "Developer";

export interface ExperimentState {
  /** False until the first read of the state has come back. */
  ready: boolean;
  on: boolean;
  set(on: boolean): Promise<void>;
}

/** One card on the Experiments page. A feature registers its cards here; the page lists them by group. */
export interface ExperimentCard {
  id: string;
  group: string;
  /** One line under the group name. */
  groupLead?: string;
  /** Shown once above the group: what is not proven yet. */
  groupNote?: string;
  title: string;
  description: string;
  badges: readonly ExperimentBadge[];
  /** What to know before turning it on (a warning line on the card). */
  guard?: string;
  /** When set, turning the card on first asks with this dialog. */
  confirm?: { title: string; body: string; confirmLabel: string };
  /** Shown inside the card while it is on (the script a feature asks people to add, for one). */
  Extra?: ComponentType;
  /** A hook: the card's current state. Called once per render of the card, in the same order. */
  useState(): ExperimentState;
}

const cards = new Map<string, ExperimentCard>();

/** Adds a card; a card with the same id replaces the earlier one, so registering twice (hot reload) is harmless. */
export function registerExperiment(card: ExperimentCard): void {
  cards.set(card.id, card);
}

export const experimentCards = (): ExperimentCard[] => [...cards.values()];

/** The cards by group, in the order the groups were first registered. */
export function groupedCards(list: readonly ExperimentCard[]): { group: string; lead?: string | undefined; note?: string | undefined; cards: ExperimentCard[] }[] {
  const groups: { group: string; lead?: string | undefined; note?: string | undefined; cards: ExperimentCard[] }[] = [];
  for (const c of list) {
    let g = groups.find((x) => x.group === c.group);
    if (!g) groups.push((g = { group: c.group, lead: c.groupLead, note: c.groupNote, cards: [] }));
    g.lead ??= c.groupLead;
    g.note ??= c.groupNote;
    g.cards.push(c);
  }
  return groups;
}
