/** Человекочитаемый размер файла. */
export function formatSize(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value <= 0) return '—'

  const units = ['Б', 'КБ', 'МБ', 'ГБ']
  let size = value
  let index = 0
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024
    index += 1
  }

  const rounded = index === 0 ? Math.round(size) : Math.round(size * 10) / 10
  return `${rounded} ${units[index]}`
}
