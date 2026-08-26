const STORAGE_KEY = 'knowyou-entries'
const USER_KEY = 'knowyou-user'
const USERS_KEY = 'knowyou-users'

const API_BASE = '/api'

const sampleEntries = [
  {
    id: 'sample-1',
    title: 'A calm beginning',
    date: '2026-08-21',
    mood: 'happy',
    tags: ['gratitude', 'focus'],
    content:
      'Started the morning with a short walk and a quiet cup of tea. I felt more grounded and ready to tackle my priorities without rushing.',
  },
  {
    id: 'sample-2',
    title: 'Small wins',
    date: '2026-08-23',
    mood: 'powered',
    tags: ['progress', 'work'],
    content:
      'The project finally clicked today. I handled the tough part with patience and broke it into manageable steps. It reminded me that steady progress beats pressure.',
  },
  {
    id: 'sample-3',
    title: 'Need more rest',
    date: '2026-08-24',
    mood: 'reflective',
    tags: ['wellbeing', 'reset'],
    content:
      'I spent too much energy on things that did not matter. Tomorrow I want to plan my time better and protect space for rest, reflection, and recovery.',
  },
]

function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

function getUser() {
  const raw = localStorage.getItem(USER_KEY)
  return raw ? JSON.parse(raw) : null
}

function getStoredUsers() {
  const raw = localStorage.getItem(USERS_KEY)
  return raw ? JSON.parse(raw) : []
}

function saveStoredUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

function parseBody(options = {}) {
  if (!options.body) return {}

  try {
    return JSON.parse(options.body)
  } catch {
    return {}
  }
}

function localAuthFallback(path, options = {}) {
  if (!path || !['/signup', '/login', '/me', '/logout'].includes(path)) {
    return null
  }

  if (path === '/signup') {
    const body = parseBody(options)
    const { name, email, password } = body

    if (!name || !email || !password) {
      throw new Error('Please complete all fields.')
    }

    const users = getStoredUsers()
    const existingUser = users.find((user) => user.email.toLowerCase() === email.toLowerCase())

    if (existingUser) {
      throw new Error('An account with this email already exists.')
    }

    const user = { name, email, provider: 'local' }
    users.push({ ...user, password })
    saveStoredUsers(users)
    setUser(user)
    return { user }
  }

  if (path === '/login') {
    const body = parseBody(options)
    const { email, password } = body

    if (!email || !password) {
      throw new Error('Please enter your email and password.')
    }

    const users = getStoredUsers()
    const userRecord = users.find(
      (user) => user.email.toLowerCase() === email.toLowerCase() && user.password === password,
    )

    if (!userRecord) {
      throw new Error('Invalid email or password.')
    }

    const user = { name: userRecord.name, email: userRecord.email, provider: userRecord.provider || 'local' }
    setUser(user)
    return { user }
  }

  if (path === '/me') {
    const user = getUser()
    if (!user) {
      throw new Error('Please log in first.')
    }
    return { user }
  }

  if (path === '/logout') {
    localStorage.removeItem(USER_KEY)
    return { success: true }
  }

  return null
}

async function callApi(path, options = {}) {
  const requestOptions = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, requestOptions)
    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      const fallback = localAuthFallback(path, requestOptions)
      if (fallback) {
        return fallback
      }
      throw new Error(data.error || 'Something went wrong.')
    }

    return data
  } catch (error) {
    const fallback = localAuthFallback(path, requestOptions)
    if (fallback) {
      return fallback
    }

    if (error instanceof Error) {
      throw error
    }

    throw new Error('Something went wrong.')
  }
}

function handleLogin() {
  const form = document.querySelector('#login-form')
  if (!form) return

  form.addEventListener('submit', async (event) => {
    event.preventDefault()

    const email = document.querySelector('#email').value.trim()
    const password = document.querySelector('#password').value.trim()

    if (!email || !password) {
      alert('Please enter your email and password.')
      return
    }

    try {
      const data = await callApi('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })

      setUser(data.user)
      window.location.href = '/dashboard.html'
    } catch (error) {
      alert(error.message)
    }
  })

}

function handleSignup() {
  const form = document.querySelector('#signup-form')
  if (!form) return

  form.addEventListener('submit', async (event) => {
    event.preventDefault()

    const name = document.querySelector('#name').value.trim()
    const email = document.querySelector('#signup-email').value.trim()
    const password = document.querySelector('#signup-password').value.trim()
    const confirmPassword = document.querySelector('#confirm-password').value.trim()

    if (!name || !email || !password || !confirmPassword) {
      alert('Please complete all fields.')
      return
    }

    if (password !== confirmPassword) {
      alert('Passwords do not match.')
      return
    }

    try {
      const data = await callApi('/signup', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      })

      setUser(data.user)
      window.location.href = '/dashboard.html'
    } catch (error) {
      alert(error.message)
    }
  })

}

async function ensureAuth() {
  const localUser = getUser()
  if (!localUser) {
    try {
      const data = await callApi('/me')
      setUser(data.user)
      return true
    } catch (error) {
      window.location.href = '/index.html'
      return false
    }
  }
  return true
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`))
}

function getEntries() {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sampleEntries))
    return [...sampleEntries]
  }

  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length ? parsed : [...sampleEntries]
  } catch {
    return [...sampleEntries]
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

function calculateStreak(entries) {
  if (!entries.length) return 0

  const uniqueDates = [...new Set(entries.map((entry) => entry.date))]
  const today = new Date()
  let streak = 0
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate())

  while (true) {
    const iso = cursor.toISOString().slice(0, 10)
    if (uniqueDates.includes(iso)) {
      streak += 1
      cursor.setDate(cursor.getDate() - 1)
      continue
    }
    break
  }

  return streak
}

function getMoodMeta(mood) {
  const map = {
    happy: { label: 'Happy', emoji: '😊', accent: 'from-amber-400/20 to-orange-400/20' },
    calm: { label: 'Calm', emoji: '🌿', accent: 'from-emerald-400/20 to-teal-400/20' },
    reflective: { label: 'Reflective', emoji: '🫶', accent: 'from-violet-400/20 to-indigo-400/20' },
    powered: { label: 'Powered', emoji: '⚡', accent: 'from-yellow-400/20 to-amber-400/20' },
    tired: { label: 'Tired', emoji: '😴', accent: 'from-slate-400/20 to-slate-500/20' },
    grateful: { label: 'Grateful', emoji: '🙏', accent: 'from-rose-400/20 to-pink-400/20' },
  }

  return map[mood] || map.happy
}

function buildStats(entries) {
  const totals = {
    entries: entries.length,
    streak: `${calculateStreak(entries)} days`,
    words: entries.reduce((count, item) => count + item.content.split(/\s+/).filter(Boolean).length, 0),
    favorite: 'Calm',
  }

  const moods = entries.reduce((acc, entry) => {
    acc[entry.mood] = (acc[entry.mood] || 0) + 1
    return acc
  }, {})

  const favoriteMood = Object.entries(moods).sort((a, b) => b[1] - a[1])[0]
  if (favoriteMood) totals.favorite = getMoodMeta(favoriteMood[0]).label

  return totals
}

function renderDashboard() {
  const user = getUser()
  if (!user) return

  const userName = document.querySelector('#user-name')
  if (userName) userName.textContent = user.name || 'Reader'

  const logoutButton = document.querySelector('#logout-button')

  if (!logoutButton) return

  logoutButton.addEventListener('click', async () => {
    try {
      await fetch(`${API_BASE}/logout`, { method: 'POST' })
    } catch (error) {
      console.warn('Logout request failed:', error)
    }

    localStorage.removeItem(USER_KEY)
    window.location.href = '/index.html'
  })

  return

  let entries = getEntries()
  let searchValue = ''
  let filterValue = 'all'

  function renderStats() {
    const stats = buildStats(entries)
    statsGrid.innerHTML = [
      { label: 'Entries', value: stats.entries },
      { label: 'Streak', value: stats.streak },
      { label: 'Words', value: stats.words },
      { label: 'Favorite', value: stats.favorite },
    ]
      .map(
        (stat) => `
          <div class="rounded-3xl border border-white/10 bg-slate-800/80 p-4 shadow-lg">
            <p class="text-xs uppercase tracking-[0.2em] text-slate-400">${stat.label}</p>
            <p class="mt-3 text-3xl font-bold text-white">${stat.value}</p>
          </div>
        `,
      )
      .join('')
  }

  function renderEntries() {
    const filtered = entries.filter((entry) => {
      const matchesMood = filterValue === 'all' || entry.mood === filterValue
      const matchesSearch =
        !searchValue ||
        entry.title.toLowerCase().includes(searchValue) ||
        entry.content.toLowerCase().includes(searchValue) ||
        entry.tags.join(' ').toLowerCase().includes(searchValue)

      return matchesMood && matchesSearch
    })

    if (!filtered.length) {
      entriesList.innerHTML = `
        <div class="rounded-3xl border border-dashed border-white/10 bg-slate-800/40 p-10 text-center text-slate-300">
          <p class="text-xl font-semibold text-white">No entries found</p>
          <p class="mt-2">Try a different filter or write your first journal entry.</p>
        </div>
      `
      return
    }

    entriesList.innerHTML = filtered
      .map((entry) => {
        const meta = getMoodMeta(entry.mood)
        return `
          <article class="rounded-3xl border border-white/10 bg-slate-800/80 p-5">
            <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p class="text-xs uppercase tracking-[0.2em] text-slate-400">${formatDate(entry.date)}</p>
                <h3 class="mt-2 text-2xl font-semibold text-white">${entry.title}</h3>
              </div>
              <span class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200">
                <span>${meta.emoji}</span>
                ${meta.label}
              </span>
            </div>

            <p class="mt-4 leading-7 text-slate-200">${entry.content}</p>

            <div class="mt-4 flex flex-wrap gap-2">
              ${(entry.tags || ['daily']).map((tag) => `<span class="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1 text-xs text-violet-100">#${tag}</span>`).join('')}
            </div>

            <div class="mt-5 flex justify-end">
              <button class="delete-entry rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200" data-id="${entry.id}" type="button">Delete</button>
            </div>
          </article>
        `
      })
      .join('')

    document.querySelectorAll('.delete-entry').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.id
        entries = entries.filter((entry) => entry.id !== id)
        saveEntries(entries)
        render()
      })
    })
  }

  function render() {
    renderStats()
    renderEntries()
  }

  entryDate.value = new Date().toISOString().split('T')[0]

  entryForm.addEventListener('submit', (event) => {
    event.preventDefault()

    const title = document.querySelector('#entry-title').value.trim()
    const date = document.querySelector('#entry-date').value
    const mood = document.querySelector('#entry-mood').value
    const content = document.querySelector('#entry-content').value.trim()
    const tagsValue = document.querySelector('#entry-tags').value

    if (!title || !date || !content) {
      alert('Please fill out the title, date, and journal entry.')
      return
    }

    entries = [{
      id: crypto.randomUUID(),
      title,
      date,
      mood,
      tags: tagsValue ? tagsValue.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean) : ['daily'],
      content,
    }, ...entries]

    saveEntries(entries)
    entryForm.reset()
    entryDate.value = new Date().toISOString().split('T')[0]
    render()
  })

  searchInput.addEventListener('input', (event) => {
    searchValue = event.target.value.trim().toLowerCase()
    renderEntries()
  })

  moodFilter.addEventListener('change', (event) => {
    filterValue = event.target.value
    renderEntries()
  })

  logoutButton.addEventListener('click', async () => {
    try {
      await fetch(`${API_BASE}/logout`, { method: 'POST' })
    } catch (error) {
      console.warn('Logout request failed:', error)
    }

    localStorage.removeItem(USER_KEY)
    window.location.href = '/index.html'
  })

  render()
}

const featurePageConfig = {
  journals: { title: 'Journals' },
  diary: { title: 'Diary' },
  gratitude: { title: 'Gratitude list' },
  goals: { title: 'Goals' },
  analysis: { title: 'AI analysis' },
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function getStoredList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function saveStoredList(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function renderFeatureShell(page) {
  const config = featurePageConfig[page]
  const user = getUser()
  const root = document.querySelector('#feature-app')
  if (!config || !root) return null

  root.innerHTML = `
    <header class="mb-10 flex items-center justify-between border-b border-white/10 pb-5">
      <a href="/dashboard.html" class="text-sm text-slate-400 transition hover:text-white">&larr; Dashboard</a>
      <div class="flex items-center gap-3 text-sm">
        <span class="text-slate-300">${escapeHtml(user?.name || 'Reader')}</span>
        <button id="feature-logout" type="button" class="rounded-lg border border-white/10 px-3 py-2 text-slate-300 transition hover:border-violet-400 hover:text-white">Log out</button>
      </div>
    </header>
    <main>
      <div class="mb-8">
        <h1 class="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">${config.title}</h1>
      </div>
      <div id="feature-content"></div>
    </main>
  `

  document.querySelector('#feature-logout')?.addEventListener('click', async () => {
    try {
      await fetch(`${API_BASE}/logout`, { method: 'POST' })
    } catch (error) {
      console.warn('Logout request failed:', error)
    }
    localStorage.removeItem(USER_KEY)
    window.location.href = '/index.html'
  })

  return document.querySelector('#feature-content')
}

function renderJournals(root) {
  const key = STORAGE_KEY
  let entries = getStoredList(key)
  if (!entries.length) entries = getEntries()

  root.innerHTML = `
    <div class="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <form id="journal-form" class="rounded-2xl border border-white/10 bg-slate-900 p-5">
        <h2 class="mb-5 text-lg font-semibold">New journal entry</h2>
        <div class="space-y-4">
          <input id="journal-title" required placeholder="Title" class="w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none" />
          <div class="grid grid-cols-2 gap-3">
            <input id="journal-date" type="date" required class="rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-white focus:border-violet-400 focus:outline-none" />
            <select id="journal-mood" class="rounded-xl border border-white/10 bg-slate-800 px-3 py-3 text-white focus:border-violet-400 focus:outline-none"><option>happy</option><option>calm</option><option>reflective</option><option>powered</option><option>tired</option><option>grateful</option></select>
          </div>
          <textarea id="journal-content" rows="8" required placeholder="Write what is on your mind..." class="w-full resize-y rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"></textarea>
          <button class="w-full rounded-xl bg-violet-500 px-4 py-3 font-semibold transition hover:bg-violet-400">Save entry</button>
        </div>
      </form>
      <section><div id="journal-list" class="space-y-3"></div></section>
    </div>`
  document.querySelector('#journal-date').value = new Date().toISOString().slice(0, 10)

  const render = () => {
    document.querySelector('#journal-list').innerHTML = entries.length
      ? entries.map((entry) => `<article class="rounded-2xl border border-white/10 bg-slate-900 p-5"><div class="flex items-start justify-between gap-4"><div><p class="text-xs uppercase tracking-wider text-slate-500">${escapeHtml(entry.date)}</p><h3 class="mt-1 text-lg font-semibold">${escapeHtml(entry.title)}</h3></div><button data-delete="${escapeHtml(entry.id)}" class="text-sm text-rose-300 hover:text-rose-200">Delete</button></div><p class="mt-3 whitespace-pre-wrap text-slate-300">${escapeHtml(entry.content)}</p></article>`).join('')
      : '<p class="rounded-2xl border border-dashed border-white/10 p-8 text-center text-slate-500">Your journal is empty.</p>'
    document.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', () => { entries = entries.filter((entry) => entry.id !== button.dataset.delete); saveStoredList(key, entries); render() }))
  }
  document.querySelector('#journal-form').addEventListener('submit', (event) => {
    event.preventDefault()
    entries.unshift({ id: crypto.randomUUID(), title: document.querySelector('#journal-title').value.trim(), date: document.querySelector('#journal-date').value, mood: document.querySelector('#journal-mood').value, tags: [], content: document.querySelector('#journal-content').value.trim() })
    saveStoredList(key, entries)
    event.target.reset()
    document.querySelector('#journal-date').value = new Date().toISOString().slice(0, 10)
    render()
  })
  render()
}

function renderDiary(root) {
  const key = 'knowyou-diary'
  let notes = getStoredList(key)
  root.innerHTML = `<form id="diary-form" class="mb-6 rounded-2xl border border-white/10 bg-slate-900 p-5"><div class="flex flex-col gap-3 sm:flex-row"><input id="diary-date" type="date" required class="rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-white focus:border-cyan-400 focus:outline-none" /><input id="diary-note" required placeholder="A note about today" class="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none" /><button class="rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300">Add note</button></div></form><div id="diary-list" class="space-y-3"></div>`
  document.querySelector('#diary-date').value = new Date().toISOString().slice(0, 10)
  const render = () => { document.querySelector('#diary-list').innerHTML = notes.length ? notes.map((note) => `<article class="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900 p-5"><div><p class="text-xs uppercase tracking-wider text-cyan-300">${escapeHtml(note.date)}</p><p class="mt-1 text-slate-200">${escapeHtml(note.text)}</p></div><button data-diary-delete="${escapeHtml(note.id)}" class="text-sm text-rose-300">Delete</button></article>`).join('') : '<p class="rounded-2xl border border-dashed border-white/10 p-8 text-center text-slate-500">No diary notes yet.</p>'; document.querySelectorAll('[data-diary-delete]').forEach((button) => button.addEventListener('click', () => { notes = notes.filter((note) => note.id !== button.dataset.diaryDelete); saveStoredList(key, notes); render() })) }
  document.querySelector('#diary-form').addEventListener('submit', (event) => { event.preventDefault(); notes.unshift({ id: crypto.randomUUID(), date: document.querySelector('#diary-date').value, text: document.querySelector('#diary-note').value.trim() }); saveStoredList(key, notes); event.target.reset(); document.querySelector('#diary-date').value = new Date().toISOString().slice(0, 10); render() })
  render()
}

function renderGratitude(root) {
  const key = 'knowyou-gratitude'
  let items = getStoredList(key)
  root.innerHTML = `<form id="gratitude-form" class="mb-6 flex gap-3 rounded-2xl border border-white/10 bg-slate-900 p-5"><input id="gratitude-item" required placeholder="What are you grateful for?" class="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none" /><button class="rounded-xl bg-amber-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-amber-300">Add</button></form><ul id="gratitude-list" class="space-y-3"></ul>`
  const render = () => { document.querySelector('#gratitude-list').innerHTML = items.length ? items.map((item) => `<li class="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900 p-4"><input type="checkbox" ${item.done ? 'checked' : ''} data-gratitude-check="${escapeHtml(item.id)}" class="h-4 w-4 accent-amber-400" /><span class="flex-1 ${item.done ? 'text-slate-500 line-through' : 'text-slate-200'}">${escapeHtml(item.text)}</span><button data-gratitude-delete="${escapeHtml(item.id)}" class="text-sm text-rose-300">Delete</button></li>`).join('') : '<li class="rounded-2xl border border-dashed border-white/10 p-8 text-center text-slate-500">Your gratitude list is empty.</li>'; document.querySelectorAll('[data-gratitude-check]').forEach((input) => input.addEventListener('change', () => { const item = items.find((entry) => entry.id === input.dataset.gratitudeCheck); item.done = input.checked; saveStoredList(key, items); render() })); document.querySelectorAll('[data-gratitude-delete]').forEach((button) => button.addEventListener('click', () => { items = items.filter((item) => item.id !== button.dataset.gratitudeDelete); saveStoredList(key, items); render() })) }
  document.querySelector('#gratitude-form').addEventListener('submit', (event) => { event.preventDefault(); items.unshift({ id: crypto.randomUUID(), text: document.querySelector('#gratitude-item').value.trim(), done: false }); saveStoredList(key, items); event.target.reset(); render() })
  render()
}

function renderGoals(root) {
  const key = 'knowyou-goals'
  let goals = getStoredList(key)
  root.innerHTML = `<form id="goal-form" class="mb-6 grid gap-3 rounded-2xl border border-white/10 bg-slate-900 p-5 sm:grid-cols-[1fr_1fr_auto]"><input id="goal-title" required placeholder="Goal title" class="rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none" /><input id="goal-due" type="date" class="rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-white focus:border-emerald-400 focus:outline-none" /><button class="rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300">Add goal</button><textarea id="goal-details" placeholder="Details (optional)" class="rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none sm:col-span-3"></textarea></form><div id="goal-list" class="grid gap-3"></div>`
  const render = () => { document.querySelector('#goal-list').innerHTML = goals.length ? goals.map((goal) => `<article class="rounded-2xl border border-white/10 bg-slate-900 p-5"><div class="flex items-start justify-between gap-4"><div><h2 class="font-semibold">${escapeHtml(goal.title)}</h2><p class="mt-1 text-sm text-slate-400">${escapeHtml(goal.details || 'No details')}${goal.due ? ` · Due ${escapeHtml(goal.due)}` : ''}</p></div><button data-goal-delete="${escapeHtml(goal.id)}" class="text-sm text-rose-300">Delete</button></div><div class="mt-4 flex items-center gap-3"><input type="range" min="0" max="100" value="${goal.progress}" data-goal-progress="${escapeHtml(goal.id)}" class="flex-1 accent-emerald-400" /><span class="w-10 text-right text-sm text-emerald-300">${goal.progress}%</span></div></article>`).join('') : '<p class="rounded-2xl border border-dashed border-white/10 p-8 text-center text-slate-500">Set your first goal.</p>'; document.querySelectorAll('[data-goal-progress]').forEach((input) => input.addEventListener('input', () => { const goal = goals.find((entry) => entry.id === input.dataset.goalProgress); goal.progress = Number(input.value); saveStoredList(key, goals); render() })); document.querySelectorAll('[data-goal-delete]').forEach((button) => button.addEventListener('click', () => { goals = goals.filter((goal) => goal.id !== button.dataset.goalDelete); saveStoredList(key, goals); render() })) }
  document.querySelector('#goal-form').addEventListener('submit', (event) => { event.preventDefault(); goals.unshift({ id: crypto.randomUUID(), title: document.querySelector('#goal-title').value.trim(), details: document.querySelector('#goal-details').value.trim(), due: document.querySelector('#goal-due').value, progress: 0 }); saveStoredList(key, goals); event.target.reset(); render() })
  render()
}

function renderAnalysis(root) {
  root.innerHTML = `<section class="rounded-2xl border border-white/10 bg-slate-900 p-5"><div class="flex flex-col gap-4 sm:flex-row sm:items-end"><label class="flex-1 text-sm text-slate-400">Add a question or focus (optional)<textarea id="analysis-focus" rows="3" placeholder="What patterns should I reflect on?" class="mt-2 w-full rounded-xl border border-white/10 bg-slate-800 px-4 py-3 text-white placeholder:text-slate-500 focus:border-rose-400 focus:outline-none"></textarea></label><button id="analyze-button" class="rounded-xl bg-rose-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-rose-300">Analyze my content</button></div><div id="analysis-result" class="mt-6 hidden rounded-xl border border-rose-400/20 bg-rose-400/5 p-5"></div></section>`
  document.querySelector('#analyze-button').addEventListener('click', () => {
    const entries = getEntries()
    const diary = getStoredList('knowyou-diary')
    const gratitude = getStoredList('knowyou-gratitude')
    const goals = getStoredList('knowyou-goals')
    const words = entries.reduce((count, entry) => count + entry.content.split(/\s+/).filter(Boolean).length, 0)
    const moods = entries.reduce((counts, entry) => { counts[entry.mood] = (counts[entry.mood] || 0) + 1; return counts }, {})
    const commonMood = Object.entries(moods).sort((a, b) => b[1] - a[1])[0]?.[0] || 'not enough data'
    const focus = document.querySelector('#analysis-focus').value.trim()
    document.querySelector('#analysis-result').classList.remove('hidden')
    document.querySelector('#analysis-result').innerHTML = `<h2 class="text-lg font-semibold">Your reflection snapshot</h2><p class="mt-3 text-slate-300">You have ${entries.length} journal entries, ${diary.length} diary notes, ${gratitude.length} gratitude items, and ${goals.length} goals saved. Your most common journal mood is <strong class="text-rose-300">${escapeHtml(commonMood)}</strong>, across ${words} words.</p><p class="mt-3 text-slate-400">${focus ? `You asked to focus on: ${escapeHtml(focus)}` : 'Keep writing regularly to make this snapshot more meaningful.'}</p>`
  })
}

function handleFeaturePage(page) {
  ensureAuth().then((allowed) => {
    if (!allowed) return
    const root = renderFeatureShell(page)
    if (!root) return
    if (page === 'journals') renderJournals(root)
    if (page === 'diary') renderDiary(root)
    if (page === 'gratitude') renderGratitude(root)
    if (page === 'goals') renderGoals(root)
    if (page === 'analysis') renderAnalysis(root)
  })
}

const currentPath = window.location.pathname

if (currentPath.endsWith('/index.html') || currentPath === '/') {
  handleLogin()
}

if (currentPath.endsWith('/signup.html')) {
  handleSignup()
}

if (currentPath.endsWith('/dashboard.html')) {
  ensureAuth().then((allowed) => {
    if (allowed) {
      renderDashboard()
    }
  })
}

const featurePath = Object.keys(featurePageConfig).find((page) => currentPath.endsWith(`/${page}.html`))
if (featurePath) handleFeaturePage(featurePath)
