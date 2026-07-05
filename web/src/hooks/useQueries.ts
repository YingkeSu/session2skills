import { useMutation, useQuery, useQueryClient, QueryClient } from "@tanstack/react-query";

import {
  createRun,
  createRunAsync,
  deleteRun,
  evaluateRun,
  fetchAdapters,
  fetchEvidenceDetail,
  fetchGenerationProgress,
  fetchProjects,
  fetchRunDetail,
  fetchRuns,
  fetchSessions,
  updateRunMeta,
  type AdapterInfo,
  type AsyncRunResponse,
  type DiscoveredProject,
  type EvidenceDetail,
  type GenerationProgress,
  type RunMetaPatch,
  type SkillEvaluation,
  type SessionsResult,
} from "../runs.js";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 2,
        refetchOnWindowFocus: true,
      },
    },
  });
}

export function useRunsQuery(includeArchived = false) {
  // The includeArchived flag is part of the query key so toggling the
  // archive-visibility switch refetches from the right endpoint and caches
  // both views independently.
  return useQuery({
    queryKey: ["runs", { includeArchived }],
    queryFn: () => fetchRuns(includeArchived),
  });
}

export function useAdaptersQuery() {
  return useQuery<AdapterInfo[]>({
    queryKey: ["adapters"],
    queryFn: fetchAdapters,
    staleTime: 60_000,
  });
}

export function useSessionsQuery(
  adapter: string | null,
  directory: string | null,
) {
  return useQuery<SessionsResult>({
    queryKey: ["sessions", adapter, directory],
    queryFn: () => fetchSessions(adapter!, directory!),
    enabled: Boolean(adapter && directory),
  });
}

export function useProjectsQuery(adapter: string | null) {
  return useQuery<DiscoveredProject[]>({
    queryKey: ["projects", adapter],
    queryFn: () => fetchProjects(adapter!),
    enabled: Boolean(adapter),
    staleTime: 60_000,
  });
}

export function useRunDetailQuery(name: string | null) {
  return useQuery({
    queryKey: ["runs", name],
    queryFn: () => fetchRunDetail(name as string),
    enabled: Boolean(name),
  });
}

export function useGenerateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createRunAsync,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

export function useGenerationProgress(runName: string | null, enabled: boolean) {
  return useQuery<GenerationProgress>({
    queryKey: ["generation-progress", runName],
    queryFn: () => fetchGenerationProgress(runName as string),
    enabled: Boolean(runName) && enabled,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      if (data.stage === "done" || data.stage === "error") return false;
      return 2000;
    },
  });
}

export function useEvaluateMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: evaluateRun,
    onSuccess: (_data: SkillEvaluation, variables: string) => {
      void queryClient.invalidateQueries({ queryKey: ["runs", variables] });
    },
  });
}

export function useUpdateRunMetaMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { name: string; patch: RunMetaPatch }) =>
      updateRunMeta(vars.name, vars.patch),
    // Invalidate the whole runs family so both the archive-on and archive-off
    // cached lists (and the detail query) refetch the updated meta.
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

export function useDeleteRunMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteRun(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["runs"] });
    },
  });
}

export function useEvidenceDetailQuery(runName: string, evidenceId: string | null) {
  return useQuery<EvidenceDetail>({
    queryKey: ["runs", runName, "evidence", evidenceId],
    queryFn: () => fetchEvidenceDetail(runName, evidenceId as string),
    enabled: Boolean(runName && evidenceId),
  });
}
