/**
 * On/off control for settings the Host applies as soon as they are flipped.
 * @module @anht3889/dsh-mcp-mgmt-bundle/client/Switch
 */

import type { ReactNode } from 'react'
import styles from './Switch.module.css'

/** Props for one immediately applied on/off setting. */
export interface SwitchProps {
  /** The current state. */
  checked: boolean
  /** Text beside the track, which also names the control for assistive tech. */
  label: string
  /** Receives the state the operator asked for. */
  onChange: (checked: boolean) => void
  /** Blocks the control while the state cannot change. */
  disabled?: boolean
}

/**
 * Renders a setting as a switch rather than a checkbox, because flipping it
 * takes effect at once instead of staging a change for a later Save.
 *
 * @param props - state, label, and the change sink.
 * @returns the switch control.
 */
export function Switch({ checked, label, onChange, disabled = false }: SwitchProps): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={styles.switch}
      disabled={disabled}
      onClick={() => { onChange(!checked) }}
    >
      <span className={styles.track} data-on={String(checked)} aria-hidden="true">
        <span className={styles.thumb} />
      </span>
      {label}
    </button>
  )
}
