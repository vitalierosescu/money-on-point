"use client"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { NativeSelect } from "@/components/ui/native-select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { SelectProps } from "@radix-ui/react-select"
import { format } from "date-fns"
import { CalendarIcon, Upload } from "lucide-react"
import { InputHTMLAttributes, TextareaHTMLAttributes, useEffect, useRef, useState } from "react"

type FormInputProps = InputHTMLAttributes<HTMLInputElement> & {
  title?: string
  hideIfEmpty?: boolean
  isRequired?: boolean
}

export function FormInput({ title, hideIfEmpty = false, isRequired = false, ...props }: FormInputProps) {
  const isEmpty = (!props.defaultValue || props.defaultValue.toString().trim() === "") && !props.value

  if (hideIfEmpty && isEmpty) {
    return null
  }

  return (
    <FormField
      label={title}
      required={isRequired}
      htmlFor={props.id || (props as { name?: string }).name}
    >
      <Input
        {...props}
        id={props.id || (props as { name?: string }).name}
        className={cn("bg-background", isRequired && isEmpty && "bg-yellow-50", props.className)}
        data-1p-ignore
      />
    </FormField>
  )
}

type FormTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  title?: string
  hideIfEmpty?: boolean
  isRequired?: boolean
}

export function FormTextarea({ title, hideIfEmpty = false, isRequired = false, ...props }: FormTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isEmpty = (!props.defaultValue || props.defaultValue.toString().trim() === "") && !props.value

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    const resize = () => {
      textarea.style.height = "auto"
      textarea.style.height = `${textarea.scrollHeight + 5}px`
    }

    resize() // initial resize

    textarea.addEventListener("input", resize)
    return () => textarea.removeEventListener("input", resize)
  }, [props.value, props.defaultValue])

  if (hideIfEmpty && isEmpty) {
    return null
  }

  return (
    <FormField
      label={title}
      required={isRequired}
      htmlFor={props.id || (props as { name?: string }).name}
    >
      <Textarea
        ref={textareaRef}
        {...props}
        id={props.id || (props as { name?: string }).name}
        className={cn("bg-background", isRequired && isEmpty && "bg-yellow-50", props.className)}
        data-1p-ignore
      />
    </FormField>
  )
}

export const FormSelect = ({
  items,
  title,
  emptyValue,
  placeholder,
  hideIfEmpty = false,
  isRequired = false,
  onValueChange,
  name,
  id,
  value,
  defaultValue,
}: {
  items: Array<{ code: string; name: string; color?: string; badge?: string; logo?: string }>
  title?: string
  emptyValue?: string
  placeholder?: string
  hideIfEmpty?: boolean
  isRequired?: boolean
  name?: string
  id?: string
} & SelectProps) => {
  const allowedValues = new Set(items.map((item) => item.code))
  const normalizeSelectValue = (candidate: string | undefined) => {
    if (!candidate || candidate.trim() === "") return ""
    const trimmed = candidate.trim()
    return allowedValues.has(trimmed) ? trimmed : ""
  }

  const normalizedValue = normalizeSelectValue(value as string | undefined)
  const normalizedDefaultValue = normalizeSelectValue(defaultValue as string | undefined)
  const isControlled = value !== undefined
  const selectValue = isControlled ? normalizedValue : normalizedDefaultValue
  const isEmpty = !selectValue

  const labelId = title ? `${id || name || "select"}-label` : undefined
  const controlId = id || name

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    onValueChange?.(event.target.value)
  }

  if (hideIfEmpty && isEmpty) {
    return null
  }

  return (
    <FormField label={title} required={isRequired} htmlFor={controlId}>
      <NativeSelect
        name={name}
        id={controlId}
        aria-labelledby={labelId}
        className={cn(isRequired && isEmpty && "bg-yellow-50")}
        onChange={handleChange}
        {...(isControlled ? { value: normalizedValue } : { defaultValue: normalizedDefaultValue })}
      >
        <option value="" disabled={isRequired}>
          {placeholder || emptyValue || "Select an option"}
        </option>
        {items.map((item) => (
          <option key={item.code} value={item.code}>
            {item.badge ? `${item.name} (${item.badge})` : item.name}
          </option>
        ))}
      </NativeSelect>
    </FormField>
  )
}

export const FormDate = ({
  name,
  title,
  placeholder = "Select date",
  defaultValue,
  ...props
}: {
  name: string
  title?: string
  placeholder?: string
  defaultValue?: Date
}) => {
  const [date, setDate] = useState<Date | undefined>(defaultValue)
  const [manualInput, setManualInput] = useState<string>(date ? format(date, "yyyy-MM-dd") : "")

  const handleDateSelect = (newDate: Date | undefined) => {
    setDate(newDate)
    setManualInput(newDate ? format(newDate, "yyyy-MM-dd") : "")
  }

  const handleManualInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setManualInput(e.target.value)
    setDate(undefined)
    try {
      const newDate = new Date(e.currentTarget.value)
      if (!isNaN(newDate.getTime())) {
        setDate(newDate)
      }
    } catch {}
  }

  return (
    <FormField label={title} htmlFor={name}>
      <div className="relative">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={"outline"}
              className={cn(
                "w-full justify-start text-left font-normal bg-background",
                !date && "text-muted-foreground"
              )}
            >
              {date ? format(date, "PPP") : placeholder}
              <CalendarIcon className="ml-1 h-4 w-4 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-1 flex flex-col gap-2" align="start">
            <Input
              type="text"
              name={name}
              value={manualInput}
              onChange={handleManualInputChange}
              className="text-center"
            />
            <Calendar mode="single" selected={date} onSelect={handleDateSelect} initialFocus {...props} />
          </PopoverContent>
        </Popover>
      </div>
    </FormField>
  )
}

export const FormAvatar = ({
  title,
  defaultValue,
  className,
  onChange,
  ...props
}: {
  title?: string
  defaultValue?: string
  className?: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
} & InputHTMLAttributes<HTMLInputElement>) => {
  const [preview, setPreview] = useState<string | null>(defaultValue || null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }

    // Call the original onChange if provided
    if (onChange) {
      onChange(e)
    }
  }

  return (
    <label className="inline-block">
      {title && <span className="text-sm font-medium">{title}</span>}
      <div className={cn("relative group", className)}>
        <div className="absolute inset-0 flex items-center justify-center bg-background rounded-lg overflow-hidden">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Avatar preview" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <span className="text-muted-foreground">No image</span>
            </div>
          )}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
          <input
            type="file"
            accept="image/*"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={handleFileChange}
            {...props}
          />
          <Upload className="z-10 bg-white/30 text-white p-1 rounded-sm h-7 w-8 cursor-pointer" />
        </div>
      </div>
    </label>
  )
}
