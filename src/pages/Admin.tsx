import { useEffect, useState, useCallback, useRef, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import type { AuthedTutor, SessionType, TimeSlot } from '../types'
import { DAY_NAMES, formatFullDateLabel, formatTime, parseDateKey, toDateKey } from '../lib/dates'
import { Logo } from '../components/Logo'
import { IconLink, IconClock, IconUsers, IconCopy, IconCheck, IconLogout, IconTrash } from '../components/icons'
import { AdminPanel } from '../components/AdminPanel'

const TUTOR_ID_KEY = 'classlink_tutor_id'

interface BookingRow {
  id: string
  booking_date: string
  status: string
  students: { name: string; contact: string } | null
  time_slots: { day_of_week: number; start_time: string; end_time: string } | null
}

function LoginForm({ onSuccess }: { onSuccess: (tutor: AuthedTutor) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (!username.trim() || !password) {
      setError('Enter your username and password.')
      return
    }

    setSubmitting(true)
    const { data, error: queryError } = await supabase
      .from('tutors')
      .select('id, name, subject, contact, is_admin')
      .eq('username', username.trim())
      .eq('password', password)
      .maybeSingle()
    setSubmitting(false)

    if (queryError || !data) {
      setError('Incorrect username or password.')
      return
    }

    sessionStorage.setItem(TUTOR_ID_KEY, data.id)
    onSuccess(data as AuthedTutor)
  }

  return (
    <div className="auth-bg">
      <div className="glow-blob blob-1" />
      <div className="glow-blob blob-2" />
      <div className="card fade-slide-in" style={{ maxWidth: 380, width: '100%', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <Logo size={44} showText={false} />
        </div>
        <h1>ClassLink</h1>
        <p className="muted" style={{ marginBottom: 20 }}>
          Log in to your account
        </p>
        <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn" disabled={submitting} style={{ width: '100%', justifyContent: 'center' }}>
            {submitting ? 'Logging in...' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function Admin() {
  const navigate = useNavigate()
  const location = useLocation()
  const [tutorId, setTutorId] = useState<string | null>(() => sessionStorage.getItem(TUTOR_ID_KEY))
  const [tutor, setTutor] = useState<AuthedTutor | null>(null)
  const [resolving, setResolving] = useState(!!tutorId)

  useEffect(() => {
    if (!tutor) return
    const targetPath = tutor.is_admin ? '/admin-panel' : '/dashboard'
    if (location.pathname !== targetPath) {
      navigate(targetPath, { replace: true })
    }
  }, [tutor, location.pathname, navigate])

  useEffect(() => {
    if (!tutorId) return
    let cancelled = false

    async function loadTutor(id: string) {
      setResolving(true)
      const { data } = await supabase
        .from('tutors')
        .select('id, name, subject, contact, is_admin')
        .eq('id', id)
        .maybeSingle()

      if (cancelled) return
      if (!data) {
        sessionStorage.removeItem(TUTOR_ID_KEY)
        setTutorId(null)
        setTutor(null)
      } else {
        setTutor(data as AuthedTutor)
      }
      setResolving(false)
    }

    loadTutor(tutorId)
    return () => {
      cancelled = true
    }
  }, [tutorId])

  function handleLogout() {
    sessionStorage.removeItem(TUTOR_ID_KEY)
    window.location.href = '/login'
  }

  if (!tutorId) {
    return (
      <LoginForm
        onSuccess={(loggedInTutor) => {
          setTutorId(loggedInTutor.id)
          setTutor(loggedInTutor)
        }}
      />
    )
  }

  if (resolving || !tutor) {
    return (
      <div className="app-bg">
        <div className="glow-blob blob-1 fixed" />
        <div className="glow-blob blob-2 fixed" />
        <div className="page">
          <div className="topbar">
            <Logo />
          </div>
          <p className="muted">Loading...</p>
        </div>
      </div>
    )
  }

  return <Dashboard tutor={tutor} onLogout={handleLogout} />
}

function playBookingNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioContextClass()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    oscillator.start()
    oscillator.stop(ctx.currentTime + 0.35)
    oscillator.onended = () => ctx.close()
    console.log('[booking-notify] playBookingNotificationSound: AudioContext state =', ctx.state)
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => console.log('[booking-notify] AudioContext resumed'))
    }
  } catch (err) {
    console.log('[booking-notify] playBookingNotificationSound failed:', err)
  }
}

function Dashboard({ tutor, onLogout }: { tutor: AuthedTutor; onLogout: () => void }) {
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(true)
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set())
  const [headerPulse, setHeaderPulse] = useState(false)
  const knownBookingIds = useRef<Set<string>>(new Set())
  const firstBookingsLoad = useRef(true)
  const isMounted = useRef(true)

  useEffect(() => {
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    if (tutor.is_admin) return
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [tutor.is_admin])

  const [dayOfWeek, setDayOfWeek] = useState('1')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [slotError, setSlotError] = useState('')
  const [slotSaving, setSlotSaving] = useState(false)
  const [slotSuccess, setSlotSuccess] = useState(false)
  const [copied, setCopied] = useState(false)

  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [timeSlotsLoading, setTimeSlotsLoading] = useState(true)
  const [slotsListError, setSlotsListError] = useState('')
  const [updatingSlotId, setUpdatingSlotId] = useState<string | null>(null)
  const [deletingSlotId, setDeletingSlotId] = useState<string | null>(null)
  const timeSlotsRequestId = useRef(0)

  const loadTimeSlots = useCallback(async (tutorId: string) => {
    const requestId = ++timeSlotsRequestId.current
    setTimeSlotsLoading(true)
    console.log('[timeslots] loadTimeSlots: request', requestId, 'started for tutor', tutorId)
    const { data, error } = await supabase
      .from('time_slots')
      .select('*')
      .eq('tutor_id', tutorId)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true })

    if (requestId !== timeSlotsRequestId.current) {
      console.log('[timeslots] loadTimeSlots: request', requestId, 'is stale (latest is', timeSlotsRequestId.current, ') — ignoring response')
      return
    }

    if (error) {
      console.log('[timeslots] loadTimeSlots: request', requestId, 'FAILED — keeping existing list instead of clearing it:', error.message)
      setSlotsListError(error.message)
      setTimeSlotsLoading(false)
      return
    }

    console.log('[timeslots] loadTimeSlots: request', requestId, 'resolved with', data?.length ?? 0, 'slot(s):', data?.map((s) => s.id))
    setTimeSlots((data as TimeSlot[]) ?? [])
    setTimeSlotsLoading(false)
  }, [])

  useEffect(() => {
    if (tutor.is_admin) return
    loadTimeSlots(tutor.id)
  }, [tutor.id, tutor.is_admin, loadTimeSlots])

  const loadBookings = useCallback(async (tutorId: string) => {
    setBookingsLoading(true)
    const today = toDateKey(new Date())
    const { data } = await supabase
      .from('bookings')
      .select('id, booking_date, status, students(name, contact), time_slots(day_of_week, start_time, end_time)')
      .eq('tutor_id', tutorId)
      .gte('booking_date', today)
      .order('booking_date', { ascending: true })
    const rows = (data as unknown as BookingRow[]) ?? []

    if (firstBookingsLoad.current) {
      firstBookingsLoad.current = false
      console.log('[booking-notify] loadBookings: first load, establishing baseline of', rows.length, 'booking(s) — no notification on this pass')
    } else {
      const newlyArrivedIds = rows
        .filter((r) => !knownBookingIds.current.has(r.id))
        .map((r) => r.id)
      console.log('[booking-notify] loadBookings: reload triggered, newlyArrivedIds =', newlyArrivedIds)
      if (newlyArrivedIds.length > 0 && isMounted.current) {
        setHighlightIds(new Set(newlyArrivedIds))
        setHeaderPulse(true)
        setTimeout(() => {
          if (isMounted.current) setHighlightIds(new Set())
        }, 2000)
        setTimeout(() => {
          if (isMounted.current) setHeaderPulse(false)
        }, 700)

        console.log('[booking-notify] new booking(s) detected, about to play sound + show notification')
        playBookingNotificationSound()

        console.log('[booking-notify] typeof Notification =', typeof Notification, ', Notification.permission =', typeof Notification !== 'undefined' ? Notification.permission : 'n/a')
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const newRows = rows.filter((r) => newlyArrivedIds.includes(r.id))
          newRows.forEach((row) => {
            const studentName = row.students?.name ?? 'Unknown student'
            const dayLabel = row.time_slots ? DAY_NAMES[row.time_slots.day_of_week] : ''
            const timeLabel = row.time_slots ? formatTime(row.time_slots.start_time) : ''
            const message = `New booking: ${studentName} - ${dayLabel} ${timeLabel}`.trim()
            console.log('[booking-notify] calling new Notification() with message:', message)
            new Notification(message)
          })
        } else {
          console.log('[booking-notify] SKIPPED showing Notification — permission is not "granted"')
        }
      }
    }
    knownBookingIds.current = new Set(rows.map((r) => r.id))

    setBookings(rows)
    setBookingsLoading(false)
  }, [])

  useEffect(() => {
    if (tutor.is_admin) return

    loadBookings(tutor.id)

    const channel = supabase
      .channel(`bookings-admin-${tutor.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings', filter: `tutor_id=eq.${tutor.id}` },
        (payload) => {
          console.log('[booking-notify] postgres_changes event received:', payload.eventType, payload)
          loadBookings(tutor.id)
        },
      )
      .subscribe((status) => {
        console.log('[booking-notify] Realtime channel status:', status)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tutor.id, tutor.is_admin, loadBookings])

  async function handleAddSlot(e: FormEvent) {
    e.preventDefault()
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
      loadTimeSlots(tutor.id)
    }
  }

  async function handleSessionTypeChange(slotId: string, sessionType: SessionType) {
    console.log('[timeslots] handleSessionTypeChange: dropdown changed for slot', slotId, '-> requesting update to', sessionType, '(this path never deletes)')
    setSlotsListError('')
    setUpdatingSlotId(slotId)

    // Remember only this row's previous value (not a snapshot of the whole array) so a
    // failed update can revert this one row without clobbering any other concurrent edit.
    const previousType = timeSlots.find((s) => s.id === slotId)?.session_type

    setTimeSlots((prev) => {
      const next = prev.map((s) => (s.id === slotId ? { ...s, session_type: sessionType } : s))
      console.log('[timeslots] handleSessionTypeChange: optimistic update, count before =', prev.length, 'after =', next.length)
      return next
    })

    const { error } = await supabase.from('time_slots').update({ session_type: sessionType }).eq('id', slotId)
    setUpdatingSlotId(null)
    console.log('[timeslots] handleSessionTypeChange: update response for slot', slotId, '- error:', error)

    if (error) {
      if (previousType) {
        setTimeSlots((prev) => prev.map((s) => (s.id === slotId ? { ...s, session_type: previousType } : s)))
      }
      setSlotsListError(error.message)
    }
  }

  async function handleDeleteSlot(slotId: string) {
    console.log('[timeslots] handleDeleteSlot: trash button clicked for slot', slotId)
    if (!window.confirm('Delete this time slot? Students will no longer be able to book it.')) {
      console.log('[timeslots] handleDeleteSlot: delete cancelled by tutor')
      return
    }

    setSlotsListError('')
    setDeletingSlotId(slotId)

    // Remember only the removed row itself so a failed delete can restore just that row
    // without clobbering any other concurrent edit made to the rest of the list.
    const removedSlot = timeSlots.find((s) => s.id === slotId)

    setTimeSlots((prev) => {
      const next = prev.filter((s) => s.id !== slotId)
      console.log('[timeslots] handleDeleteSlot: removing slot', slotId, 'from local list, count before =', prev.length, 'after =', next.length)
      return next
    })

    const { error } = await supabase.from('time_slots').delete().eq('id', slotId)
    setDeletingSlotId(null)
    console.log('[timeslots] handleDeleteSlot: delete response for slot', slotId, '- error:', error)

    if (error) {
      if (removedSlot) {
        setTimeSlots((prev) =>
          prev.some((s) => s.id === slotId)
            ? prev
            : [...prev, removedSlot].sort(
                (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time),
              ),
        )
      }
      setSlotsListError(error.message)
    }
  }

  const bookingLink = `${window.location.origin}/book/${tutor.id}`

  function copyLink() {
    navigator.clipboard.writeText(bookingLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="app-bg">
      <div className="glow-blob blob-1 fixed" />
      <div className="glow-blob blob-2 fixed" />
      <div className="page stagger-parent">
        <div className="topbar">
          <Logo />
          <button className="btn btn-outline" onClick={onLogout}>
            <IconLogout size={15} />
            Log out
          </button>
        </div>
        <p className="muted" style={{ marginBottom: 24 }}>
          Welcome, {tutor.name}
        </p>

        {tutor.is_admin ? (
          <AdminPanel />
        ) : (
          <>
            <div className="card">
              <div className="card-title">
                <span className="icon-badge">
                  <IconLink size={17} />
                </span>
                <h2>Your booking link</h2>
              </div>
              <p className="muted">Share this link with students so they can book a session.</p>
              <div className="link-box">
                <input readOnly value={bookingLink} onFocus={(e) => e.target.select()} />
                <button className="btn" onClick={copyLink}>
                  <IconCopy size={15} />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card-title">
                <span className="icon-badge">
                  <IconClock size={17} />
                </span>
                <h2>Add a weekly time slot</h2>
              </div>
              <form onSubmit={handleAddSlot} style={{ marginTop: 18 }}>
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
                {slotSuccess && (
                  <p
                    className="slot-success-msg"
                    style={{ color: 'var(--success)', fontSize: 14, display: 'flex', alignItems: 'center' }}
                  >
                    <span className="confetti-wrap">
                      <span className="check-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="4 12 9 17 20 6" />
                        </svg>
                      </span>
                      <span className="confetti-dot" />
                      <span className="confetti-dot" />
                      <span className="confetti-dot" />
                      <span className="confetti-dot" />
                      <span className="confetti-dot" />
                      <span className="confetti-dot" />
                    </span>
                    Slot added!
                  </p>
                )}
                <button type="submit" className="btn" disabled={slotSaving}>
                  {slotSaving ? 'Adding...' : 'Add slot'}
                </button>
              </form>
            </div>

            <div className="card">
              <div className="card-title">
                <span className="icon-badge">
                  <IconClock size={17} />
                </span>
                <h2>Your time slots</h2>
              </div>
              <div style={{ marginTop: 16 }}>
                {slotsListError && <p className="error">{slotsListError}</p>}
                {timeSlotsLoading ? (
                  <p className="muted">Loading...</p>
                ) : timeSlots.length === 0 ? (
                  <p className="muted">No time slots yet — add one above.</p>
                ) : (
                  timeSlots.map((slot) => (
                    <div className="booking-item" key={slot.id}>
                      <div>
                        <strong>{DAY_NAMES[slot.day_of_week]}</strong>
                        <div className="muted">
                          {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <select
                          className="inline-select"
                          value={slot.session_type}
                          disabled={updatingSlotId === slot.id}
                          onChange={(e) => handleSessionTypeChange(slot.id, e.target.value as SessionType)}
                        >
                          <option value="online">Online</option>
                          <option value="physical">Physical</option>
                        </select>
                        <button
                          className="icon-btn"
                          disabled={deletingSlotId === slot.id}
                          onClick={() => handleDeleteSlot(slot.id)}
                          aria-label="Delete time slot"
                        >
                          <IconTrash size={15} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-title">
                <span className="icon-badge">
                  <IconUsers size={17} />
                </span>
                <h2>
                  <span className={headerPulse ? 'pulse-header' : undefined}>Upcoming bookings</span>
                </h2>
              </div>
              <div style={{ marginTop: 16 }}>
                {bookingsLoading ? (
                  <p className="muted">Loading...</p>
                ) : bookings.length === 0 ? (
                  <p className="muted">No upcoming bookings yet.</p>
                ) : (
                  bookings.map((b) => (
                    <div
                      className={highlightIds.has(b.id) ? 'booking-item is-new' : 'booking-item'}
                      key={b.id}
                    >
                      <div>
                        <strong>
                          {b.students?.name ?? 'Unknown student'}
                          {b.students?.contact ? ` - ${b.students.contact}` : ''}
                        </strong>
                        <div className="muted">
                          {formatFullDateLabel(parseDateKey(b.booking_date))}
                          {b.time_slots
                            ? ` · ${formatTime(b.time_slots.start_time)} - ${formatTime(b.time_slots.end_time)}`
                            : ''}
                        </div>
                      </div>
                      <span className="pill pill-success">
                        <IconCheck size={11} />
                        {b.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
