// End-to-end smoke test: launches the built app against a throwaway notes
// folder and profile, exercises the main flows, and saves screenshots.
//   bun run build && node e2e/smoke.mjs [outputDir]
//   APP_PATH="dist/mac-arm64/Vim Notes.app/Contents/MacOS/Vim Notes" node e2e/smoke.mjs
import { _electron as electron } from 'playwright'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'vim-notes-shots-'))
const sandbox = mkdtempSync(join(tmpdir(), 'vim-notes-e2e-'))
const notesDir = join(sandbox, 'Notes')
const userData = join(sandbox, 'profile')
mkdirSync(join(notesDir, 'Work', 'Meetings'), { recursive: true })
mkdirSync(join(notesDir, 'Ideas'), { recursive: true })
mkdirSync(userData, { recursive: true })

const day = 24 * 60 * 60 * 1000
const seed = [
  ['Groceries.txt', 'Groceries\n- [x] Milk\n- [ ] Eggs\n- [ ] Coffee beans', 0],
  ['Сайн байна уу.txt', 'Сайн байна уу\nМонгол хэл дээрх тэмдэглэл. Vim товчлуурууд кирилл гарын байрлалд ч ажиллана.', 1],
  ['Reading list.txt', 'Reading list\nThe Pragmatic Programmer\nPractical Vim', 3],
  ['Old trip.txt', 'Old trip\nPacking list from the summer.', 45],
  ['Work/Roadmap.txt', 'Roadmap\nQ4 goals and milestones', 0],
  ['Work/Meetings/Standup.txt', 'Standup\nNotes from the daily standup', 2],
  ['Ideas/App idea.txt', 'App idea\nA notes app with vim keys', 10]
]
for (const [file, content, age] of seed) {
  const path = join(notesDir, file)
  writeFileSync(path, content)
  const t = new Date(Date.now() - age * day)
  utimesSync(path, t, t)
}
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ notesDir }))

// APP_PATH=… runs against a packaged build instead of `out/`.
// The window stays hidden so it can't grab keystrokes meant for other apps.
const env = { ...process.env, VIM_NOTES_HIDDEN_WINDOW: '1' }
const app = await electron.launch(
  process.env.APP_PATH
    ? { executablePath: process.env.APP_PATH, args: [`--user-data-dir=${userData}`], colorScheme: null, env }
    : // colorScheme: null — use the real OS appearance instead of Playwright's forced light mode.
      { args: ['.', `--user-data-dir=${userData}`], colorScheme: null, env }
)
const page = await app.firstWindow()
await page.setViewportSize({ width: 1180, height: 760 }).catch(() => {})
await page.waitForSelector('[role="listbox"] [role="option"]')
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) })
const menu = (command) => app.evaluate(({ BrowserWindow }, c) => BrowserWindow.getAllWindows()[0].webContents.send('menu', c), command)
const files = (dir = notesDir) => readdirSync(dir).filter((f) => !f.startsWith('.')).sort()
const editorText = () => page.locator('.cm-content').innerText()
/** Simulates a key typed on a non-Latin keyboard layout (physical `code`, foreign `key`). */
const foreignKey = (key, code, shiftKey = false) =>
  page.evaluate(
    ([key, code, shiftKey]) =>
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key, code, shiftKey, bubbles: true, cancelable: true })),
    [key, code, shiftKey]
  )

try {
  await page.waitForTimeout(400)
  await shot('01-main')

  // ── New note creates a new file named after its first line ────────────
  await menu('new-note')
  await page.waitForTimeout(300)
  assert.ok(files().includes('New Note.txt'), 'new note file is created immediately')
  await page.keyboard.type('Shopping in Ulaanbaatar\nБууз, хуушуур')
  await page.waitForTimeout(900)
  assert.ok(files().includes('Shopping in Ulaanbaatar.txt'), `file renamed after title: ${files()}`)
  assert.equal(readFileSync(join(notesDir, 'Shopping in Ulaanbaatar.txt'), 'utf8'), 'Shopping in Ulaanbaatar\nБууз, хуушуур')
  await shot('02-new-note-insert')

  // ── Vim normal mode with a Cyrillic layout ─────────────────────────────
  await page.keyboard.press('Escape')
  await page.keyboard.type('gg') // go to first line (Latin)
  await foreignKey('в', 'KeyD')
  await foreignKey('в', 'KeyD') // dd on a Mongolian/Russian layout
  await page.waitForTimeout(100)
  const afterDd = await editorText()
  assert.ok(!afterDd.includes('Shopping'), `dd deleted the first line: ${JSON.stringify(afterDd)}`)
  await foreignKey('Ж', 'Semicolon', true) // ':' typed as Shift+Ж
  await page.waitForSelector('.cm-vim-panel input')
  await foreignKey('ц', 'KeyW') // w
  const ex = await page.locator('.cm-vim-panel input').inputValue()
  assert.equal(ex, 'w', 'ex command line receives Latin command letters')
  await shot('03-vim-ex-command')
  await page.keyboard.press('Enter')

  // f<char> must search for the literal (Cyrillic) character.
  await page.keyboard.type('0')
  await page.evaluate(() =>
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', code: 'KeyF', bubbles: true, cancelable: true }))
  )
  await foreignKey('х', 'BracketLeft')
  await page.keyboard.type('x')
  await page.waitForTimeout(100)
  assert.ok((await editorText()).startsWith('Бууз, уушуур'), `fх found the Cyrillic char: ${await editorText()}`)
  await page.keyboard.type('u')

  // ── Insert mode accepts any language ───────────────────────────────────
  await page.keyboard.type('A')
  await page.keyboard.insertText(' 日本語 עברית Ελληνικά')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(800)
  const saved = readdirSync(notesDir).find((f) => f.startsWith('Бууз'))
  assert.ok(saved, `renamed to new first line: ${files()}`)
  assert.ok(readFileSync(join(notesDir, saved), 'utf8').includes('日本語 עברית Ελληνικά'))

  // ── Search ─────────────────────────────────────────────────────────────
  await menu('search')
  await page.keyboard.type('vim')
  await page.waitForTimeout(200)
  await shot('04-search')
  assert.equal(await page.locator('#notes-search').inputValue(), 'vim', 'search field keeps focus while typing')
  const results = await page.locator('[role="listbox"] [role="option"]').count()
  assert.equal(results, 3, 'search finds notes across folders')
  assert.ok(files().includes('Сайн байна уу.txt'), 'typing in search never edits a note')
  await page.keyboard.press('Escape')

  // ── Folders, pin, gallery, delete → Recently Deleted ───────────────────
  await page.getByRole('treeitem', { name: /Work/ }).first().click()
  await page.waitForTimeout(200)
  await shot('05-folder')
  await page.getByRole('treeitem', { name: /^Notes/ }).click()
  await page.locator('[role="option"]', { hasText: 'Groceries' }).click()
  await menu('pin-note')
  await page.waitForTimeout(300)
  assert.ok((await page.locator('h3', { hasText: 'Pinned' }).count()) === 1, 'pinned section appears')
  await menu('view-gallery')
  await page.waitForTimeout(300)
  await shot('06-gallery')
  await menu('view-list')

  await page.locator('[role="option"]', { hasText: 'Old trip' }).click()
  await menu('delete-note')
  await page.waitForTimeout(400)
  assert.ok(!files().includes('Old trip.txt'), 'deleted note leaves the folder')
  assert.ok(readdirSync(join(notesDir, '.vimnotes', 'trash')).includes('Old trip.txt'), 'and lands in Recently Deleted')
  await page.getByRole('treeitem', { name: /Recently Deleted/ }).click()
  await page.waitForTimeout(200)
  await shot('07-recently-deleted')

  // ── New folder (⇧⌘N) with inline rename ────────────────────────────────
  await menu('new-folder')
  await page.waitForTimeout(300)
  await page.keyboard.type('Тэмдэглэл')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  assert.ok(files().includes('Тэмдэглэл'), `folder created on disk: ${files()}`)

  // ── Untouched new notes are discarded, like Apple Notes ───────────────
  await page.getByRole('treeitem', { name: /^Notes/ }).click()
  await menu('new-note')
  await page.waitForTimeout(300)
  assert.ok(files().includes('New Note.txt'))
  await page.locator('[role="option"]', { hasText: 'Reading list' }).click()
  await page.waitForTimeout(400)
  assert.ok(!files().includes('New Note.txt'), 'empty new note removed when leaving it')

  // ── Files added outside the app show up live ───────────────────────────
  writeFileSync(join(notesDir, 'From Finder.txt'), 'From Finder\nCreated outside the app')
  await page.locator('[role="option"]', { hasText: 'From Finder' }).waitFor({ timeout: 3000 })

  // ── Gallery: open a note full width and go back ────────────────────────
  await menu('view-gallery')
  await page.locator('[role="option"]', { hasText: 'Reading list' }).dblclick()
  await page.waitForSelector('[aria-label="Back to Gallery"]')
  await shot('06b-gallery-open')
  await page.locator('[aria-label="Back to Gallery"]').click()
  await menu('view-list')

  // ── Right-click menus (regression: used to freeze the window) ───────────
  await page.getByRole('treeitem', { name: /^Notes/ }).click()
  await page.locator('[role="option"]', { hasText: 'Reading list' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Pin Note' }).click()
  await page.waitForTimeout(300)
  assert.ok(await page.locator('h3', { hasText: 'Pinned' }).locator('..').getByText('Reading list').count(), 'pinned from context menu')
  await page.getByRole('treeitem', { name: /Work/ }).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename Folder' }).waitFor()
  await page.keyboard.press('Escape')

  // ── ⇧⌘E and Vim navigation in the list (Cyrillic layout too) ──────────
  await page.getByRole('treeitem', { name: /^Notes/ }).click()
  const listbox = page.getByRole('listbox', { name: 'Notes' })
  const selectedTitle = () => listbox.locator('[aria-selected="true"] .font-semibold').first().innerText()
  const titles = await listbox.locator('[role="option"] .font-semibold').allInnerTexts()
  const focused = () => page.evaluate(() => document.activeElement?.closest('.cm-editor') ? 'editor' : document.activeElement?.getAttribute('aria-label'))
  await page.locator('[role="option"]', { hasText: titles[0] }).click()
  await menu('focus-explorer') // list → folders
  await page.waitForTimeout(150)
  assert.equal(await focused(), 'Folders', '⇧⌘E from the list focuses the folders')
  await menu('focus-explorer') // folders → editor
  await page.waitForTimeout(150)
  assert.equal(await focused(), 'editor', '⇧⌘E from the folders focuses the editor')
  await menu('focus-explorer') // editor → list
  await page.waitForTimeout(150)
  assert.equal(await focused(), 'Notes', '⇧⌘E from the editor focuses the notes list')
  await page.keyboard.press('j')
  assert.equal(await selectedTitle(), titles[1], 'j moves down')
  await foreignKey('о', 'KeyJ') // j on a Cyrillic layout
  assert.equal(await selectedTitle(), titles[2], 'j works on a Cyrillic layout')
  await page.keyboard.press('k')
  assert.equal(await selectedTitle(), titles[1], 'k moves up')
  await page.keyboard.press('Shift+G')
  assert.equal(await selectedTitle(), titles.at(-1), 'G jumps to the last note')
  await page.keyboard.type('gg')
  assert.equal(await selectedTitle(), titles[0], 'gg jumps to the first note')
  await page.keyboard.type('2j')
  assert.equal(await selectedTitle(), titles[2], 'counts work (2j)')
  await page.keyboard.press('h')
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Folders', 'h goes to the sidebar')
  await page.keyboard.press('j')
  assert.ok(await page.getByRole('treeitem', { name: /Ideas/ }).getAttribute('aria-selected'), 'j moves in the sidebar')
  await page.keyboard.press('k')
  await page.keyboard.press('l')
  await page.keyboard.press('l') // open the note
  await page.waitForTimeout(150)
  assert.ok(await page.evaluate(() => !!document.activeElement?.closest('.cm-editor')), 'l opens the note in the editor')

  // ── Undo like VSCodeVim: `u` = whole change, ⌘Z = typing chunk ─────────
  await menu('new-note')
  await page.waitForTimeout(400)
  await page.keyboard.type('Undo test')
  await page.keyboard.press('Escape')
  await page.keyboard.press('o')
  await page.keyboard.type('first ')
  await page.waitForTimeout(700) // pause → separate chunk for ⌘Z
  await page.keyboard.type('second')
  await page.keyboard.press('Escape')
  await page.keyboard.press('u')
  assert.equal(await editorText(), 'Undo test', '`u` undoes the whole insert session')
  await page.keyboard.press('Control+r')
  assert.equal(await editorText(), 'Undo test\nfirst second', '⌃r redoes it')
  await menu('undo')
  await page.waitForTimeout(50)
  assert.equal(await editorText(), 'Undo test\nfirst ', '⌘Z undoes only the last typing chunk')
  await menu('redo')
  await page.keyboard.type('$xx')
  assert.equal(await editorText(), 'Undo test\nfirst seco')
  await page.keyboard.press('u')
  assert.equal(await editorText(), 'Undo test\nfirst secon', '`u` after `xx` restores one character')

  // ── Find bar ───────────────────────────────────────────────────────────
  await menu('find')
  await page.locator('.find-bar-input:focus').waitFor()
  await page.keyboard.type('o')
  await page.waitForTimeout(100)
  assert.match(await page.locator('.find-bar-status').innerText(), /^\d+ of \d+$/, 'find bar shows match count')
  await shot('08a-find-bar')
  await page.keyboard.press('Escape')

  // ── Enter continues lists; Enter on an empty item ends the list ────────
  await menu('new-note')
  await page.waitForTimeout(400)
  await page.keyboard.type('Lists\n- [ ] milk\nbread\n\nafter\n1. one\ntwo\n\n• dot\nnext')
  await page.keyboard.press('Escape')
  assert.equal(
    await editorText(),
    'Lists\n- [ ] milk\n- [ ] bread\nafter\n1. one\n2. two\n• dot\n• next',
    'Enter continues checklists, numbers and bullets'
  )

  const lines = () => page.locator('.cm-content .cm-line').allTextContents()
  // ── Trimming: files are saved tidy; ⌘S tidies the text on screen ──────
  await page.keyboard.press('Shift+G')
  await page.keyboard.press('A')
  await page.keyboard.type('   \n\n\n')
  await page.waitForTimeout(800)
  const listsFile = files().find((f) => f.startsWith('Lists'))
  assert.equal(readFileSync(join(notesDir, listsFile), 'utf8').endsWith('• next'), true, 'autosave writes without trailing spaces/lines')
  assert.deepEqual((await lines()).slice(-3), ['• next   ', '', ''], 'typing is left alone')
  await page.keyboard.press('Escape')
  await menu('save')
  await page.waitForTimeout(200)
  assert.equal((await lines()).at(-1), '• next', '⌘S tidies the editor')

  // ── Rich text: paragraph and font styles, stored as Markdown ──────────
  // Menu commands arrive over IPC; let each land before the next keystroke.
  const format = async (command) => {
    await menu(command)
    await page.waitForTimeout(60)
  }
  await menu('new-note')
  await page.waitForTimeout(400)
  await page.keyboard.type('Trip\nPacking list\nbring warm clothes\nquoted line')
  await page.keyboard.press('Escape')
  await page.keyboard.type('gg')
  await format('style-title')
  await page.keyboard.press('j')
  await format('style-heading')
  await page.keyboard.type('jw')
  await format('bold') // no selection: the word under the cursor
  await page.keyboard.type('$viw')
  await format('toggle-list') // ⌘B with a selection bolds instead of hiding the sidebar
  await page.keyboard.type('0')
  await format('italic')
  await page.keyboard.press('j')
  await format('block-quote') // the cursor stays on the same letter
  await page.keyboard.type('viw')
  await format('underline')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)
  const styled = '# Trip\n## Packing list\n*bring* **warm** **clothes**\n> <u>quoted</u> line'
  assert.equal(await page.evaluate(() => document.querySelector('.cm-content').cmTile.root.view.state.doc.toString()), styled)
  assert.ok((await page.locator('[data-panel]#list').evaluate((el) => el.getBoundingClientRect().width)) > 200, '⌘B with a selection keeps the sidebar')
  await page.keyboard.type('gg')
  await page.waitForTimeout(100)
  const rendered = await lines()
  assert.deepEqual(rendered.slice(1), ['Packing list', 'bring warm clothes', 'quoted line'], `markup is hidden off the cursor line: ${rendered}`)
  assert.equal(rendered[0], '# Trip', 'markup shows on the cursor line')
  assert.equal(await page.locator('.cm-h1').count(), 1)
  assert.equal(await page.locator('.cm-h2').count(), 1)
  assert.deepEqual(await page.locator('.cm-bold').allInnerTexts(), ['warm', 'clothes'])
  assert.deepEqual(await page.locator('.cm-italic').allInnerTexts(), ['bring'])
  assert.deepEqual(await page.locator('.cm-underline').allInnerTexts(), ['quoted'])
  assert.equal(await page.locator('.cm-quote').count(), 1)
  const fontWeight = await page.locator('.cm-bold').first().evaluate((el) => getComputedStyle(el).fontWeight)
  assert.equal(fontWeight, '700')
  await page.waitForTimeout(800)
  assert.ok(files().includes('Trip.txt'), `file named without markup: ${files()}`)
  assert.equal(readFileSync(join(notesDir, 'Trip.txt'), 'utf8'), styled, 'styles are saved as Markdown')
  assert.ok(await listbox.locator('[role="option"]', { hasText: 'Trip' }).count(), 'list shows the plain title')
  assert.ok(
    await page.evaluate(async () => {
      await document.fonts.ready
      return getComputedStyle(document.querySelector('.cm-content')).fontFamily.includes('Montserrat') && document.fonts.check('15px "Montserrat Variable"')
    }),
    'notes use Montserrat'
  )
  await shot('08d-rich-text')

  // ── Regression: Vim keeps working on a Mongolian layout and after dialogs ─
  const cursorLine = () =>
    page.evaluate(() => {
      const view = document.querySelector('.cm-content').cmTile.root.view
      return view.state.doc.lineAt(view.state.selection.main.head).number
    })
  // Keys as typed on the macOS Mongolian-Cyrillic layout: g → г, j → р, and
  // the number row types symbols (2 → `-`, 5 → `:`) that used to reach Vim as-is.
  const mongolian = async (...keys) => {
    for (const [key, code] of keys) await foreignKey(key, code)
  }
  await mongolian(['г', 'KeyG'], ['г', 'KeyG'], ['р', 'KeyJ'])
  assert.equal(await cursorLine(), 2, 'gg and j on a Mongolian layout')
  await mongolian(['г', 'KeyG'], ['г', 'KeyG'], ['-', 'Digit2'], ['р', 'KeyJ'])
  assert.equal(await cursorLine(), 3, 'the 2 key is a count, not `-`')
  await mongolian(['г', 'KeyG'], ['г', 'KeyG'], [':', 'Digit5'], ['р', 'KeyJ'])
  assert.equal(await page.locator('.cm-vim-panel input').count(), 0, 'the 5 key doesn’t open the : command line')
  assert.equal(await cursorLine(), 4, '5j works')
  await menu('settings')
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.keyboard.press('k')
  assert.equal(await cursorLine(), 3, 'Vim keys still reach the note after closing a dialog')
  // Ending visual mode with a mouse click used to make CodeMirror disable Vim.
  await page.keyboard.type('vj')
  await page.locator('.cm-content .cm-line').nth(3).click()
  await page.keyboard.type('gg')
  await page.keyboard.press('j')
  assert.equal(await cursorLine(), 2, 'Vim survives a click during visual mode')
  await page.keyboard.press('j')
  assert.equal(await cursorLine(), 3)
  await page.evaluate(() => document.activeElement.blur())
  await page.keyboard.press('k')
  assert.equal(await cursorLine(), 2, 'a key pressed with nothing focused goes back to the note')
  await page.keyboard.type('gg')

  // ── ⌘Z in the notes list undoes deleting a note (like VS Code's explorer) ─
  await page.getByRole('treeitem', { name: /^Notes/ }).click()
  await page.locator('[role="option"]', { hasText: 'Undo test' }).click()
  await page.keyboard.type('dd')
  await page.waitForTimeout(400)
  assert.ok(!files().some((f) => f.startsWith('Undo test')), 'dd in the list deletes the note')
  await menu('undo')
  await page.waitForTimeout(400)
  assert.ok(files().some((f) => f.startsWith('Undo test')), '⌘Z restores the deleted note')
  assert.equal(await selectedTitle(), 'Undo test', 'restored note is selected')
  await menu('redo')
  await page.waitForTimeout(400)
  assert.ok(!files().some((f) => f.startsWith('Undo test')), '⇧⌘Z deletes it again')
  await menu('undo')
  await page.waitForTimeout(400)
  // Moving to another folder is undoable too.
  await page.locator('[role="option"]', { hasText: 'Undo test' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Move to' }).click()
  await page.getByRole('menuitem', { name: 'Ideas' }).click()
  await page.waitForTimeout(400)
  assert.ok(readdirSync(join(notesDir, 'Ideas')).some((f) => f.startsWith('Undo test')), 'moved to Ideas')
  await page.getByRole('listbox', { name: 'Notes' }).focus()
  await menu('undo')
  await page.waitForTimeout(400)
  assert.ok(files().some((f) => f.startsWith('Undo test')), '⌘Z moves it back')

  // ── ⌘B hides folders + list together, like VS Code's side bar ──────────
  const panelWidth = (id) => page.locator(`[data-panel]#${id}`).evaluate((el) => el.getBoundingClientRect().width)
  await menu('toggle-list')
  await page.waitForTimeout(400)
  assert.deepEqual([await panelWidth('sidebar'), await panelWidth('list')], [0, 0], '⌘B hides folders and notes')
  assert.equal(await focused(), 'editor', 'focus moves to the editor')
  await shot('08c-sidebars-hidden')
  await menu('focus-explorer') // ⇧⌘E reveals them again
  await page.waitForTimeout(400)
  assert.ok((await panelWidth('list')) > 200 && (await panelWidth('sidebar')) > 150, '⇧⌘E shows them again')
  assert.equal(await focused(), 'Notes')

  // ── Panel widths are remembered after hiding/showing and across restarts ─
  const separator = page.locator('[data-separator]').first()
  const box = await separator.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + 300)
  await page.mouse.down()
  await page.mouse.move(box.x + 60, box.y + 300, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(500)
  const widened = Math.round(await panelWidth('sidebar'))
  assert.ok(widened > 250, `sidebar widened by dragging (${widened}px)`)
  await menu('toggle-sidebar')
  await page.waitForTimeout(400)
  await menu('toggle-sidebar')
  await page.waitForTimeout(400)
  assert.ok(Math.abs((await panelWidth('sidebar')) - widened) <= 1, 'sidebar reopens at the chosen width')
  await menu('toggle-list')
  await page.waitForTimeout(400)
  await menu('toggle-list')
  await page.waitForTimeout(400)
  assert.ok(Math.abs((await panelWidth('sidebar')) - widened) <= 1, '⌘B keeps the chosen width')
  const savedSettings = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))
  assert.ok(Math.abs(savedSettings.sidebarWidth - widened) <= 1, 'width is saved in settings')

  // ── Sidebar slides closed and open ─────────────────────────────────────
  const sidebarWidth = () => page.locator('[data-panel]').first().evaluate((el) => el.getBoundingClientRect().width)
  await menu('toggle-sidebar')
  await page.waitForTimeout(400)
  assert.equal(await sidebarWidth(), 0, 'sidebar hidden')
  await shot('08b-sidebar-hidden')
  await menu('toggle-sidebar')
  await page.waitForTimeout(400)
  assert.ok((await sidebarWidth()) > 150, 'sidebar shown again')

  // ── Settings, and live light/dark switching from the OS ────────────────
  const setTheme = (theme) => app.evaluate(({ nativeTheme }, t) => (nativeTheme.themeSource = t), theme)
  const appearance = () =>
    page.evaluate(() => ({
      dark: matchMedia('(prefers-color-scheme: dark)').matches,
      background: getComputedStyle(document.querySelector('.note-editor')).backgroundColor
    }))
  await page.getByRole('treeitem', { name: /^Notes/ }).click()
  await page.locator('[role="option"]', { hasText: 'Groceries' }).click()
  await setTheme('light')
  await page.waitForTimeout(200)
  assert.deepEqual(await appearance(), { dark: false, background: 'rgb(255, 255, 255)' }, 'light appearance')
  await menu('settings')
  await page.waitForTimeout(300)
  await shot('08-settings')
  await page.keyboard.press('Escape')
  await setTheme('dark')
  await page.waitForTimeout(200)
  assert.deepEqual(await appearance(), { dark: true, background: 'rgb(30, 30, 30)' }, 'dark appearance follows the OS')
  await shot('09-dark')
  await menu('find')
  await page.waitForTimeout(150)
  await shot('09a-dark-find')
  await page.keyboard.press('Escape')
  await setTheme('system')

  console.log('✔ all checks passed')
} catch (error) {
  await shot('zz-failure').catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  console.log('screenshots:', out)
  await app.close()
}
