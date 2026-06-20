import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { ClaudeModelSummary } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useClaudeModelsForMachine(args: {
    api: ApiClient | null
    machineId?: string | null
    enabled?: boolean
}): {
    models: ClaudeModelSummary[]
    isLoading: boolean
    error: string | null
} {
    const { api, machineId } = args
    const enabled = Boolean(args.enabled && api && machineId)

    const query = useQuery({
        queryKey: machineId
            ? queryKeys.machineClaudeModels(machineId)
            : ['machine-claude-models', 'unknown'] as const,
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            if (!machineId) {
                throw new Error('Machine unavailable')
            }
            return await api.getMachineClaudeModels(machineId)
        },
        enabled,
        staleTime: 60_000,
        retry: false,
    })

    return {
        models: query.data?.models ?? [],
        isLoading: query.isLoading,
        error: query.data?.success === false
            ? (query.data.error ?? 'Failed to load Claude models')
            : query.error instanceof Error
                ? query.error.message
                : null,
    }
}
