package hash

type Hasher interface {
	Hash(password []byte) ([]byte, error)
	Compare(hash, password []byte) error
}
