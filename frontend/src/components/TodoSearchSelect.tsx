import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchWithAuth } from '../api/fetchWithAuth'

const SEARCH_API = '/api/todos/search'
const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2

interface TodoSearchApiItem {
  id?: unknown
  name?: unknown
}

export interface TodoSearchItem {
  id: number
  name: string
}

export interface TodoSearchSelectProps {
  selectedItems: Array<{ id: number; name: string }>
  onSelect: (item: { id: number; name: string }) => void
  onDeselect: (id: number) => void
  excludeIds?: number[]
  placeholder?: string
  singleSelect?: boolean
}

const parseSearchResponse = (response: unknown): TodoSearchItem[] => {
  if (!Array.isArray(response)) {
    return []
  }

  return response
    .map((entry): TodoSearchItem | null => {
      if (typeof entry !== 'object' || entry === null) {
        return null
      }

      const candidate = entry as TodoSearchApiItem
      if (typeof candidate.id !== 'number' || typeof candidate.name !== 'string') {
        return null
      }

      return { id: candidate.id, name: candidate.name }
    })
    .filter((item): item is TodoSearchItem => item !== null)
}

function TodoSearchSelect({
  selectedItems,
  onSelect,
  onDeselect,
  excludeIds = [],
  placeholder,
  singleSelect = false,
}: TodoSearchSelectProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState<string>('')
  const [results, setResults] = useState<TodoSearchItem[]>([])
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false)
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)
  const debounceRef = useRef<number | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const activeSingleSelection = singleSelect ? selectedItems[0] ?? null : null
  const visibleInputValue =
    singleSelect && query.length === 0 && activeSingleSelection !== null
      ? activeSingleSelection.name
      : query
  const normalizedQuery = query.trim()
  const shouldSearch = normalizedQuery.length >= MIN_QUERY_LENGTH
  const effectivePlaceholder = placeholder ?? t('search.typeToSearch')

  const filteredOutIds = useMemo(() => {
    const blockedIds = new Set<number>(excludeIds)
    selectedItems.forEach((item) => blockedIds.add(item.id))
    return blockedIds
  }, [excludeIds, selectedItems])

  useEffect(() => {
    if (!shouldSearch) {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current)
        debounceRef.current = null
      }

      abortControllerRef.current?.abort()
      abortControllerRef.current = null
      setResults([])
      setHighlightedIndex(-1)
      setIsDropdownOpen(false)
      return
    }

    setIsDropdownOpen(true)
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }

    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller

    debounceRef.current = window.setTimeout(async () => {
      try {
        const response = await fetchWithAuth(
          `${SEARCH_API}?q=${encodeURIComponent(normalizedQuery)}`,
          { signal: controller.signal },
        )

        if (!response.ok) {
          throw new Error(`Todo search failed with status ${response.status}`)
        }

        const data = (await response.json()) as unknown
        const nextResults = parseSearchResponse(data).filter((item) => !filteredOutIds.has(item.id))
        setResults(nextResults)
        setHighlightedIndex(nextResults.length > 0 ? 0 : -1)
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        console.error(error)
        setResults([])
        setHighlightedIndex(-1)
      }
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current)
        debounceRef.current = null
      }

      controller.abort()
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null
      }
    }
  }, [filteredOutIds, normalizedQuery, shouldSearch])

  const closeDropdown = (): void => {
    setIsDropdownOpen(false)
    setHighlightedIndex(-1)
  }

  const selectItem = (item: TodoSearchItem): void => {
    if (singleSelect) {
      const previous = activeSingleSelection
      if (previous !== null && previous.id !== item.id) {
        onDeselect(previous.id)
      }

      if (previous === null || previous.id !== item.id) {
        onSelect(item)
      }
      setQuery('')
      closeDropdown()
      setResults([])
      return
    }

    onSelect(item)
    setQuery('')
    closeDropdown()
    setResults([])
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeDropdown()
      if (!singleSelect) {
        setQuery('')
      }
      return
    }

    if (!isDropdownOpen || results.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlightedIndex((previous) => (previous + 1) % results.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlightedIndex((previous) => (previous <= 0 ? results.length - 1 : previous - 1))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      if (highlightedIndex >= 0 && highlightedIndex < results.length) {
        selectItem(results[highlightedIndex])
      }
    }
  }

  return (
    <div className="tag-input">
      <div className="tag-input-control">
        <input
          className="todo-input"
          type="text"
          value={visibleInputValue}
          onChange={(event) => {
            const nextValue = event.target.value
            if (singleSelect && nextValue.trim().length === 0 && activeSingleSelection !== null) {
              onDeselect(activeSingleSelection.id)
            }

            setQuery(nextValue)
            setHighlightedIndex(-1)
            if (nextValue.trim().length < MIN_QUERY_LENGTH) {
              closeDropdown()
            }
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={effectivePlaceholder}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={isDropdownOpen}
        />
        {isDropdownOpen ? (
          <ul className="tag-suggestions" role="listbox">
            {results.length > 0 ? (
              results.map((item, index) => (
                <li key={item.id} role="option" aria-selected={index === highlightedIndex}>
                  <button
                    className={`tag-suggestion-item${index === highlightedIndex ? ' is-highlighted' : ''}`}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectItem(item)}
                  >
                    {item.name}
                  </button>
                </li>
              ))
            ) : (
              <li role="status" aria-live="polite">
                <span className="tag-suggestion-item">{t('search.noResults')}</span>
              </li>
            )}
          </ul>
        ) : null}
      </div>

      {!singleSelect && selectedItems.length > 0 ? (
        <div className="tag-input-chips" aria-live="polite">
          {selectedItems.map((item) => (
            <span className="tag-chip" key={item.id}>
              <span className="tag-chip-label">{item.name}</span>
              <button
                className="tag-chip-remove"
                type="button"
                onClick={() => onDeselect(item.id)}
                aria-label={`Remove ${item.name}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default TodoSearchSelect
