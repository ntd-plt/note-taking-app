import { signup } from '@/shared/api'
import { startSession } from '@/shared/hooks/useSession'
import { useMutation, useQueryClient } from '@tanstack/react-query'

export default function useSignup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: signup,
    onSuccess: (user) => startSession(queryClient, user),
  })
}
