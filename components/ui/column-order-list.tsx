"use client"

import { GripVertical } from "lucide-react"
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"

import { cn } from "@/lib/utils"

type ColumnOrderItem = {
  id: string
  label: string
}

export function ColumnOrderList({
  items,
  onChange,
  emptyState = "No columns available.",
  handleLabel = "Drag to reorder",
}: {
  items: ColumnOrderItem[]
  onChange: (nextIds: string[]) => void
  emptyState?: string
  handleLabel?: string
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((item) => item.id === active.id)
    const newIndex = items.findIndex((item) => item.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    onChange(arrayMove(items.map((item) => item.id), oldIndex, newIndex))
  }

  if (items.length === 0) {
    return <div className="rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground">{emptyState}</div>
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {items.map((item) => (
            <SortableColumnOrderItem key={item.id} item={item} handleLabel={handleLabel} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

function SortableColumnOrderItem({
  item,
  handleLabel,
}: {
  item: ColumnOrderItem
  handleLabel: string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={cn(
        "flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm",
        isDragging && "opacity-80 shadow-sm"
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground cursor-grab active:cursor-grabbing"
        aria-label={handleLabel}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="truncate">{item.label}</span>
    </div>
  )
}
