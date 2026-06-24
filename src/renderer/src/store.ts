import { create } from 'zustand'
import type { AppSettings, ProcessingProgress, Recording } from '@shared/types'
import { api } from './api'

export type View =
  | { name: 'home' }
  | { name: 'recording'; recordingId: string }
  | { name: 'detail'; recordingId: string }
  | { name: 'settings' }

interface AppState {
  view: View
  recordings: Recording[]
  settings: AppSettings | null
  progressByRecording: Record<string, ProcessingProgress>
  // acciones
  navigate: (view: View) => void
  refreshRecordings: (filtro?: string) => Promise<void>
  loadSettings: () => Promise<void>
  applyProgress: (p: ProcessingProgress) => void
}

export const useStore = create<AppState>((set, get) => ({
  view: { name: 'home' },
  recordings: [],
  settings: null,
  progressByRecording: {},

  navigate: (view) => set({ view }),

  refreshRecordings: async (filtro) => {
    const recordings = await api.listRecordings(filtro)
    set({ recordings })
  },

  loadSettings: async () => {
    const settings = await api.getSettings()
    set({ settings })
  },

  applyProgress: (p) => {
    set((state) => ({
      progressByRecording: { ...state.progressByRecording, [p.recordingId]: p }
    }))
    // Si una grabación cambió de estado, refrescamos la lista.
    void get().refreshRecordings()
  }
}))
