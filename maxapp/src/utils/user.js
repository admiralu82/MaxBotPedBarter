/** Отображаемое имя пользователя: Фамилия Имя, иначе username, иначе id. */
export function displayUserName(user) {
  if (!user) return ''

  const full = [user.last_name, user.first_name].filter(Boolean).join(' ')
  return full || user.username || `Пользователь ${user.user_id}`
}

/**
 * Автор материала: бэкенд отдаёт его плоскими полями author_* из JOIN,
 * поэтому приходится собирать объект вручную.
 */
export function noteAuthor(note) {
  if (!note || !note.author_username && !note.author_first_name && !note.author_last_name) {
    return null
  }

  return {
    user_id: note.user_id,
    username: note.author_username,
    first_name: note.author_first_name,
    last_name: note.author_last_name,
    avatar_url: note.author_avatar_url,
  }
}
