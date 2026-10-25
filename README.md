# vimo — Vim Notes

[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

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

Needs macOS and [Bun](https://bun.sh).

```bash
bun install          # also installs the git hooks (husky)
bun run dev          # development with hot reload
bun run dist         # build "dist/mac-arm64/vimo.app"
bun run dist:dmg     # build a .dmg installer
bun run typecheck    # TypeScript, main + renderer
bun run lint         # ESLint (lint:fix to auto-fix)
bun run test         # unit tests
bun run test:e2e     # end-to-end test against a throwaway notes folder
```

## Apple Notes shortcuts

| Action                                                                         | Shortcut                                        |
| ------------------------------------------------------------------------------ | ----------------------------------------------- |
| New note / New folder                                                          | `⌘N` / `⇧⌘N`                                    |
| Delete note (list) · delete to line start (editor)                             | `⌘⌫`                                            |
| Duplicate note                                                                 | `⌘D`                                            |
| Search all notes / Find in note                                                | `⌥⌘F` / `⌘F`, `⌘G`, `⇧⌘G`                       |
| Show/hide folders                                                              | `⌃⌘S` (or `⌥⌘S`)                                |
| Show/hide folders + notes list (VS Code side bar)                              | `⌘B`                                            |
| Cycle focus: editor → notes list → folders                                     | `⇧⌘E`                                           |
| Save now and tidy the note                                                     | `⌘S`                                            |
| Undo / redo a note delete, move, pin or folder rename (in the list or folders) | `⌘Z` / `⇧⌘Z`                                    |
| View as list / gallery                                                         | `⌘1` / `⌘2`                                     |
| Title / Heading / Subheading / Body                                            | `⇧⌘T` / `⇧⌘H` / `⇧⌘J` / `⇧⌘B`                   |
| Bold / Italic / Underline / Strikethrough                                      | `⌘B` (with text selected) / `⌘I` / `⌘U` / `⇧⌘X` |
| Monostyled / Block quote / Divider line                                        | `⇧⌘M` / `⌘'` / `⌘L`                             |
| Checklist / Mark as checked                                                    | `⇧⌘L` / `⇧⌘U`                                   |
| Bulleted / Dashed / Numbered list                                              | `⇧⌘7` / `⇧⌘8` / `⇧⌘9`                           |
| Move list item up / down                                                       | `⌃⌘↑` / `⌃⌘↓`                                   |
| Indent / Outdent                                                               | `⌘]` / `⌘[`                                     |
| Bigger / Smaller text                                                          | `⌘=` / `⌘-`, `⇧⌘.` / `⇧⌘,`, actual size `⇧⌘0`   |
| Keyboard Shortcuts                                                             | `⌥⌘,`                                           |
| Settings                                                                       | `⌘,`                                            |
| Toggle Vim mode                                                                | `⌃⌘V`                                           |

### Your own shortcuts (keybindings.json)

Every shortcut above can be changed in **Vim Notes ▸ Keyboard Shortcuts…** (`⌥⌘,`):
click a shortcut and press the new keys, `+` adds another, `↺` resets. It's a
front end for `~/Library/Application Support/Vim Notes/keybindings.json`
(**Open Keyboard Shortcuts (JSON)**), which uses VS Code's format and applies
as soon as you save it:

```jsonc
[
  // Bulleted list on ⇧⌘6 instead of ⇧⌘7
  { "key": "cmd+shift+6", "command": "bulleted-list" },
  { "key": "cmd+shift+7", "command": "-bulleted-list" },
  // Only in the note, and not while typing in Vim's insert mode
  {
    "key": "ctrl+cmd+h",
    "command": "highlight",
    "when": "editorFocus && vimMode != 'insert'",
  },
  // Chords work too
  { "key": "cmd+k cmd+s", "command": "keyboard-shortcuts" },
]
```

- Entries are added after the defaults and the last match wins; `"-command"`
  removes a default (with `"key"`, only that key).
- Modifiers: `cmd`, `ctrl`, `alt`/`option`, `shift`. Keys go by their position on
  a US keyboard, so shortcuts also work in the Mongolian, Russian or any other layout.
- `when` takes `!`, `&&`, `||`, `==`, `!=` and these context keys: `editorFocus`,
  `editorTextFocus`, `editorHasSelection`, `inputFocus`, `listFocus`,
  `sidebarFocus`, `noteOpen`, `vimEnabled`, `vimMode`, `dialogOpen`.
- The file lists every default and command id at the bottom. Mistakes are shown in
  Keyboard Shortcuts; a file that isn't valid JSON leaves the defaults in place.

### Vim everywhere

**Notes list and folders** (keys work by physical position, so any keyboard layout works):

| Keys                              | Action                                      |
| --------------------------------- | ------------------------------------------- |
| `j` / `k`, `↓` / `↑`, `⌃n` / `⌃p` | next / previous (counts work: `5j`)         |
| `gg` / `G`                        | first / last                                |
| `⌃d` / `⌃u`                       | half a page down / up                       |
| `l`, `o`, `Enter`, `Tab`          | open the note (or go from folders to notes) |
| `h`, `⇧Tab`                       | go to the folders                           |
| `/`                               | search                                      |
| `a`                               | new note (in folders: new folder)           |
| `dd`, `Delete`                    | delete note (in folders: delete folder)     |
| `r`                               | rename folder                               |

**Editor:** full Vim via CodeMirror. Undo works like VSCodeVim: `u` / `⌃r` undo and
redo a whole Vim change (e.g. everything typed between `i` and `Esc`), while
`⌘Z` / `⇧⌘Z` step through smaller typing chunks. `:w` saves now, `:q` returns to
the list, `:new` creates a note.

**Styles:** Format ▸ Title, Heading, Subheading, Body and Font ▸ Bold, Italic,
Underline, Strikethrough, Highlight are saved as plain Markdown — `# Title`,
`## Heading`, `### Subheading`, `**bold**`, `*italic*`, `<u>underline</u>`,
`~~strikethrough~~`, `==highlight==`, `` `monostyled` ``, `> quote` — so files
stay readable in any editor. The note shows the styled text and hides the
markup, except on the line you're editing. In Vim, format commands act on the
visual selection, or on the word under the cursor. `⌘B` bolds when text is
selected and otherwise hides the side bar. Notes use Montserrat.

**Lists:** pressing Enter on a `- [ ]`, `•`, `-` or `1.` line continues the list
(numbers count up), and on a `> ` line continues the quote; Enter on an empty item ends it.

**Tidy saving:** notes are written without spaces at line ends or blank lines at
the start/end. The text on screen is tidied on `⌘S` / `:w` and when you leave
the note, never while you type.

Sidebar and notes-list widths are remembered when hidden and across restarts.
The app follows the macOS light/dark appearance, including live changes.

## Layout of the code

```
src/shared/      types and title helpers shared by both processes
src/main/        Electron main: window, Notes-style menu bar, IPC, settings
  library.ts     the notes directory: scan, create, save+rename, trash, folders
  keybindings.ts keybindings.json: load, watch, save (format in src/shared/keybindings.ts)
src/preload/     typed `window.api` bridge
src/renderer/    React UI (shadcn/ui + Tailwind)
  store/         zustand store: selection, debounced autosave
  lib/keybindings.ts   dispatches shortcuts by focus and `when` clauses
  components/editor/   CodeMirror 6 + Vim, any-layout key mapping
tests/           unit tests (bun test)
e2e/smoke.mjs    Playwright end-to-end test
```

Deleted notes go to `<notes folder>/.vimnotes/trash` ("Recently Deleted") and
are purged after 30 days; pins live in `.vimnotes/meta.json`.

## Contributing

1. Branch off `main`, make your change, and add or update tests in `tests/`.
2. Commit with `bun run commit`. It runs [Commitizen](https://commitizen.github.io/cz-cli/),
   which asks for the type, scope and description and writes a
   [Conventional Commits](https://www.conventionalcommits.org/) message such as
   `feat(editor): divider line on ⌘L` or `fix(vim): keep normal mode after search`.
3. Open a pull request against `main`.

The git hooks are set up by [husky](https://typicode.github.io/husky/) on `bun install`:

- **pre-commit** runs `bun run lint`, `bun run typecheck` and `bun run test`.
- **commit-msg** checks the message with [commitlint](https://commitlint.js.org/)
  (`@commitlint/config-conventional`), so a plain `git commit -m "..."` also
  needs a Conventional Commits message.

Common types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `chore`.
Use `git commit --no-verify` only when you really need to skip the hooks.

ESLint uses `typescript-eslint` and the React Hooks rules (`eslint.config.mjs`).
`tsc` is TypeScript 7, which has no JavaScript API yet, so the config points the
ESLint parser at the side-by-side `@typescript/typescript6` package.
