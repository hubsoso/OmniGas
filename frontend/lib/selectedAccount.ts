const STORAGE_KEY = 'omngas_selected_account'

function normalizeAccount(account: string | null | undefined) {
  return account?.toLowerCase() ?? ''
}

export function getSelectedAccount() {
  if (typeof window === 'undefined') return ''
  return normalizeAccount(window.localStorage.getItem(STORAGE_KEY))
}

export function setSelectedAccount(account: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, normalizeAccount(account))
}

export function clearSelectedAccount() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEY)
}

export function pickSelectedAccount(accounts: string[], fallback = '') {
  const normalizedAccounts = accounts.map((account) => account.toLowerCase())
  const stored = getSelectedAccount()

  if (stored && normalizedAccounts.includes(stored)) return stored
  if (fallback) return normalizeAccount(fallback)
  return normalizedAccounts[0] ?? ''
}
