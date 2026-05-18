export type RuntimeMigrationSource = 'openclaw'

export interface HermesOpenClawMigrationConfig {
  preset?: 'full' | 'user-data'
  dryRun?: boolean
  overwrite?: boolean
  sourcePath?: string
  workspaceTarget?: string
  skillConflict?: 'skip' | 'overwrite' | 'rename'
}

export interface RuntimeMigrationConfig {
  source: RuntimeMigrationSource
  hermesOpenClaw?: HermesOpenClawMigrationConfig
}
