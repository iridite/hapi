import { useCallback, useEffect, useState } from 'react'

export const DEFAULT_HIDE_COMPACT_SUMMARY = true

function getStorageKey(): string {
    return 'hapi-hide-compact-summary'
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

function parseHideCompactSummary(raw: string | null): boolean {
    if (raw === 'false') return false
    if (raw === 'true') return true
    return DEFAULT_HIDE_COMPACT_SUMMARY
}

export function getInitialHideCompactSummary(): boolean {
    return parseHideCompactSummary(safeGetItem(getStorageKey()))
}

export function useHideCompactSummary(): {
    hideCompactSummary: boolean
    setHideCompactSummary: (value: boolean) => void
} {
    const [hideCompactSummary, setHideCompactSummaryState] = useState<boolean>(getInitialHideCompactSummary)

    useEffect(() => {
        if (!isBrowser()) return

        const onStorage = (event: StorageEvent) => {
            if (event.key !== getStorageKey()) return
            setHideCompactSummaryState(parseHideCompactSummary(event.newValue))
        }

        window.addEventListener('storage', onStorage)
        return () => window.removeEventListener('storage', onStorage)
    }, [])

    const setHideCompactSummary = useCallback((value: boolean) => {
        setHideCompactSummaryState(value)

        if (value === DEFAULT_HIDE_COMPACT_SUMMARY) {
            safeRemoveItem(getStorageKey())
        } else {
            safeSetItem(getStorageKey(), String(value))
        }
    }, [])

    return { hideCompactSummary, setHideCompactSummary }
}
