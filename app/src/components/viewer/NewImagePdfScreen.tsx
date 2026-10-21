import { useEffect, useRef, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeft, ArrowRight, GripVertical, Loader2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { useDocument } from '../../document/documentSession'
import { imagesToPdfBytes } from '../../operations/addOp'
import { t } from '../../i18n/ja'
import { toUserMessage } from '../../utils/userMessage'
import PrivacyBadge from '../tools/shared/PrivacyBadge'
import { appendImageFiles, moveImageDraft, type ImageDraft } from './newImagePdf'

interface Props {
  initialImages: ImageDraft[]
  onCancel: () => void
}

function SortableImage({ image, onRemove }: { image: ImageDraft, onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
  })

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 rounded-2xl border bg-white p-3 shadow-sm dark:bg-zinc-900 ${
        isDragging ? 'z-20 border-rose-400 shadow-lg' : 'border-gray-100 dark:border-white/5'
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={t.viewer.moveImage(image.name)}
        className="touch-none cursor-grab rounded-xl p-2 text-gray-400 hover:bg-gray-50 hover:text-rose-500 dark:hover:bg-black"
      >
        <GripVertical size={20} />
      </button>
      <div className="h-20 w-16 shrink-0 overflow-hidden rounded-xl border border-gray-100 bg-gray-50 dark:border-zinc-800 dark:bg-black">
        <img src={image.previewUrl} alt="" className="h-full w-full object-contain" />
      </div>
      <p className="min-w-0 flex-1 truncate text-sm font-bold text-gray-700 dark:text-zinc-200">
        {image.name}
      </p>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t.viewer.removeImage(image.name)}
        className="rounded-xl p-2 text-gray-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
      >
        <Trash2 size={18} />
        <span className="sr-only">削除</span>
      </button>
    </li>
  )
}

export default function NewImagePdfScreen({ initialImages, onCancel }: Props) {
  const { openDocument, isBusy } = useDocument()
  const [images, setImages] = useState(initialImages)
  const [name, setName] = useState(t.viewer.newImagePdfDefaultName)
  const [isPreparing, setIsPreparing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const ownedUrlsRef = useRef(new Set(initialImages.map((image) => image.previewUrl)))

  useEffect(() => () => {
    for (const url of ownedUrlsRef.current) URL.revokeObjectURL(url)
    ownedUrlsRef.current.clear()
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const addFiles = async (files: FileList | File[]) => {
    if (files.length === 0) return
    setIsPreparing(true)
    try {
      const next = await appendImageFiles(images, Array.from(files), (_file, bytes) => {
        const type = bytes[0] === 0x89 ? 'image/png' : 'image/jpeg'
        const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type }))
        ownedUrlsRef.current.add(url)
        return url
      })
      setImages(next)
    } catch (err) {
      console.error(err)
      toast.error(toUserMessage(err))
    } finally {
      setIsPreparing(false)
    }
  }

  const removeImage = (id: string) => {
    setImages((current) => {
      const removed = current.find((image) => image.id === id)
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl)
        ownedUrlsRef.current.delete(removed.previewUrl)
      }
      return current.filter((image) => image.id !== id)
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over) return
    setImages((current) => moveImageDraft(current, String(event.active.id), String(event.over?.id)))
  }

  const createPdf = async () => {
    if (images.length === 0 || isPreparing || isBusy) return
    setIsPreparing(true)
    try {
      const bytes = await imagesToPdfBytes(images)
      const documentName = name.trim().replace(/\.pdf$/i, '') || t.viewer.newImagePdfDefaultName
      await openDocument(bytes, documentName, { isDirty: true })
    } catch (err) {
      console.error(err)
      toast.error(toUserMessage(err))
    } finally {
      setIsPreparing(false)
    }
  }

  const processing = isPreparing || isBusy

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,image/png,image/jpeg"
        className="hidden"
        onChange={(event) => {
          const files = event.target.files
          event.target.value = ''
          if (files) void addFiles(files)
        }}
      />

      <button
        type="button"
        onClick={onCancel}
        disabled={processing}
        className="mb-5 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-900"
      >
        <ArrowLeft size={17} />
        {t.viewer.backToStart}
      </button>

      <section className="rounded-[2rem] border border-gray-100 bg-white p-6 shadow-sm dark:border-white/5 dark:bg-zinc-900 sm:p-8">
        <div className="mb-6">
          <p className="mb-2 text-xs font-black text-rose-500">{t.viewer.imageCount(images.length)}</p>
          <h1 className="text-2xl font-black text-gray-800 dark:text-white">{t.viewer.imageOrderTitle}</h1>
          <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-zinc-400">
            {t.viewer.imageOrderHint}
          </p>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={images.map((image) => image.id)} strategy={verticalListSortingStrategy}>
            <ol className="space-y-2">
              {images.map((image) => (
                <SortableImage key={image.id} image={image} onRemove={() => removeImage(image.id)} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={processing}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 py-3 text-sm font-bold text-gray-500 hover:border-rose-300 hover:text-rose-500 disabled:opacity-40 dark:border-zinc-700"
        >
          <Plus size={17} />
          {t.viewer.addImages}
        </button>

        <label className="mt-6 block text-xs font-bold text-gray-500 dark:text-zinc-400">
          {t.viewer.imageFileName}
          <div className="mt-2 flex items-center rounded-2xl bg-gray-50 px-4 dark:bg-black">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={processing}
              className="min-w-0 flex-1 bg-transparent py-3 text-sm font-bold text-gray-800 outline-none dark:text-white"
            />
            <span className="text-sm font-bold text-gray-400">.pdf</span>
          </div>
        </label>

        <button
          type="button"
          onClick={createPdf}
          disabled={processing || images.length === 0}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-500 py-4 text-sm font-black text-white shadow-lg shadow-rose-500/20 hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {processing ? <Loader2 size={18} className="animate-spin" /> : <ArrowRight size={18} />}
          {processing ? t.viewer.creatingImagePdf : t.viewer.createImagePdf}
        </button>
      </section>

      <PrivacyBadge />
    </div>
  )
}
