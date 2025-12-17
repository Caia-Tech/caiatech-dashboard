import React from 'react'
import type { ModelStatus } from '../types'

function clsFor(status: ModelStatus) {
  switch (status) {
    case 'production':
      return 'badge prod'
    case 'staging':
      return 'badge stage'
    case 'experimental':
      return 'badge exp'
    case 'archived':
      return 'badge arch'
    default:
      return 'badge'
  }
}

export function StatusBadge({ status }: { status: ModelStatus }) {
  return <span className={clsFor(status)}>{status}</span>
}
