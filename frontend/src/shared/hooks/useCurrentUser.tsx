import { useQuery } from '@tanstack/react-query'
import { getCurrentUser } from '../api/user'

export default function useCurrentUser() {
  const query = useQuery({
    queryKey: ['current-user'],
    queryFn: getCurrentUser,
  })
  return query?.data
}
