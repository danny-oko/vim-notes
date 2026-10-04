# Vim Notes

A plain-text notes app for macOS that copies the Apple Notes layout, keyboard
shortcuts and behaviour, with Vim keybindings that keep working when you type
in another language.

- **Every note is a file.** `⌘N` immediately creates a `.txt` (or `.md`) file in the
  notes folder you choose on first launch (Settings → Notes folder). The file
  name follows the note's first line and is renamed as the title changes.
- **Folders are directories.** Subfolders, renaming, drag-and-drop between folders.
- **Vim in any keyboard layout.** In normal/visual mode, keys are read by their
  physical position, so `hjkl`, `dd`, `ciw`, `:w`, `/`… work on Cyrillic, Greek,
  Hebrew, Korean and other layouts or with an IME. `f`, `t`, `r` still take the
  literal character you type, and insert mode is untouched.
- **Local only.** No accounts, no cloud sync. Edits made in Finder or another
  editor show up live.

## Run it

```bash
bun install
bun run dev          # development with hot reload
bun run dist         # build "dist/mac-arm64/Vim Notes.app"
bun run test:e2e     # end-to-end test against a throwaway notes folder
```

## Apple Notes shortcuts

| Action | Shortcut |
| --- | --- |
| New note / New folder | `⌘N` / `⇧⌘N` |
| Delete note (list) · delete to line start (editor) | `⌘⌫` |
| Duplicate note | `⌘D` |
| Search all notes / Find in note | `⌥⌘F` / `⌘F`, `⌘G`, `⇧⌘G` |
| Show/hide folders | `⌥⌘S` |
| View as list / gallery | `⌘1` / `⌘2` |
| Checklist / Mark as checked | `⇧⌘L` / `⇧⌘U` |
| Bulleted / Dashed / Numbered list | `⇧⌘7` / `⇧⌘8` / `⇧⌘9` |
| Move list item up / down | `⌃⌘↑` / `⌃⌘↓` |
| Indent / Outdent | `⌘]` / `⌘[` |
| Bigger / Smaller text | `⌘=` / `⌘-`, `⇧⌘.` / `⇧⌘,`, actual size `⇧⌘0` |
| Settings | `⌘,` |
| Toggle Vim mode | `⌃⌘V` |

Notes list and sidebar: `↑↓` or `j`/`k` to move, `Enter`/`Tab`/`l` to open the
note, `h`/`⇧Tab` to go back, `Delete` to delete. In the editor, `:w` saves now,
`:q` returns to the list, `:new` creates a note.

## Layout of the code

```
src/shared/      types and title helpers shared by both processes
src/main/        Electron main: window, Notes-style menu bar, IPC, settings
  library.ts     the notes directory: scan, create, save+rename, trash, folders
src/preload/     typed `window.api` bridge
src/renderer/    React UI (shadcn/ui + Tailwind)
  store/         zustand store: selection, debounced autosave
  components/editor/   CodeMirror 6 + Vim, any-layout key mapping
e2e/smoke.mjs    Playwright end-to-end test
```

Deleted notes go to `<notes folder>/.vimnotes/trash` ("Recently Deleted") and
are purged after 30 days; pins live in `.vimnotes/meta.json`.
