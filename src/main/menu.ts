import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { primaryKey, toAccelerator } from '@shared/keybindings'
import { DEFAULT_SETTINGS, type MenuCommand, type MenuState } from '@shared/types'
import { getKeybindings } from './keybindings'

let state: MenuState = {
  sortBy: DEFAULT_SETTINGS.sortBy,
  groupByDate: DEFAULT_SETTINGS.groupByDate,
  viewMode: DEFAULT_SETTINGS.viewMode,
  vimEnabled: DEFAULT_SETTINGS.vimEnabled,
  sidebarVisible: DEFAULT_SETTINGS.sidebarVisible,
  listVisible: DEFAULT_SETTINGS.listVisible,
  showNoteCount: DEFAULT_SETTINGS.showNoteCount,
  hasNote: false,
  notePinned: false
}

function send(channel: string, payload: string): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send(channel, payload)
}

/**
 * A menu item that forwards a command to the renderer, showing its shortcut
 * from keybindings.json. The renderer owns the keyboard (it knows the focus
 * and the `when` clauses), so when macOS fires an item by its key equivalent
 * we pass on the key rather than the command.
 */
function item(label: string, command: MenuCommand, extra: MenuItemConstructorOptions = {}): MenuItemConstructorOptions {
  const key = primaryKey(getKeybindings().bindings, command)
  return {
    label,
    accelerator: key && toAccelerator(key),
    click: (_item, _window, event) => (event.triggeredByAccelerator && key ? send('menu:accelerator', key) : send('menu', command)),
    ...extra
  }
}

function check(label: string, command: MenuCommand, checked: boolean): MenuItemConstructorOptions {
  return item(label, command, { type: 'checkbox', checked })
}

/** Mirrors the Apple Notes menu bar; shortcuts come from keybindings.json. */
function template(): MenuItemConstructorOptions[] {
  const noNote = { enabled: state.hasNote }
  return [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: `About ${app.name}` },
        { type: 'separator' },
        item('Settings…', 'settings'),
        item('Keyboard Shortcuts…', 'keyboard-shortcuts'),
        item('Open Keyboard Shortcuts (JSON)', 'open-keybindings-json'),
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'File',
      submenu: [
        item('New Note', 'new-note'),
        item('New Folder', 'new-folder'),
        { type: 'separator' },
        { role: 'close' },
        { type: 'separator' },
        item(state.notePinned ? 'Unpin Note' : 'Pin Note', 'pin-note', noNote),
        item('Duplicate Note', 'duplicate-note', noNote),
        item('Save', 'save', noNote),
        { type: 'separator' },
        item('Print…', 'print', noNote)
      ]
    },
    {
      label: 'Edit',
      submenu: [
        item('Undo', 'undo'),
        item('Redo', 'redo'),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        item('Delete', 'delete-note', noNote),
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find',
          submenu: [
            item('Search', 'search'),
            item('Find…', 'find', noNote),
            item('Find Next', 'find-next', noNote),
            item('Find Previous', 'find-previous', noNote)
          ]
        },
        { type: 'separator' },
        { role: 'startSpeaking' },
        { role: 'stopSpeaking' }
      ]
    },
    {
      label: 'Format',
      submenu: [
        item('Title', 'style-title', noNote),
        item('Heading', 'style-heading', noNote),
        item('Subheading', 'style-subheading', noNote),
        item('Body', 'style-body', noNote),
        item('Monostyled', 'style-monostyled', noNote),
        { type: 'separator' },
        item('Bulleted List', 'bulleted-list', noNote),
        item('Dashed List', 'dashed-list', noNote),
        item('Numbered List', 'numbered-list', noNote),
        { type: 'separator' },
        item('Block Quote', 'block-quote', noNote),
        item('Divider Line', 'insert-divider', noNote),
        { type: 'separator' },
        item('Checklist', 'checklist', noNote),
        item('Mark as Checked', 'check-item', noNote),
        { type: 'separator' },
        item('Move List Item Up', 'move-line-up', noNote),
        item('Move List Item Down', 'move-line-down', noNote),
        { type: 'separator' },
        {
          label: 'Font',
          submenu: [
            // ⌘B also hides the sidebar: the renderer picks by whether text is selected.
            item('Bold', 'bold', noNote),
            item('Italic', 'italic', noNote),
            item('Underline', 'underline', noNote),
            item('Strikethrough', 'strikethrough', noNote),
            item('Highlight', 'highlight', noNote),
            { type: 'separator' },
            item('Bigger', 'font-bigger'),
            item('Smaller', 'font-smaller')
          ]
        },
        {
          label: 'Indentation',
          submenu: [item('Increase', 'indent', noNote), item('Decrease', 'outdent', noNote)]
        },
        { type: 'separator' },
        check('Vim Mode', 'toggle-vim', state.vimEnabled)
      ]
    },
    {
      label: 'View',
      submenu: [
        check('as List', 'view-list', state.viewMode === 'list'),
        check('as Gallery', 'view-gallery', state.viewMode === 'gallery'),
        { type: 'separator' },
        {
          label: 'Sort By',
          submenu: [
            check('Date Edited', 'sort-updatedAt', state.sortBy === 'updatedAt'),
            check('Date Created', 'sort-createdAt', state.sortBy === 'createdAt'),
            check('Title', 'sort-title', state.sortBy === 'title'),
            { type: 'separator' },
            check('Group By Date', 'toggle-group-by-date', state.groupByDate)
          ]
        },
        { type: 'separator' },
        item(state.sidebarVisible ? 'Hide Folders' : 'Show Folders', 'toggle-sidebar'),
        // VS Code-style: ⌘B toggles the whole side bar, ⇧⌘E moves focus notes list ⇄ folders.
        item(state.listVisible ? 'Hide Sidebar' : 'Show Sidebar', 'toggle-list'),
        item('Focus Notes List / Folders', 'focus-explorer'),
        check('Show Note Count', 'toggle-note-count', state.showNoteCount),
        { type: 'separator' },
        item('Zoom In', 'zoom-in'),
        item('Zoom Out', 'zoom-out'),
        item('Actual Size', 'font-reset'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' } as MenuItemConstructorOptions])
      ]
    },
    {
      role: 'windowMenu',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        {
          label: app.name,
          accelerator: 'Cmd+0',
          click: () => BrowserWindow.getAllWindows()[0]?.show()
        },
        { type: 'separator' },
        { role: 'front' }
      ]
    },
    { role: 'help', submenu: [] }
  ]
}

export function buildMenu(next: Partial<MenuState> = {}): void {
  state = { ...state, ...next }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template()))
}
