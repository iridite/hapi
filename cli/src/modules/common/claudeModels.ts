import fs from 'fs/promises'
import { join } from 'path'
import os from 'os'
import type { ClaudeModelSummary, ClaudeModelsResponse } from '@hapi/protocol/apiTypes'
import { CLAUDE_MODEL_PRESETS, CLAUDE_MODEL_LABELS, type ClaudeModelPreset } from '@hapi/protocol'

export type ListClaudeModelsRequest = Record<string, never>
export type ListClaudeModelsResponse = ClaudeModelsResponse

interface ClaudeSettings {
    env?: Record<string, string>
}

async function readClaudeSettings(): Promise<ClaudeSettings> {
    const settingsPath = join(os.homedir(), '.claude', 'settings.json')
    try {
        const content = await fs.readFile(settingsPath, 'utf-8')
        return JSON.parse(content)
    } catch {
        return {}
    }
}

export async function listClaudeModels(): Promise<ClaudeModelSummary[]> {
    const models: ClaudeModelSummary[] = []

    // Built-in presets
    for (const preset of CLAUDE_MODEL_PRESETS) {
        models.push({
            id: preset,
            name: CLAUDE_MODEL_LABELS[preset as ClaudeModelPreset],
            isPreset: true
        })
    }

    // Discover custom models from ~/.claude/settings.json env vars
    const settings = await readClaudeSettings()
    const env = settings.env ?? {}

    const seen = new Set<string>(CLAUDE_MODEL_PRESETS)

    // ANTHROPIC_DEFAULT_*_MODEL patterns
    const modelKeyPattern = /^ANTHROPIC_DEFAULT_(\w+)_MODEL$/
    for (const [key, value] of Object.entries(env)) {
        const match = key.match(modelKeyPattern)
        if (!match || !value) continue

        // Skip if key has _NAME or _DESCRIPTION suffix (those are metadata)
        if (key.endsWith('_NAME') || key.endsWith('_DESCRIPTION') || key.endsWith('_SUPPORTED_CAPABILITIES')) continue

        if (seen.has(value)) continue
        seen.add(value)

        const slot = match[1]
        const nameKey = `${key}_NAME`
        const descKey = `${key}_DESCRIPTION`

        models.push({
            id: value,
            name: env[nameKey] || `${slot.charAt(0) + slot.slice(1).toLowerCase()} (${value})`,
            description: env[descKey] || undefined,
            isPreset: false
        })
    }

    // ANTHROPIC_CUSTOM_MODEL_OPTION pattern (can be multiple: _1, _2, etc.)
    const customPattern = /^ANTHROPIC_CUSTOM_MODEL_OPTION(_\d+)?$/
    for (const [key, value] of Object.entries(env)) {
        if (!customPattern.test(key) || !value) continue
        if (seen.has(value)) continue
        seen.add(value)

        const suffix = key.replace('ANTHROPIC_CUSTOM_MODEL_OPTION', '')
        const nameKey = `ANTHROPIC_CUSTOM_MODEL_OPTION${suffix}_NAME`
        const descKey = `ANTHROPIC_CUSTOM_MODEL_OPTION${suffix}_DESCRIPTION`

        models.push({
            id: value,
            name: env[nameKey] || value,
            description: env[descKey] || undefined,
            isPreset: false
        })
    }

    return models
}
