import { login } from '@/shared/api'
import { useMutation } from '@tanstack/react-query'

export default function useLogin() {
  return useMutation({
    mutationFn: login,
  })
}
