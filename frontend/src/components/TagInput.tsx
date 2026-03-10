import { useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { fetchWithAuth } from '../api/fetchWithAuth'

const TAGS_API = '/api/tags'
const DEBOUNCE_MS = 300

interface TagApiItem {
  name?: unknown
}

export interface TagInputProps {
  value: string[]
  onChange: (nextTags: string[]) => void
  id?: string
  placeholder?: string
  disabled?: boolean
}

const normalizeTag = (tag: string): string => tag.trim()

const parseTagResponse = (response: unknown): string[] => {
  if (!Array.isArray(response)) {
    return []
  }

  return response
    .map((item) => {
      if (typeof item === 'string') {
        return item
      }

      if (typeof item === 'object' && item !== null) {
        const candidate = (item as TagApiItem).name
        return typeof candidate === 'string' ? candidate : ''
      }

      return ''
    })
    .map(normalizeTag)
    .filter((tag) => tag.length > 0)
}

function TagInput({ value, onChange, id, placeholder = 'Add tag', disabled = false }: TagInputProps) {
  const [query, setQuery] = useState<string>('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)

  const selectedLowercase = useMemo(
    () => new Set(value.map((tag) => normalizeTag(tag).toLowerCase())),
    [value],
  )

  useEffect(() => {
    const normalizedQuery = normalizeTag(query).toLowerCase()
    if (!normalizedQuery) {
      setSuggestions([])
      setHighlightedIndex(-1)
      return
    }

    const abortController = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetchWithAuth(TAGS_API, { signal: abortController.signal })
        if (!response.ok) {
          throw new Error(`Failed to fetch tags with status ${response.status}`)
        }

        const data = (await response.json()) as unknown
        const nextSuggestions = parseTagResponse(data).filter((tag) => {
          const lowerTag = tag.toLowerCase()
          return lowerTag.includes(normalizedQuery) && !selectedLowercase.has(lowerTag)
        })

        setSuggestions(nextSuggestions)
        setHighlightedIndex((previous) => {
          if (nextSuggestions.length === 0) {
            return -1
          }

          return previous >= 0 && previous < nextSuggestions.length ? previous : 0
        })
      } catch (error) {
        if (abortController.signal.aborted) {
          return
        }

        console.error(error)
        setSuggestions([])
        setHighlightedIndex(-1)
      }
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeoutId)
      abortController.abort()
    }
  }, [query, selectedLowercase])

  const addTag = (rawTag: string): void => {
    const normalized = normalizeTag(rawTag)
    if (!normalized) {
      return
    }

    if (selectedLowercase.has(normalized.toLowerCase())) {
      setQuery('')
      setSuggestions([])
      setHighlightedIndex(-1)
      return
    }

    onChange([...value, normalized])
    setQuery('')
    setSuggestions([])
    setHighlightedIndex(-1)
  }

  const removeTag = (indexToRemove: number): void => {
    onChange(value.filter((_, index) => index !== indexToRemove))
  }

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      if (suggestions.length === 0) {
        return
      }

      event.preventDefault()
      setHighlightedIndex((previous) => (previous + 1) % suggestions.length)
      return
    }

    if (event.key === 'ArrowUp') {
      if (suggestions.length === 0) {
        return
      }

      event.preventDefault()
      setHighlightedIndex((previous) => (previous <= 0 ? suggestions.length - 1 : previous - 1))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
        addTag(suggestions[highlightedIndex])
      } else {
        addTag(query)
      }
      return
    }

    if (event.key === 'Escape') {
      setSuggestions([])
      setHighlightedIndex(-1)
    }
  }

  return (
    <div className="tag-input">
      <div className="tag-input-chips" aria-live="polite">
        {value.map((tag, index) => (
          <span className="tag-chip" key={`${tag}-${index}`}>
            <span className="tag-chip-label">{tag}</span>
            <button
              className="tag-chip-remove"
              type="button"
              onClick={() => removeTag(index)}
              disabled={disabled}
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="tag-input-control">
        <input
          id={id}
          className="todo-input"
          type="text"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setHighlightedIndex(-1)
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls={id ? `${id}-suggestions` : undefined}
        />
        {suggestions.length > 0 ? (
          <ul
            id={id ? `${id}-suggestions` : undefined}
            className="tag-suggestions"
            role="listbox"
          >
            {suggestions.map((tag, index) => (
              <li key={tag} role="option" aria-selected={index === highlightedIndex}>
                <button
                  className={`tag-suggestion-item${index === highlightedIndex ? ' is-highlighted' : ''}`}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => addTag(tag)}
                  disabled={disabled}
                >
                  {tag}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}

export default TagInput
