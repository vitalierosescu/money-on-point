"use client"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { EmptyState } from "@/components/ui/empty-state"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Check, Edit, Trash2 } from "lucide-react"
import { useState } from "react"

interface CrudColumn<T> {
  key: keyof T
  label: string
  type?: "text" | "number" | "checkbox" | "select" | "color"
  options?: string[]
  defaultValue?: string | boolean
  editable?: boolean
}

interface CrudProps<T> {
  items: T[]
  columns: CrudColumn<T>[]
  onDelete: (id: string) => Promise<{ success: boolean; error?: string }>
  onAdd: (data: Partial<T>) => Promise<{ success: boolean; error?: string }>
  onEdit?: (id: string, data: Partial<T>) => Promise<{ success: boolean; error?: string }>
}

export function CrudTable<T extends { id?: string; code?: string } & Record<string, unknown>>(props: CrudProps<T>) {
  const { items: tableItems, columns, onDelete, onAdd, onEdit } = props
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newItem, setNewItem] = useState<Partial<T>>(itemDefaults(columns))
  const [editingItem, setEditingItem] = useState<Partial<T>>(itemDefaults(columns))

  const FormCell = (item: T, column: CrudColumn<T>) => {
    if (column.type === "checkbox") {
      return item[column.key] ? <Check /> : ""
    }
    if (column.type === "color" || column.key === "color") {
      const value = (item[column.key] as string) || ""
      return (
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full border" style={{ backgroundColor: value || "#ffffff" }} />
          <span>{value}</span>
        </div>
      )
    }
    return String(item[column.key] ?? "")
  }

  const EditFormCell = (item: T, column: CrudColumn<T>) => {
    if (column.type === "checkbox") {
      return (
        <Checkbox
          checked={Boolean(editingItem[column.key])}
          aria-label={String(column.label)}
          onCheckedChange={(checked) =>
            setEditingItem({
              ...editingItem,
              [column.key]: checked === true,
            })
          }
        />
      )
    } else if (column.type === "select") {
      return (
        <NativeSelect
          value={String(editingItem[column.key] ?? "")}
          aria-label={String(column.label)}
          onChange={(e) =>
            setEditingItem({
              ...editingItem,
              [column.key]: e.target.value,
            })
          }
        >
          {column.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </NativeSelect>
      )
    } else if (column.type === "color" || column.key === "color") {
      return (
        <div className="flex items-center gap-2">
          <Input
            type="color"
            className="h-8 w-8 p-0 border-0 bg-transparent"
            value={(editingItem[column.key] as string) || "#000"}
            onChange={(e) =>
              setEditingItem({
                ...editingItem,
                [column.key]: e.target.value,
              })
            }
            aria-label={`${String(column.label)} color`}
          />
          <Input
            type="text"
            value={(editingItem[column.key] as string) || ""}
            aria-label={String(column.label)}
            onChange={(e) =>
              setEditingItem({
                ...editingItem,
                [column.key]: e.target.value,
              })
            }
            placeholder="#FFFFFF"
          />
        </div>
      )
    }

    return (
      <Input
        type="text"
        value={String(editingItem[column.key] ?? "")}
        aria-label={String(column.label)}
        onChange={(e) =>
          setEditingItem({
            ...editingItem,
            [column.key]: e.target.value,
          })
        }
      />
    )
  }

  const AddFormCell = (column: CrudColumn<T>) => {
    if (column.type === "checkbox") {
      return (
        <Checkbox
          checked={Boolean(newItem[column.key] || column.defaultValue)}
          aria-label={String(column.label)}
          onCheckedChange={(checked) =>
            setNewItem({
              ...newItem,
              [column.key]: checked === true,
            })
          }
        />
      )
    } else if (column.type === "select") {
      return (
        <NativeSelect
          value={String(newItem[column.key] || column.defaultValue || "")}
          aria-label={String(column.label)}
          onChange={(e) =>
            setNewItem({
              ...newItem,
              [column.key]: e.target.value,
            })
          }
        >
          {column.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </NativeSelect>
      )
    } else if (column.type === "color" || column.key === "color") {
      return (
        <div className="flex items-center gap-2">
          <Input
            type="color"
            className="h-8 w-8 p-0 border-0 bg-transparent"
            value={String(newItem[column.key] || column.defaultValue || "#000")}
            onChange={(e) =>
              setNewItem({
                ...newItem,
                [column.key]: e.target.value,
              })
            }
            aria-label={`${String(column.label)} color`}
          />
          <Input
            type="text"
            value={String(newItem[column.key] || column.defaultValue || "")}
            aria-label={String(column.label)}
            onChange={(e) =>
              setNewItem({
                ...newItem,
                [column.key]: e.target.value,
              })
            }
            placeholder="#FFFFFF"
          />
        </div>
      )
    }
    return (
      <Input
        type={column.type || "text"}
        value={String(newItem[column.key] || column.defaultValue || "")}
        aria-label={String(column.label)}
        onChange={(e) =>
          setNewItem({
            ...newItem,
            [column.key]: e.target.value,
          })
        }
      />
    )
  }

  const handleAdd = async () => {
    try {
      const result = await onAdd(newItem)
      if (result.success) {
        setIsAdding(false)
        setNewItem(itemDefaults(columns))
      } else {
        alert(result.error)
      }
    } catch (error) {
      console.error("Failed to add item:", error)
    }
  }

  const handleEdit = async (id: string) => {
    if (!onEdit) return
    try {
      const result = await onEdit(id, editingItem)
      if (result.success) {
        setEditingId(null)
        setEditingItem({})
      } else {
        alert(result.error)
      }
    } catch (error) {
      console.error("Failed to edit item:", error)
    }
  }

  const startEditing = (item: T) => {
    setEditingId(item.code ?? item.id ?? null)
    setEditingItem(item)
  }

  const getItemId = (item: T) => item.code ?? item.id ?? null
  const getItemLabel = (item: T) => String(item["name"] ?? getItemId(item) ?? "item")
  const isItemDeletable = (item: T) => Boolean(item["isDeletable"])

  const handleDelete = async (id: string) => {
    try {
      const result = await onDelete(id)
      if (!result.success) {
        alert(result.error)
      }
    } catch (error) {
      console.error("Failed to delete item:", error)
    }
  }

  if (tableItems.length === 0 && !isAdding) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="No items yet."
          description="Add your first item to get started."
        />
        <Button
          onClick={() => {
            setIsAdding(true)
            setEditingId(null)
          }}
          aria-label="Add new item"
        >
          Add New
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={String(column.key)}>{column.label}</TableHead>
            ))}
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tableItems.map((item: T, index: number) => {
            const itemId = getItemId(item)
            const itemLabel = getItemLabel(item)

            return (
              <TableRow key={itemId ?? index}>
                {columns.map((column) => (
                  <TableCell key={String(column.key)} className="first:font-semibold">
                    {editingId === itemId && column.editable
                      ? EditFormCell(item, column)
                      : FormCell(item, column)}
                  </TableCell>
                ))}
                <TableCell>
                  <div className="flex gap-2">
                    {editingId === itemId && itemId ? (
                      <>
                        <Button size="sm" onClick={() => handleEdit(itemId)} aria-label="Save changes">
                          Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingId(null)} aria-label="Cancel editing">
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        {onEdit && itemId && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              startEditing(item)
                              setIsAdding(false)
                            }}
                            aria-label={`Edit ${itemLabel}`}
                          >
                            <Edit />
                          </Button>
                        )}
                        {itemId && isItemDeletable(item) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(itemId)}
                            aria-label={`Delete ${itemLabel}`}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
          {isAdding && (
            <TableRow>
              {columns.map((column) => (
                <TableCell key={String(column.key)} className="first:font-semibold">
                  {column.editable && AddFormCell(column)}
                </TableCell>
              ))}
              <TableCell>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAdd} aria-label="Save new item">
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setIsAdding(false)} aria-label="Cancel adding new item">
                    Cancel
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {!isAdding && (
        <Button
          onClick={() => {
            setIsAdding(true)
            setEditingId(null)
          }}
          aria-label="Add new item"
        >
          Add New
        </Button>
      )}
    </div>
  )
}
function itemDefaults<T>(columns: CrudColumn<T>[]) {
  return columns.reduce((acc, column) => {
    acc[column.key] = column.defaultValue as T[keyof T]
    return acc
  }, {} as Partial<T>)
}
