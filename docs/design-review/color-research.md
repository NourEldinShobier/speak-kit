# Accent color research for SpeakKit (2026-11-01)

Sources: 30 Mobbin screens of text-to-speech, audiobook and read-later products (web and iOS), plus published brand data.

## What the category uses
| Color family | Seen in (Mobbin or brand data) | Count of ~30 screens |
|---|---|---|
| **Blue** | Speechify (#3056FF, in 9 of 9 App Store frames per Screenspo), Headway, Descript (#0062FF), Instapaper (#428BCA), Runway, Magnific | about 9 |
| Black / monochrome ink | ElevenLabs (off-white + ink pill buttons), ChatGPT, Grok, Speechify.ai brand page, The Atlantic | about 7 |
| Green / teal | OpenAI waveform, PlayAI lime, ElevenReader green sentence band, Spotify, Pocket teal | about 6 |
| Orange / coral / peach | Mistral, Hume and ElevenLabs peach highlight bands, Headway cover art | about 4 |
| Purple / violet | Murf (#735DFF), Hume, Speechify lavender sentence band | about 3 |
| Yellow | Artlist, Edge Read Aloud word highlight | about 2 |

## Patterns
- Primary controls (play, primary button, progress) are **blue** or **ink**; orange is rare and mostly a highlight, not a brand color.
- The read-along highlight is a *separate* color from the brand accent: peach (Hume, ElevenLabs), light green (ElevenReader), lavender (Speechify), yellow on blue (Edge).
- Dark UI uses a lightened accent, not the light-mode value.
- Waveforms use the accent or a calm green.

## Decision
SpeakKit accent: **blue #2457F5** (light), **#7C9CFF** (dark), tint #E4EBFF / #1B2547. The reading highlight stays warm yellow (sentence #FFF1C2, word #FFD24D) so it never competes with the blue controls and matches Edge Read Aloud. Info badges use teal (#0E7490) so blue stays reserved for actions. The owner rejected the earlier orange.
