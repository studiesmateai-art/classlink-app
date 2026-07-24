export interface Tutor {
  id: string
  name: string
  subject: string | null
  contact: string | null
  password_hash: string | null
  plan: string | null
  created_at: string
}

export interface Student {
  id: string
  tutor_id: string
  name: string
  contact: string
  session_package: string | null
  notes: string | null
  created_at: string
}

export interface TimeSlot {
  id: string
  tutor_id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_recurring: boolean
  created_at: string
}

export interface Booking {
  id: string
  student_id: string
  tutor_id: string
  slot_id: string
  booking_date: string
  status: string
  created_at: string
}

export interface Payment {
  id: string
  student_id: string
  amount: number
  status: string
  method: string | null
  paid_at: string | null
}