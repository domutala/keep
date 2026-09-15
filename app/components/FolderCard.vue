<script setup lang="ts">
import type { Folder, Note } from "../stores/notes";

const props = defineProps<{
  folder: Folder;
  latestNote?: Note;
  summary: string;
}>();

const emit = defineEmits<{
  open: [folder: Folder];
  rename: [folder: Folder];
  delete: [folder: Folder];
}>();

function notePreview(note: Note) {
  return note.format === "rich-text" ? note.contentText : note.content;
}
</script>

<template>
  <article class="stack mb-4 w-full">
    <div
      class="card rounded-card w-full cursor-pointer border bg-base-100 shadow-md transition duration-200 hover:-translate-y-0.5 hover:shadow-float focus-visible:-translate-y-0.5 focus-visible:shadow-float"
    >
      <div
        class="card-body group relative break-inside-avoid p-5"
        role="button"
        tabindex="0"
        :aria-label="`Ouvrir le dossier ${folder.name}`"
        @click="emit('open', folder)"
        @keydown.enter="emit('open', folder)"
        @keydown.space.prevent="emit('open', folder)"
      >
        <div class="flex items-start gap-3 pr-16">
          <span
            class="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700"
          >
            <UIcon
              name="lucide:folder-closed"
              class="size-5"
              aria-hidden="true"
            />
          </span>
          <div class="min-w-0">
            <h3 class="truncate font-semibold leading-6">{{ folder.name }}</h3>
            <p class="mt-1 text-xs text-muted">{{ summary }}</p>
          </div>
        </div>

        <div v-if="latestNote" class="mt-4 border-t pt-3">
          <p v-if="latestNote.title" class="truncate text-sm font-medium">
            {{ latestNote.title }}
          </p>
          <p
            class="line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-ink/75"
            :class="{ 'mt-1': latestNote.title }"
          >
            {{ notePreview(latestNote) }}
          </p>
        </div>

        <div
          class="absolute top-3 right-3 flex opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
        >
          <button
            class="btn btn-circle btn-ghost btn-sm"
            type="button"
            :aria-label="`Renommer le dossier ${folder.name}`"
            title="Renommer"
            @click.stop="emit('rename', folder)"
            @keydown.stop
          >
            <UIcon name="lucide:pencil" class="size-4" aria-hidden="true" />
          </button>
          <button
            class="btn btn-circle btn-ghost btn-sm text-muted hover:bg-red-50 hover:text-red-600"
            type="button"
            :aria-label="`Supprimer le dossier ${folder.name}`"
            title="Supprimer"
            @click.stop="emit('delete', folder)"
            @keydown.stop
          >
            <UIcon name="lucide:trash-2" class="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
    <div class="card bg-base-100 shadow rounded-card">
      <div class="card-body" />
    </div>
    <div class="card bg-base-100 shadow-sm rounded-card">
      <div class="card-body" />
    </div>
  </article>
</template>
