import type { ReactNode } from 'react'
import './globals.css'

export const metadata = { title: 'API Router', description: 'Fan-out router to sub-APIs configured from Postman collections' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
