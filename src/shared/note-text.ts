const MAX_TITLE_LENGTH = 100

function meaningfulLines(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

/** Apple Notes uses the first non-empty line as the note's title. */
export function noteTitle(content: string): string {
  const [first] = meaningfulLines(content)
  return first ? first.slice(0, MAX_TITLE_LENGTH) : 'New Note'
}

/** The text shown under the title in the notes list. */
export function notePreview(content: string): string {
  const [, ...rest] = meaningfulLines(content)
  return rest.join(' ').slice(0, 200) || 'No additional text'
}
