import { ViewPlugin } from '@codemirror/view'
import { getCM } from '@replit/codemirror-vim'

interface Bookmark {
  cm: { cm6: { cm?: unknown } }
  find(): unknown
  clear(): void
}

let patched = false

/**
 * Vim's jump list (used by `gg`, `G`, `/`, `⌃o`…) is shared by all notes, but
 * its bookmarks belong to the Vim instance of the note they were made in, and
 * the editor gets a new one per note. Measured against another note they point
 * past its end, so the next jump threw and the key was lost or typed as text.
 * Bookmarks from an earlier note now count as gone, which Vim already skips.
 */
export const vimJumpsPerNote = ViewPlugin.define((view) => {
  const cm = getCM(view)
  if (cm && !patched) {
    patched = true
    const bookmark = cm.setBookmark({ line: 0, ch: 0 }) as unknown as Bookmark
    bookmark.clear()
    const proto = Object.getPrototypeOf(bookmark) as Bookmark
    const find = proto.find
    proto.find = function (this: Bookmark) {
      return this.cm.cm6.cm === this.cm ? find.call(this) : null
    }
  }
  return {}
})
