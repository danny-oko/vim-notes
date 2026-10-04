import { _electron as electron } from 'playwright'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const sandbox = mkdtempSync(join(tmpdir(), 'vn-crash-'))
const notesDir = join(sandbox, 'Notes'); const userData = join(sandbox, 'p')
mkdirSync(notesDir, { recursive: true }); mkdirSync(userData)
writeFileSync(join(notesDir, 'Long note.txt'), 'Long note\nbody')
writeFileSync(join(notesDir, 'Groceries.txt'), 'Groceries\n- [x] Milk')
writeFileSync(join(userData, 'settings.json'), JSON.stringify({ notesDir }))
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
const page = await app.firstWindow()
page.on('console', (m) => m.type() === 'error' && console.log('ERR', m.text().slice(0, 400)))
page.on('pageerror', (e) => console.log('PAGEERR', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')))
const menu = (c) => app.evaluate(({ BrowserWindow }, c) => BrowserWindow.getAllWindows()[0].webContents.send('menu', c), c)
await page.waitForSelector('[role="option"]')
const alive = async (step) => console.log(step, (await page.locator('[role="option"]').count()) > 0 ? 'ok' : 'BLANK')
try {
  await page.locator('[role="option"]', { hasText: 'Long note' }).click(); await alive('select')
  await menu('find'); await page.waitForTimeout(200); await alive('find')
  await page.keyboard.press('Escape'); await page.waitForTimeout(200); await alive('esc-find')
  await page.locator('[role="option"]', { hasText: 'Groceries' }).click({ button: 'right', timeout: 5000 }); await page.waitForTimeout(200); await alive('ctx')
  await page.keyboard.press('Escape'); await page.waitForTimeout(200); await alive('esc-ctx')
  await menu('settings'); await page.waitForTimeout(300); await alive('settings')
} catch (e) { console.log('STEP FAILED', e.message.split('\n')[0]) }
await app.close()
