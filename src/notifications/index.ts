export interface NotificationAdapter {
  notify(event: {
    scheduleId: string
    trigger: string
    success: boolean
    message?: string
  }): Promise<void>
}

export class NoopAdapter implements NotificationAdapter {
  async notify(): Promise<void> {
    /* no-op in v1 */
  }
}
