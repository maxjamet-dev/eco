import type { RecordingDetail } from '@shared/types'
import { formatDate, formatTimestamp } from './format'

/**
 * Construye un Markdown completo de la reunión, pensado para pegar en una IA
 * (Claude): incluye contexto (título, descripción, proyecto, fecha),
 * participantes, transcripción completa y resumen + tareas.
 */
export function buildMarkdown(detail: RecordingDetail): string {
  const { recording, segments, summary, project, speakers } = detail
  const lines: string[] = []

  lines.push(`# ${recording.titulo}`)
  lines.push('')
  const meta: string[] = []
  if (project) meta.push(`**Proyecto:** ${project.nombre}`)
  meta.push(`**Fecha:** ${formatDate(recording.fechaInicio)}`)
  if (recording.tipo === 'importada') meta.push('**Origen:** audio importado')
  if (meta.length) {
    lines.push(meta.join(' · '))
    lines.push('')
  }
  if (recording.descripcion && recording.descripcion.trim()) {
    lines.push('## Contexto')
    lines.push(recording.descripcion.trim())
    lines.push('')
  }
  if (project?.descripcion && project.descripcion.trim()) {
    lines.push('## Contexto del proyecto')
    lines.push(project.descripcion.trim())
    lines.push('')
  }

  if (summary) {
    lines.push('## Resumen')
    lines.push(summary.resumen)
    lines.push('')
    if (summary.puntosClave.length) {
      lines.push('### Puntos clave')
      for (const p of summary.puntosClave) lines.push(`- ${p}`)
      lines.push('')
    }
    if (summary.actionItems.length) {
      lines.push('### Tareas')
      for (const a of summary.actionItems) {
        lines.push(`- ${a.descripcion}${a.responsable ? ` — _${a.responsable}_` : ''}`)
      }
      lines.push('')
    }
  }

  if (speakers.length) {
    const nombres = speakers
      .map((s) => s.nombre ?? (s.etiqueta === 'MIC' ? 'Yo' : s.etiqueta))
      .join(', ')
    lines.push(`**Participantes:** ${nombres}`)
    lines.push('')
  }

  lines.push('## Transcripción')
  lines.push('')
  for (const seg of segments) {
    lines.push(`**[${formatTimestamp(seg.inicioMs)}] ${seg.speaker}:** ${seg.texto}`)
  }

  return lines.join('\n')
}

/** Solo la transcripción, en texto plano "hablante: texto". */
export function buildTranscriptText(detail: RecordingDetail): string {
  return detail.segments
    .map((s) => `[${formatTimestamp(s.inicioMs)}] ${s.speaker}: ${s.texto}`)
    .join('\n')
}
