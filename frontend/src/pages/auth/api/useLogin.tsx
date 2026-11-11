import { login } from '@/shared/api'
import { startSession } from '@/shared/hooks/useSession'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export default function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: login,
    onSuccess: (user) => startSession(queryClient, user),
  })
}
