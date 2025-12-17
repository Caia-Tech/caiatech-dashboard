import React from 'react'
import { NavLink } from 'react-router-dom'

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container">
      <div className="header">
        <div className="brand">
          <div className="brand-title">Caia Dashboard</div>
          <div className="brand-sub">Model lifecycle + registry visibility</div>
        </div>
        <div className="nav">
          <NavLink to="/models" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            Models
          </NavLink>
        </div>
      </div>

      {children}

      <div className="small" style={{ marginTop: 18, opacity: 0.9 }}>
        Backed by your `model-registry` service.
      </div>
    </div>
  )
}
