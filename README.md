# Tile World

English | [繁體中文](README.ZH_TW.md)

A relaxing hex tile-placement card game. Pick tiles from your hand and build your own world piece by piece, until you run out of cards.
Made for playing one-handed on your phone during a commute. You can stop anytime, every move is saved automatically, and it works offline.

## Features

- Four themes: Floating Isles, Taiwan Streets, Deep Sea, and Outer Space, each with its own scenery and music
- 3D low-poly map with little touches of life: clouds, birds, boats, fish, UFOs and more
- When matching terrains connect, the joined regions shimmer softly
- Playing-card style tile cards with dealing and flipping animations
- Available in Traditional Chinese, Japanese and English
- Installable as a PWA and playable offline

## How to Play

1. Tap a card in your hand. The spots where it can go light up.
2. Tap an empty spot to preview. Tap the preview tile or ↻ to rotate it.
3. Press ✓ to place it. Each edge that matches its neighbor's terrain scores a point, with a bonus when all six edges match.
4. The game ends when both your deck and your hand are empty.

Controls: drag with one finger to move, pinch to zoom. On desktop, right-drag or press Q / E to rotate the view.

## Tech

TypeScript, Vite, three.js, Web Audio (music and sound effects synthesized in real time), and a Service Worker.

## License

[GNU Affero General Public License v3.0](LICENSE)
