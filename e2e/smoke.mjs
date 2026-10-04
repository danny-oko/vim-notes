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
const app = await electron.launch(
  process.env.APP_PATH
    ? { executablePath: process.env.APP_PATH, args: [`--user-data-dir=${userData}`] }
    : { args: ['.', `--user-data-dir=${userData}`] }
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

  // ── Settings & dark mode ───────────────────────────────────────────────
  await page.getByRole('treeitem', { name: /^Notes/ }).click()
  await menu('settings')
  await page.waitForTimeout(300)
  await shot('08-settings')
  await page.keyboard.press('Escape')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.locator('[role="option"]', { hasText: 'Groceries' }).click()
  await page.waitForTimeout(200)
  await shot('09-dark')

  console.log('✔ all checks passed')
} catch (error) {
  await shot('zz-failure').catch(() => {})
  console.error(error)
  process.exitCode = 1
} finally {
  console.log('screenshots:', out)
  await app.close()
}
