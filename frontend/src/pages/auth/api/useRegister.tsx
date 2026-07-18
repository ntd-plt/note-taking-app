import { register } from '@/shared/api'
import { useMutation } from '@tanstack/react-query'

export default function useRegister() {
  return useMutation({
    mutationFn: register,
  })
}
