import {
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  search,
  SearchQuery,
  setSearchQuery
} from '@codemirror/search'
import type { Extension } from '@codemirror/state'
import type { EditorView, Panel, ViewUpdate } from '@codemirror/view'
import type { MenuCommand } from '@shared/types'
import { shortcutLabel } from '@/lib/keybindings'

const MAX_COUNTED_MATCHES = 1000

function withShortcut(label: string, command: MenuCommand): string {
  const key = shortcutLabel(command)
  return key ? `${label} (${key})` : label
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

/** “3 of 12” for the current query and cursor position. */
function matchStatus(view: EditorView): string {
  const query = getSearchQuery(view.state)
  if (!query.search || !query.valid) return ''
  const head = view.state.selection.main.from
  const cursor = query.getCursor(view.state)
  let total = 0
  let current = 0
  for (let next = cursor.next(); !next.done && total < MAX_COUNTED_MATCHES; next = cursor.next()) {
    total++
    if (next.value.from <= head) current = total
  }
  if (total === 0) return 'Not found'
  return `${current || 1} of ${total >= MAX_COUNTED_MATCHES ? `${MAX_COUNTED_MATCHES}+` : total}`
}

/** A compact, single-row find bar in the style of Apple Notes (⌘F). */
function createFindBar(view: EditorView): Panel {
  const input = element('input', {
    type: 'search',
    placeholder: 'Find in Note',
    value: getSearchQuery(view.state).search,
    spellcheck: false,
    className: 'find-bar-input'
  })
  input.setAttribute('main-field', 'true')
  const status = element('span', { className: 'find-bar-status' })
  const button = (label: string, title: string, run: () => void): HTMLButtonElement =>
    element('button', { type: 'button', title, className: 'find-bar-button', onclick: run }, label)

  const refresh = (): void => {
    status.textContent = matchStatus(view)
  }
  const setQuery = (): void => {
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: input.value })) })
    findNext(view)
    refresh()
  }

  input.addEventListener('input', setQuery)
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (event.shiftKey) findPrevious(view)
      else findNext(view)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      closeSearchPanel(view)
    }
  })

  const dom = element(
    'div',
    { className: 'find-bar' },
    input,
    button('‹', withShortcut('Previous', 'find-previous'), () => findPrevious(view)),
    button('›', withShortcut('Next', 'find-next'), () => findNext(view)),
    status,
    button('Done', 'Close (Esc)', () => closeSearchPanel(view))
  )

  return {
    dom,
    top: true,
    mount: () => {
      input.select()
      refresh()
    },
    update: (update: ViewUpdate) => {
      if (update.docChanged || update.selectionSet || update.transactions.some((tr) => tr.effects.some((e) => e.is(setSearchQuery))))
        refresh()
    }
  }
}

export function findBar(): Extension {
  return search({ top: true, createPanel: createFindBar })
}
