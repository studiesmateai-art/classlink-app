import { useEffect, useState, useCallback, useRef, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import type { AuthedTutor, SessionType, TimeSlot } from '../types'
import { DAY_NAMES, formatFullDateLabel, formatTime, parseDateKey, toDateKey } from '../lib/dates'
import { Logo } from '../components/Logo'
import { IconLink, IconClock, IconUsers, IconCopy, IconCheck, IconLogout } from '../components/icons'
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

  const [copied, setCopied] = useState(false)

  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [timeSlotsLoading, setTimeSlotsLoading] = useState(true)
  const [slotsListError, setSlotsListError] = useState('')
  const [updatingSlotId, setUpdatingSlotId] = useState<string | null>(null)
  const timeSlotsRequestId = useRef(0)
  const hasLoadedTimeSlotsOnce = useRef(false)

  const loadTimeSlots = useCallback(async (tutorId: string) => {
    const requestId = ++timeSlotsRequestId.current
    // Only show the "Loading..." placeholder on the very first fetch. Refetches triggered by a
    // toggle keep the current rows on screen until the fresh data replaces them, so re-fetching
    // never blanks the list the tutor is looking at.
    if (!hasLoadedTimeSlotsOnce.current) {
      setTimeSlotsLoading(true)
    }

    const { data, error } = await supabase
      .from('time_slots')
      .select('*')
      .eq('tutor_id', tutorId)
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true })

    // A newer loadTimeSlots call has since started — ignore this now-outdated response so an
    // out-of-order network reply can never overwrite fresher data.
    if (requestId !== timeSlotsRequestId.current) return

    if (error) {
      setSlotsListError(error.message)
      setTimeSlotsLoading(false)
      return
    }

    setTimeSlots((data as TimeSlot[]) ?? [])
    setTimeSlotsLoading(false)
    hasLoadedTimeSlotsOnce.current = true
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

  // This handler never touches `timeSlots` directly. It only writes the single changed field to
  // Supabase, then calls loadTimeSlots(), which re-fetches this tutor's full slot list and
  // replaces the local array wholesale. The database is the only source of truth for what's
  // displayed — there is no local patch/merge logic that could drop or duplicate a row.
  async function handleSessionTypeChange(slotId: string, sessionType: SessionType) {
    setSlotsListError('')
    setUpdatingSlotId(slotId)

    const { error } = await supabase.from('time_slots').update({ session_type: sessionType }).eq('id', slotId)

    if (error) {
      setSlotsListError(error.message)
      setUpdatingSlotId(null)
      return
    }

    await loadTimeSlots(tutor.id)
    setUpdatingSlotId(null)
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
                <h2>Your time slots</h2>
              </div>
              <p className="muted">
                Tap Online / Physical to change how a session is held. Adding, removing, or
                rescheduling slots is handled directly in Supabase for now.
              </p>
              <div style={{ marginTop: 16 }}>
                {slotsListError && <p className="error">{slotsListError}</p>}
                {timeSlotsLoading ? (
                  <p className="muted">Loading...</p>
                ) : timeSlots.length === 0 ? (
                  <p className="muted">No time slots configured yet.</p>
                ) : (
                  timeSlots.map((slot) => {
                    const isOnline = slot.session_type === 'online'
                    return (
                      <div className="booking-item" key={slot.id}>
                        <div>
                          <strong>{DAY_NAMES[slot.day_of_week]}</strong>
                          <div className="muted">
                            {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                          </div>
                        </div>
                        <button
                          type="button"
                          className={`session-toggle ${isOnline ? 'session-toggle-online' : 'session-toggle-physical'}`}
                          disabled={updatingSlotId === slot.id}
                          onClick={() => handleSessionTypeChange(slot.id, isOnline ? 'physical' : 'online')}
                        >
                          {updatingSlotId === slot.id ? 'Saving...' : isOnline ? 'Online' : 'Physical'}
                        </button>
                      </div>
                    )
                  })
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
