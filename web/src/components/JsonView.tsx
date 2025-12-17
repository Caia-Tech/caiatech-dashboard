import React from 'react'

export function JsonView({ value }: { value: unknown }) {
  return (
    <pre className="pre">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}
