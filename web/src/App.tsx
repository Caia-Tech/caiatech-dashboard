import React from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from './components/Layout'
import { ModelsPage } from './pages/ModelsPage'
import { ModelDetailPage } from './pages/ModelDetailPage'
import { ReleasesPage } from './pages/ReleasesPage'
import { ReleaseDetailPage } from './pages/ReleaseDetailPage'
import { PlaygroundPage } from './pages/PlaygroundPage'
import { EvalsPage } from './pages/EvalsPage'
import { ServicesPage } from './pages/ServicesPage'

export function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/models" replace />} />
          <Route path="/models" element={<ModelsPage />} />
          <Route path="/models/:id" element={<ModelDetailPage />} />
          <Route path="/releases" element={<ReleasesPage />} />
          <Route path="/releases/:name" element={<ReleaseDetailPage />} />
          <Route path="/playground" element={<PlaygroundPage />} />
          <Route path="/evals" element={<EvalsPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="*" element={<Navigate to="/models" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
