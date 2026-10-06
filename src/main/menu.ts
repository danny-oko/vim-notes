import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { DEFAULT_SETTINGS, type MenuCommand, type MenuState } from '@shared/types'

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

function send(command: MenuCommand): void {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  win?.webContents.send('menu', command)
}

/** A menu item that forwards a command to the renderer. */
function item(label: string, command: MenuCommand, accelerator?: string, extra: MenuItemConstructorOptions = {}): MenuItemConstructorOptions {
  return { label, accelerator, click: () => send(command), ...extra }
}

function check(label: string, command: MenuCommand, checked: boolean, accelerator?: string): MenuItemConstructorOptions {
  return item(label, command, accelerator, { type: 'checkbox', checked })
}

/** Mirrors the Apple Notes menu bar, keeping its keyboard shortcuts. */
function template(): MenuItemConstructorOptions[] {
  const noNote = { enabled: state.hasNote }
  return [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: `About ${app.name}` },
        { type: 'separator' },
        item('Settings…', 'settings', 'Cmd+,'),
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
        item('New Note', 'new-note', 'Cmd+N'),
        item('New Folder', 'new-folder', 'Shift+Cmd+N'),
        { type: 'separator' },
        { role: 'close' },
        { type: 'separator' },
        item(state.notePinned ? 'Unpin Note' : 'Pin Note', 'pin-note', undefined, noNote),
        item('Duplicate Note', 'duplicate-note', 'Cmd+D', noNote),
        item('Save', 'save', 'Cmd+S', noNote),
        { type: 'separator' },
        item('Print…', 'print', 'Cmd+P', noNote)
      ]
    },
    {
      label: 'Edit',
      submenu: [
        item('Undo', 'undo', 'Cmd+Z'),
        item('Redo', 'redo', 'Shift+Cmd+Z'),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        item('Delete', 'delete-note', 'Cmd+Backspace', noNote),
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find',
          submenu: [
            item('Search', 'search', 'Alt+Cmd+F'),
            item('Find…', 'find', 'Cmd+F', noNote),
            item('Find Next', 'find-next', 'Cmd+G', noNote),
            item('Find Previous', 'find-previous', 'Shift+Cmd+G', noNote)
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
        item('Title', 'style-title', 'Shift+Cmd+T', noNote),
        item('Heading', 'style-heading', 'Shift+Cmd+H', noNote),
        item('Subheading', 'style-subheading', 'Shift+Cmd+J', noNote),
        item('Body', 'style-body', 'Shift+Cmd+B', noNote),
        item('Monostyled', 'style-monostyled', 'Shift+Cmd+M', noNote),
        { type: 'separator' },
        item('Bulleted List', 'bulleted-list', 'Shift+Cmd+7', noNote),
        item('Dashed List', 'dashed-list', 'Shift+Cmd+8', noNote),
        item('Numbered List', 'numbered-list', 'Shift+Cmd+9', noNote),
        { type: 'separator' },
        item('Block Quote', 'block-quote', "Cmd+'", noNote),
        { type: 'separator' },
        item('Checklist', 'checklist', 'Shift+Cmd+L', noNote),
        item('Mark as Checked', 'check-item', 'Shift+Cmd+U', noNote),
        { type: 'separator' },
        item('Move List Item Up', 'move-line-up', 'Ctrl+Cmd+Up', noNote),
        item('Move List Item Down', 'move-line-down', 'Ctrl+Cmd+Down', noNote),
        { type: 'separator' },
        {
          label: 'Font',
          submenu: [
            // ⌘B belongs to View ▸ Hide Sidebar; with text selected in a note it bolds instead.
            item('Bold', 'bold', 'Cmd+B', { ...noNote, registerAccelerator: false }),
            item('Italic', 'italic', 'Cmd+I', noNote),
            item('Underline', 'underline', 'Cmd+U', noNote),
            item('Strikethrough', 'strikethrough', 'Shift+Cmd+X', noNote),
            item('Highlight', 'highlight', undefined, noNote),
            { type: 'separator' },
            item('Bigger', 'font-bigger', 'Cmd+='),
            item('Smaller', 'font-smaller', 'Cmd+-')
          ]
        },
        {
          label: 'Indentation',
          submenu: [item('Increase', 'indent', 'Cmd+]', noNote), item('Decrease', 'outdent', 'Cmd+[', noNote)]
        },
        { type: 'separator' },
        check('Vim Mode', 'toggle-vim', state.vimEnabled, 'Ctrl+Cmd+V')
      ]
    },
    {
      label: 'View',
      submenu: [
        check('as List', 'view-list', state.viewMode === 'list', 'Cmd+1'),
        check('as Gallery', 'view-gallery', state.viewMode === 'gallery', 'Cmd+2'),
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
        item(state.sidebarVisible ? 'Hide Folders' : 'Show Folders', 'toggle-sidebar', 'Alt+Cmd+S'),
        // VS Code-style: ⌘B toggles the whole side bar, ⇧⌘E moves focus notes list ⇄ folders.
        item(state.listVisible ? 'Hide Sidebar' : 'Show Sidebar', 'toggle-list', 'Cmd+B'),
        item('Focus Notes List / Folders', 'focus-explorer', 'Shift+Cmd+E'),
        check('Show Note Count', 'toggle-note-count', state.showNoteCount),
        { type: 'separator' },
        item('Zoom In', 'font-bigger', 'Shift+Cmd+.'),
        item('Zoom Out', 'font-smaller', 'Shift+Cmd+,'),
        item('Actual Size', 'font-reset', 'Shift+Cmd+0'),
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
