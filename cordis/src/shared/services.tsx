import { createContext, useContext, type ReactNode } from 'react'
import type { ClientRuntime } from 'cordis-app/client'
import { createApiClient, type ApiClient } from './api'
import { createScanEventSource, type ScanEventSource } from './scanEvents'

/** Everything a page needs from the outside world, injected at the route root. */
export interface Services {
  api: ApiClient
  scanEvents: ScanEventSource
}

const ServicesContext = createContext<Services | null>(null)

export function ServicesProvider({
  value,
  children,
}: {
  value: Services
  children: ReactNode
}) {
  return (
    <ServicesContext.Provider value={value}>{children}</ServicesContext.Provider>
  )
}

export function useServices(): Services {
  const services = useContext(ServicesContext)
  if (services === null) {
    throw new Error('useServices must be used inside ServicesProvider')
  }
  return services
}

/** The production wiring over the framework runtime. */
export function createRuntimeServices(runtime: ClientRuntime): Services {
  return {
    api: createApiClient(runtime.http),
    scanEvents: createScanEventSource({ token: runtime.token }),
  }
}
