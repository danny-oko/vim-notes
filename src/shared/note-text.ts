const MAX_TITLE_LENGTH = 100

/**
 * A line as it reads without its Markdown styling: `# Title` → `Title`,
 * `**bold** and <u>underline</u>` → `bold and underline`. Lists are kept.
 */
export function plainLine(line: string): string {
  return line
    .replace(/^(\s*)(?:> ?)*(?:#{1,6} +)?/, '$1')
    .replace(/<\/?u>/gi, '')
    .replace(/(\*\*|__|~~|==)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/(?<![\w*])([*_`])(?=[^\s*_])(.+?)(?<=[^\s*_])\1(?![\w*])/g, '$2')
}

function meaningfulLines(content: string): string[] {
  return content
    .split('\n')
    .map((line) => plainLine(line).trim())
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

/**
 * Removes what nobody needs in a saved note: spaces at the ends of lines and
 * blank lines before the first and after the last line of text.
 */
export function tidyNote(content: string): string {
  return content
    .replace(/[ \t]+$/gm, '')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '')
}
