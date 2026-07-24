import { useEffect, useState, useCallback, type FormEvent } from 'react'
import { supabase } from '../supabaseClient'
import type { Tutor } from '../types'
import { DAY_NAMES, formatTime, toDateKey } from '../lib/dates'

const AUTH_KEY = 'classlink_admin_auth'
const TUTOR_PASSWORD = import.meta.env.VITE_TUTOR_PASSWORD
console.log('[DEBUG] VITE_TUTOR_PASSWORD length at load:', TUTOR_PASSWORD?.length)

interface BookingRow {
  id: string
  booking_date: string
  status: string
  students: { name: string } | null
  time_slots: { day_of_week: number; start_time: string; end_time: string } | null
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    console.log('[DEBUG] entered password length:', password.length, '| expected password length:', TUTOR_PASSWORD?.length)
    if (password === TUTOR_PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, 'true')
      onSuccess()
    } else {
      setError('Incorrect password.')
    }
  }

  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 360, margin: '80px auto 0' }}>
        <h1>ClassLink Admin</h1>
        <p className="muted">Enter the tutor password to continue.</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn" style={{ width: '100%' }}>
            Log in
          </button>
        </form>
      </div>
    </div>
  )
}

export default function Admin() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(AUTH_KEY) === 'true')

  if (!authed) {
    return <LoginForm onSuccess={() => setAuthed(true)} />
  }

  return <Dashboard />
}

function Dashboard() {
  const [tutor, setTutor] = useState<Tutor | null>(null)
  const [tutorLoading, setTutorLoading] = useState(true)
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(true)

  const [dayOfWeek, setDayOfWeek] = useState('1')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [slotError, setSlotError] = useState('')
  const [slotSaving, setSlotSaving] = useState(false)
  const [slotSuccess, setSlotSuccess] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    async function loadTutor() {
      setTutorLoading(true)
      const { data } = await supabase
        .from('tutors')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      setTutor(data)
      setTutorLoading(false)
    }
    loadTutor()
  }, [])

  const loadBookings = useCallback(async (tutorId: string) => {
    setBookingsLoading(true)
    const today = toDateKey(new Date())
    const { data } = await supabase
      .from('bookings')
      .select('id, booking_date, status, students(name), time_slots(day_of_week, start_time, end_time)')
      .eq('tutor_id', tutorId)
      .gte('booking_date', today)
      .order('booking_date', { ascending: true })
    setBookings((data as unknown as BookingRow[]) ?? [])
    setBookingsLoading(false)
  }, [])

  useEffect(() => {
    if (!tutor) return
    loadBookings(tutor.id)

    const channel = supabase
      .channel(`bookings-admin-${tutor.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `tutor_id=eq.${tutor.id}` },
        () => loadBookings(tutor.id),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tutor, loadBookings])

  async function handleAddSlot(e: FormEvent) {
    e.preventDefault()
    if (!tutor) return
    setSlotError('')
    setSlotSuccess(false)

    if (startTime >= endTime) {
      setSlotError('End time must be after start time.')
      return
    }

    setSlotSaving(true)
    const { error } = await supabase.from('time_slots').insert({
      tutor_id: tutor.id,
      day_of_week: Number(dayOfWeek),
      start_time: startTime,
      end_time: endTime,
      is_recurring: true,
    })
    setSlotSaving(false)

    if (error) {
      setSlotError(error.message)
    } else {
      setSlotSuccess(true)
    }
  }

  function handleLogout() {
    sessionStorage.removeItem(AUTH_KEY)
    window.location.reload()
  }

  const bookingLink = tutor ? `${window.location.origin}/book/${tutor.id}` : ''

  function copyLink() {
    if (!bookingLink) return
    navigator.clipboard.writeText(bookingLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (tutorLoading) {
    return (
      <div className="page">
        <p className="muted">Loading...</p>
      </div>
    )
  }

  if (!tutor) {
    return (
      <div className="page">
        <div className="card">
          <h1>No tutor profile found</h1>
          <p className="muted">
            Add a row to the <code>tutors</code> table in Supabase to get started.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>ClassLink Admin</h1>
        <button className="btn btn-outline" onClick={handleLogout}>
          Log out
        </button>
      </div>
      <p className="muted">Welcome, {tutor.name}</p>

      <div className="card">
        <h2>Your booking link</h2>
        <p className="muted">Share this link with students so they can book a session.</p>
        <div className="link-box">
          <input readOnly value={bookingLink} onFocus={(e) => e.target.select()} />
          <button className="btn" onClick={copyLink}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Add a weekly time slot</h2>
        <form onSubmit={handleAddSlot}>
          <div className="row">
            <div className="field">
              <label htmlFor="day">Day of week</label>
              <select id="day" value={dayOfWeek} onChange={(e) => setDayOfWeek(e.target.value)}>
                {DAY_NAMES.map((name, idx) => (
                  <option key={idx} value={idx}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="start">Start time</label>
              <input
                id="start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="end">End time</label>
              <input
                id="end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
          {slotError && <p className="error">{slotError}</p>}
          {slotSuccess && <p style={{ color: 'var(--success)', fontSize: 14 }}>Slot added!</p>}
          <button type="submit" className="btn" disabled={slotSaving}>
            {slotSaving ? 'Adding...' : 'Add slot'}
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Upcoming bookings</h2>
        {bookingsLoading ? (
          <p className="muted">Loading...</p>
        ) : bookings.length === 0 ? (
          <p className="muted">No upcoming bookings yet.</p>
        ) : (
          bookings.map((b) => (
            <div className="booking-item" key={b.id}>
              <div>
                <strong>{b.students?.name ?? 'Unknown student'}</strong>
                <div className="muted">
                  {b.booking_date}
                  {b.time_slots
                    ? ` · ${formatTime(b.time_slots.start_time)} - ${formatTime(b.time_slots.end_time)}`
                    : ''}
                </div>
              </div>
              <span className="muted">{b.status}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}