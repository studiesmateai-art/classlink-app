import { Routes, Route, Navigate } from 'react-router-dom'
import Admin from './pages/Admin'
import Book from './pages/Book'

function App() {
  return (
    <Routes>
      <Route path="/admin" element={<Admin />} />
      <Route path="/book/:tutorId" element={<Book />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  )
}

export default App