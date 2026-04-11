export function parseColumnOrderSetting(value?: string | null): string[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    }
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

export function normalizeColumnOrder(defaultOrder: string[], savedOrder?: string | null): string[] {
  const parsed = parseColumnOrderSetting(savedOrder)
  return reconcileColumnOrder(defaultOrder, parsed)
}

export function reconcileColumnOrder(defaultOrder: string[], currentOrder: string[]): string[] {
  const parsed = currentOrder
  const valid = parsed.filter((id, index) => defaultOrder.includes(id) && parsed.indexOf(id) === index)
  const missing = defaultOrder.filter((id) => !valid.includes(id))
  return [...valid, ...missing]
}

export function reorderVisibleColumns(
  fullOrder: string[],
  visibleOrder: string[],
  nextVisibleOrder: string[]
): string[] {
  const visibleIds = new Set(visibleOrder)
  let visibleIndex = 0

  return fullOrder.map((id) => {
    if (!visibleIds.has(id)) return id
    const nextId = nextVisibleOrder[visibleIndex]
    visibleIndex += 1
    return nextId
  })
}

export function parseColumnWidthsSetting(value?: string | null): Record<string, number> {
  if (!value) return {}

  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, number] => typeof entry[0] === "string" && Number.isFinite(entry[1]))
        .map(([key, width]) => [key, Math.round(width)])
    )
  } catch {
    return {}
  }
}

export function clampColumnWidth(width: number, min = 96, max = 640) {
  return Math.max(min, Math.min(max, Math.round(width)))
}

export function normalizeColumnWidths(
  defaultWidths: Record<string, number>,
  savedWidths?: string | null
): Record<string, number> {
  return reconcileColumnWidths(defaultWidths, parseColumnWidthsSetting(savedWidths))
}

export function reconcileColumnWidths(
  defaultWidths: Record<string, number>,
  currentWidths: Record<string, number>
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(defaultWidths).map(([key, defaultWidth]) => [
      key,
      clampColumnWidth(currentWidths[key] ?? defaultWidth),
    ])
  )
}
