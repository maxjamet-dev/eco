import { create } from 'zustand'
import type { AppSettings, Project, ProcessingProgress, Recording } from '@shared/types'
import { api } from './api'

export type View =
  | { name: 'home' }
  | { name: 'recording'; recordingId: string }
  | { name: 'detail'; recordingId: string }
  | { name: 'settings' }

/** Proyecto con su contador de reuniones (tal como lo entrega projects:list). */
export type ProjectWithCount = Project & { numReuniones: number }

interface AppState {
  view: View
  recordings: Recording[]
  settings: AppSettings | null
  progressByRecording: Record<string, ProcessingProgress>
  projectFilter: string | null
  projects: ProjectWithCount[]
  // acciones
  navigate: (view: View) => void
  setProjectFilter: (projectId: string | null) => void
  refreshRecordings: (filtro?: string) => Promise<void>
  loadSettings: () => Promise<void>
  loadProjects: () => Promise<void>
  /** Asigna (o quita, con null) una grabación a un proyecto y refresca. */
  assignRecording: (recordingId: string, projectId: string | null) => Promise<void>
  createProject: (nombre: string) => Promise<ProjectWithCount | null>
  renameProject: (id: string, nombre: string) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  applyProgress: (p: ProcessingProgress) => void
}

export const useStore = create<AppState>((set, get) => ({
  view: { name: 'home' },
  recordings: [],
  settings: null,
  progressByRecording: {},
  projectFilter: null,
  projects: [],

  navigate: (view) => set({ view }),

  setProjectFilter: (projectId) => {
    set({ projectFilter: projectId })
    void get().refreshRecordings()
  },

  refreshRecordings: async (filtro) => {
    const recordings = await api.listRecordings(filtro, get().projectFilter)
    set({ recordings })
  },

  loadSettings: async () => {
    const settings = await api.getSettings()
    set({ settings })
  },

  loadProjects: async () => {
    const projects = await api.listProjects()
    set({ projects })
  },

  assignRecording: async (recordingId, projectId) => {
    await api.updateRecording(recordingId, { projectId })
    await get().refreshRecordings()
    await get().loadProjects()
  },

  createProject: async (nombre) => {
    const p = await api.createProject(nombre)
    await get().loadProjects()
    return get().projects.find((x) => x.id === p.id) ?? null
  },

  renameProject: async (id, nombre) => {
    await api.updateProject(id, { nombre })
    await get().loadProjects()
  },

  deleteProject: async (id) => {
    await api.deleteProject(id)
    if (get().projectFilter === id) get().setProjectFilter(null)
    await get().loadProjects()
    await get().refreshRecordings()
  },

  applyProgress: (p) => {
    set((state) => ({
      progressByRecording: { ...state.progressByRecording, [p.recordingId]: p }
    }))
    // Si una grabación cambió de estado, refrescamos la lista.
    void get().refreshRecordings()
  }
}))
