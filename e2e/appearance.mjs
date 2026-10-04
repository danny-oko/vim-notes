// Checks that the UI follows the OS appearance by flipping nativeTheme at runtime.
//   bun run build && node e2e/appearance.mjs [outputDir]
import { _electron as electron } from 'playwright'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const out = process.argv[2] ?? mkdtempSync(join(tmpdir(), 'vim-notes-appearance-'))
const sandbox = mkdtempSync(join(tmpdir(), 'vim-notes-appearance-run-'))
const notesDir = join(sandbox, 'Notes')
const userData = join(sandbox, 'profile')
mkdirSync(notesDir, { recursive: true })
mkdirSync(userData)
const long = Array.from({ length: 80 }, (_, i) => `Line ${i + 1} — the quick brown fox`).join('\n')
writeFileSync(join(notesDir, 'Long note.txt'), `Long note\n${long}`)
writeFileSync(join(notesDir, 'Groceries.txt'), 'Groceries\n- [x] Milk\n- [ ] Eggs')
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ notesDir }))

const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
const page = await app.firstWindow()
await page.waitForSelector('[role="option"]')
const setTheme = (theme) => app.evaluate(({ nativeTheme }, t) => (nativeTheme.themeSource = t), theme)
const menu = (c) => app.evaluate(({ BrowserWindow }, c) => BrowserWindow.getAllWindows()[0].webContents.send('menu', c), c)
const snapshot = () =>
  page.evaluate(() => ({
    dark: matchMedia('(prefers-color-scheme: dark)').matches,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    background: getComputedStyle(document.querySelector('.note-editor')).backgroundColor
  }))

try {
  await page.locator('[role="option"]', { hasText: 'Long note' }).click()
  for (const theme of ['light', 'dark']) {
    await setTheme(theme)
    await page.waitForTimeout(300)
    console.log(theme, JSON.stringify(await snapshot()))
    await page.locator('.note-editor').hover()
    await page.mouse.wheel(0, 400)
    await menu('find')
    await page.waitForTimeout(200)
    await page.screenshot({ path: join(out, `${theme}-editor.png`) })
    await page.keyboard.press('Escape')
    await page.locator('[role="option"]', { hasText: 'Groceries' }).click({ button: 'right' })
    await page.waitForTimeout(200)
    await page.screenshot({ path: join(out, `${theme}-context-menu.png`) })
    await page.keyboard.press('Escape')
    await menu('settings')
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(out, `${theme}-settings.png`) })
    await page.keyboard.press('Escape')
    await page.locator('[role="option"]', { hasText: 'Long note' }).click()
  }
  await setTheme('system')
} finally {
  console.log('screenshots:', out)
  await app.close()
}
