import type { RecordingStatus } from '@shared/types'
import { ESTADO_KIND, ESTADO_LABEL } from '../lib/format'

export function StatusBadge({ estado }: { estado: RecordingStatus }): JSX.Element {
  const kind = ESTADO_KIND[estado]
  return <span className={`status status-${kind}`}>{ESTADO_LABEL[estado]}</span>
}
