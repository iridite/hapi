import { useCallback, useEffect, useState } from 'react'

export const DEFAULT_REASONING_DEFAULT_OPEN = false

function getStorageKey(): string {
    return 'hapi-reasoning-default-open'
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

function parseReasoningDefaultOpen(raw: string | null): boolean {
    if (raw === 'true') return true
    if (raw === 'false') return false
    return DEFAULT_REASONING_DEFAULT_OPEN
}

export function getInitialReasoningDefaultOpen(): boolean {
    return parseReasoningDefaultOpen(safeGetItem(getStorageKey()))
}

export function useReasoningDefaultOpen(): {
    reasoningDefaultOpen: boolean
    setReasoningDefaultOpen: (value: boolean) => void
} {
    const [reasoningDefaultOpen, setReasoningDefaultOpenState] = useState<boolean>(getInitialReasoningDefaultOpen)

    useEffect(() => {
        if (!isBrowser()) return

        const onStorage = (event: StorageEvent) => {
            if (event.key !== getStorageKey()) return
            setReasoningDefaultOpenState(parseReasoningDefaultOpen(event.newValue))
        }

        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [])

    const setReasoningDefaultOpen = useCallback((value: boolean) => {
        setReasoningDefaultOpenState(value)

        if (value === DEFAULT_REASONING_DEFAULT_OPEN) {
            safeRemoveItem(getStorageKey())
        } else {
            safeSetItem(getStorageKey(), String(value))
        }
    }, [])

    return { reasoningDefaultOpen, setReasoningDefaultOpen }
}
