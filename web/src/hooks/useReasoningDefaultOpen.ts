import { useCallback, useEffect, useState } from 'react'

export type ReasoningDisplayMode = 'default' | 'always-open' | 'always-closed'

export const DEFAULT_REASONING_DISPLAY_MODE: ReasoningDisplayMode = 'default'

function getStorageKey(): string {
    return 'hapi-reasoning-display-mode'
}

function isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function safeGetItem(key: string): string | null {
    if (!isBrowser()) return null
    try {
        return localStorage.getItem(key)
    } catch {
        return null
    }
}

function safeSetItem(key: string, value: string): void {
    if (!isBrowser()) return
    try {
        localStorage.setItem(key, value)
    } catch {}
}

function safeRemoveItem(key: string): void {
    if (!isBrowser()) return
    try {
        localStorage.removeItem(key)
    } catch {}
}

function parseMode(raw: string | null): ReasoningDisplayMode {
    if (raw === 'always-open' || raw === 'always-closed') return raw
    return DEFAULT_REASONING_DISPLAY_MODE
}

export function getReasoningDisplayMode(): ReasoningDisplayMode {
    return parseMode(safeGetItem(getStorageKey()))
}

export function useReasoningDisplayMode(): {
    reasoningDisplayMode: ReasoningDisplayMode
    setReasoningDisplayMode: (value: ReasoningDisplayMode) => void
} {
    const [mode, setModeState] = useState<ReasoningDisplayMode>(getReasoningDisplayMode)

    useEffect(() => {
        if (!isBrowser()) return

        const onStorage = (event: StorageEvent) => {
            if (event.key !== getStorageKey()) return
            setModeState(parseMode(event.newValue))
        }

        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [])

    const setReasoningDisplayMode = useCallback((value: ReasoningDisplayMode) => {
        setModeState(value)

        if (value === DEFAULT_REASONING_DISPLAY_MODE) {
            safeRemoveItem(getStorageKey())
        } else {
            safeSetItem(getStorageKey(), value)
        }
    }, [])

    return { reasoningDisplayMode: mode, setReasoningDisplayMode }
}
