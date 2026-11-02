/**
 * Highlight: the page highlight (CSS Custom Highlight API), word timing for the spoken word, and the scroll and dark-page helpers.
 * Never changes the page DOM. Does not decide what is read or when (the content controller does), and holds no playback state.
 * Area: extension content script; the options page uses HighlightSection.
 */
export { Highlighter, WordClock, isDarkPage, isInView, keepInView, palette, planWords, type WordSpan } from "./highlight";
export { HighlightSection } from "./HighlightSection";
