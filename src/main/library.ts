import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, relative, sep } from 'node:path'
import { noteTitle } from '@shared/note-text'
import type { Folder, FolderPath, Library, Note, NoteExtension } from '@shared/types'

/** Hidden directory inside the notes root holding app metadata and Recently Deleted. */
const META_DIR = '.vimnotes'
const META_FILE = 'meta.json'
const TRASH_DIR = 'trash'
const NOTE_EXTENSIONS = new Set(['.txt', '.md'])
/** Apple Notes keeps deleted notes for 30 days. */
const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const MAX_FILE_STEM = 80

interface TrashEntry {
  originalFolder: FolderPath
  deletedAt: number
}

interface Meta {
  /** Relative paths (posix-style) of pinned notes. */
  pinned: string[]
  /** Keyed by file name inside the trash directory. */
  trash: Record<string, TrashEntry>
}

const toPosix = (p: string): string => p.split(sep).join('/')

function fileStem(content: string): string {
  const stem = noteTitle(content)
    // Characters that are illegal or awkward in file names on macOS/Windows.
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, MAX_FILE_STEM)
    .trim()
  return stem || 'New Note'
}

/** True when `stem` is `wanted` or `wanted N` (the uniqueness suffix we add). */
function stemMatches(stem: string, wanted: string): boolean {
  return stem === wanted || new RegExp(`^${escapeRegExp(wanted)} \\d+$`).test(stem)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function uniquePath(dir: string, stem: string, ext: string, except?: string): Promise<string> {
  for (let n = 1; ; n++) {
    const candidate = join(dir, n === 1 ? `${stem}${ext}` : `${stem} ${n}${ext}`)
    if (candidate === except || !existsSync(candidate)) return candidate
  }
}

/**
 * The notes library is a plain directory tree: every folder is a directory and
 * every note is a text file whose name follows the note's title.
 */
export class NoteLibrary {
  private readonly idsByPath = new Map<string, string>()
  private readonly pathsById = new Map<string, string>()
  private meta: Meta = { pinned: [], trash: {} }
  /** Serialises every mutation so concurrent saves can never race on renames. */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(
    readonly root: string,
    private readonly extension: () => NoteExtension
  ) {}

  private get metaDir(): string {
    return join(this.root, META_DIR)
  }

  private get trashDir(): string {
    return join(this.metaDir, TRASH_DIR)
  }

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task)
    this.queue = run.catch(() => undefined)
    return run
  }

  // ── Loading ────────────────────────────────────────────────────────────

  load(): Promise<Library> {
    return this.exclusive(async () => {
      await mkdir(this.trashDir, { recursive: true })
      await this.readMeta()
      await this.purgeExpiredTrash()
      return this.scan()
    })
  }

  private async readMeta(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(join(this.metaDir, META_FILE), 'utf8'))
      this.meta = { pinned: raw.pinned ?? [], trash: raw.trash ?? {} }
    } catch {
      this.meta = { pinned: [], trash: {} }
    }
  }

  private async writeMeta(): Promise<void> {
    await mkdir(this.metaDir, { recursive: true })
    await writeFile(join(this.metaDir, META_FILE), JSON.stringify(this.meta, null, 2))
  }

  private async purgeExpiredTrash(): Promise<void> {
    const now = Date.now()
    let changed = false
    for (const [name, entry] of Object.entries(this.meta.trash)) {
      if (now - entry.deletedAt < TRASH_RETENTION_MS) continue
      await rm(join(this.trashDir, name), { force: true })
      delete this.meta.trash[name]
      changed = true
    }
    if (changed) await this.writeMeta()
  }

  private async scan(): Promise<Library> {
    const folders: Folder[] = []
    const notes: Note[] = []
    const seen = new Set<string>()

    const walk = async (dir: string, depth: number): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true })
      entries.sort((a, b) => a.name.localeCompare(b.name))
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue
        const abs = join(dir, entry.name)
        if (entry.isDirectory()) {
          folders.push({ path: this.rel(abs), name: entry.name, depth })
          await walk(abs, depth + 1)
        } else if (entry.isFile() && NOTE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
          seen.add(abs)
          notes.push(await this.readNote(abs))
        }
      }
    }
    await walk(this.root, 0)

    const trash: Note[] = []
    for (const name of await readdir(this.trashDir)) {
      const abs = join(this.trashDir, name)
      const entry = this.meta.trash[name]
      if (!entry) continue
      seen.add(abs)
      trash.push({ ...(await this.readNote(abs)), deletedAt: entry.deletedAt, originalFolder: entry.originalFolder })
    }

    // Forget ids of files that disappeared (deleted or renamed outside the app).
    for (const [abs, id] of this.idsByPath) {
      if (seen.has(abs)) continue
      this.idsByPath.delete(abs)
      this.pathsById.delete(id)
    }

    return { root: this.root, folders, notes, trash }
  }

  // ── Path helpers ───────────────────────────────────────────────────────

  private rel(abs: string): string {
    return toPosix(relative(this.root, abs))
  }

  private folderDir(folder: FolderPath): string {
    const dir = join(this.root, ...folder.split('/').filter(Boolean))
    if (relative(this.root, dir).startsWith('..')) throw new Error('Folder is outside the notes directory')
    return dir
  }

  private folderOf(abs: string): FolderPath {
    return this.rel(dirname(abs))
  }

  private isInTrash(abs: string): boolean {
    return dirname(abs) === this.trashDir
  }

  private idFor(abs: string): string {
    let id = this.idsByPath.get(abs)
    if (!id) {
      id = randomUUID()
      this.idsByPath.set(abs, id)
      this.pathsById.set(id, abs)
    }
    return id
  }

  private pathFor(id: string): string {
    const abs = this.pathsById.get(id)
    if (!abs) throw new Error('Note not found. It may have been moved or deleted outside the app.')
    return abs
  }

  private track(from: string, to: string): void {
    const id = this.idsByPath.get(from)
    if (!id) return
    this.idsByPath.delete(from)
    this.idsByPath.set(to, id)
    this.pathsById.set(id, to)
  }

  private async move(from: string, to: string): Promise<void> {
    if (from === to) return
    await rename(from, to)
    this.track(from, to)
    const fromRel = this.rel(from)
    if (this.meta.pinned.includes(fromRel)) {
      this.meta.pinned = this.meta.pinned.map((p) => (p === fromRel ? this.rel(to) : p))
      await this.writeMeta()
    }
  }

  private async readNote(abs: string): Promise<Note> {
    const [content, info] = await Promise.all([readFile(abs, 'utf8'), stat(abs)])
    const inTrash = this.isInTrash(abs)
    return {
      id: this.idFor(abs),
      folder: inTrash ? '' : this.folderOf(abs),
      fileName: basename(abs),
      content,
      createdAt: info.birthtimeMs || info.mtimeMs,
      updatedAt: info.mtimeMs,
      pinned: !inTrash && this.meta.pinned.includes(this.rel(abs))
    }
  }

  private async readAnyNote(abs: string): Promise<Note> {
    const note = await this.readNote(abs)
    const entry = this.meta.trash[basename(abs)]
    return this.isInTrash(abs) && entry
      ? { ...note, deletedAt: entry.deletedAt, originalFolder: entry.originalFolder }
      : note
  }

  // ── Notes ──────────────────────────────────────────────────────────────

  createNote(folder: FolderPath, content = ''): Promise<Note> {
    return this.exclusive(async () => {
      const dir = this.folderDir(folder)
      await mkdir(dir, { recursive: true })
      const abs = await uniquePath(dir, fileStem(content), this.extension())
      await writeFile(abs, content, { flag: 'wx' })
      return this.readNote(abs)
    })
  }

  /** Writes the note and renames its file whenever the title (first line) changes. */
  saveNote(id: string, content: string): Promise<Note> {
    return this.exclusive(async () => {
      let abs = this.pathFor(id)
      if (this.isInTrash(abs)) throw new Error('Recently deleted notes can’t be edited.')
      await writeFile(abs, content)
      const ext = extname(abs)
      const wanted = fileStem(content)
      if (!stemMatches(basename(abs, ext), wanted)) {
        const target = await uniquePath(dirname(abs), wanted, ext, abs)
        await this.move(abs, target)
        abs = target
      }
      return this.readNote(abs)
    })
  }

  moveNote(id: string, folder: FolderPath): Promise<Note> {
    return this.exclusive(async () => {
      const abs = this.pathFor(id)
      const dir = this.folderDir(folder)
      if (dirname(abs) === dir) return this.readNote(abs)
      const ext = extname(abs)
      const target = await uniquePath(dir, basename(abs, ext), ext)
      await this.move(abs, target)
      return this.readNote(target)
    })
  }

  setPinned(id: string, pinned: boolean): Promise<Note> {
    return this.exclusive(async () => {
      const abs = this.pathFor(id)
      const rel = this.rel(abs)
      this.meta.pinned = this.meta.pinned.filter((p) => p !== rel)
      if (pinned) this.meta.pinned.push(rel)
      await this.writeMeta()
      return this.readNote(abs)
    })
  }

  /** Moves a note to Recently Deleted, or erases it if it is already there. */
  deleteNote(id: string): Promise<void> {
    return this.exclusive(async () => {
      const abs = this.pathFor(id)
      if (this.isInTrash(abs)) {
        await unlink(abs)
        delete this.meta.trash[basename(abs)]
        await this.writeMeta()
        return
      }
      await this.moveToTrash(abs)
    })
  }

  discardIfEmpty(id: string): Promise<boolean> {
    return this.exclusive(async () => {
      const abs = this.pathsById.get(id)
      if (!abs || this.isInTrash(abs) || (await readFile(abs, 'utf8')).trim()) return false
      await unlink(abs)
      return true
    })
  }

  private async moveToTrash(abs: string): Promise<void> {
    const ext = extname(abs)
    const target = await uniquePath(this.trashDir, basename(abs, ext), ext)
    const originalFolder = this.folderOf(abs)
    await this.move(abs, target)
    this.meta.pinned = this.meta.pinned.filter((p) => p !== this.rel(target))
    this.meta.trash[basename(target)] = { originalFolder, deletedAt: Date.now() }
    await this.writeMeta()
  }

  recoverNote(id: string): Promise<Note> {
    return this.exclusive(async () => {
      const abs = this.pathFor(id)
      const name = basename(abs)
      const entry = this.meta.trash[name]
      const folderDir = entry ? this.folderDir(entry.originalFolder) : this.root
      const dir = existsSync(folderDir) ? folderDir : this.root
      const ext = extname(abs)
      const target = await uniquePath(dir, basename(abs, ext), ext)
      await this.move(abs, target)
      delete this.meta.trash[name]
      await this.writeMeta()
      return this.readNote(target)
    })
  }

  noteInfo(id: string): Promise<{ path: string; note: Note }> {
    const abs = this.pathFor(id)
    return this.readAnyNote(abs).then((note) => ({ path: abs, note }))
  }

  // ── Folders ────────────────────────────────────────────────────────────

  createFolder(parent: FolderPath, name: string): Promise<Folder> {
    return this.exclusive(async () => {
      const parentDir = this.folderDir(parent)
      const clean = name.replace(/[/\\:]/g, '-').trim() || 'New Folder'
      let dir = join(parentDir, clean)
      for (let n = 1; existsSync(dir); n++) dir = join(parentDir, `${clean} ${n}`)
      await mkdir(dir, { recursive: true })
      return { path: this.rel(dir), name: basename(dir), depth: this.rel(dir).split('/').length - 1 }
    })
  }

  renameFolder(path: FolderPath, name: string): Promise<Folder> {
    return this.exclusive(async () => {
      const from = this.folderDir(path)
      const clean = name.replace(/[/\\:]/g, '-').trim()
      if (!clean) throw new Error('Folder name can’t be empty.')
      const to = join(dirname(from), clean)
      if (to !== from) {
        if (existsSync(to)) throw new Error(`A folder named “${clean}” already exists.`)
        await rename(from, to)
        await this.retrackPrefix(from, to)
      }
      return { path: this.rel(to), name: clean, depth: this.rel(to).split('/').length - 1 }
    })
  }

  private async retrackPrefix(from: string, to: string): Promise<void> {
    for (const abs of [...this.idsByPath.keys()]) {
      if (abs.startsWith(from + sep)) this.track(abs, to + abs.slice(from.length))
    }
    const fromRel = this.rel(from)
    const toRel = this.rel(to)
    this.meta.pinned = this.meta.pinned.map((p) => (p.startsWith(fromRel + '/') ? toRel + p.slice(fromRel.length) : p))
    await this.writeMeta()
  }

  /**
   * Like Apple Notes: the folder's notes (including subfolders) go to Recently
   * Deleted. Whatever else remains in the directory goes to the macOS Trash.
   */
  deleteFolder(path: FolderPath, trashItem: (abs: string) => Promise<void>): Promise<void> {
    return this.exclusive(async () => {
      if (!path) throw new Error('The default Notes folder can’t be deleted.')
      const dir = this.folderDir(path)
      const walk = async (current: string): Promise<void> => {
        for (const entry of await readdir(current, { withFileTypes: true })) {
          const abs = join(current, entry.name)
          if (entry.isDirectory()) await walk(abs)
          else if (entry.isFile() && NOTE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
            this.idFor(abs)
            await this.moveToTrash(abs)
          }
        }
      }
      await walk(dir)
      await trashItem(dir)
    })
  }
}
