<script setup lang="ts">
import Button from "@/components/ui/button/Button.vue";
import Card from "@/components/ui/card/Card.vue";
import CardContent from "@/components/ui/card/CardContent.vue";
import type { Category, Folder, Note } from "../../stores/notes";

const props = defineProps<{
  folder: Folder;
  latestNote?: Note;
  summary: string;
  category?: Category | null;
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
  <article class="relative mb-4 w-full pb-2">
    <div
      class="absolute inset-x-2 top-2 bottom-1 rounded-card border bg-card shadow-sm"
    />
    <div
      class="absolute inset-x-1 top-1 bottom-2 rounded-card border bg-card shadow-sm"
    />
    <Card
      class="relative w-full cursor-pointer gap-0 rounded-card py-0 shadow-md transition duration-200 hover:-translate-y-0.5 hover:shadow-float focus-visible:-translate-y-0.5 focus-visible:shadow-float"
    >
      <CardContent
        class="group relative break-inside-avoid p-5"
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
            class="line-clamp-10 whitespace-pre-wrap text-sm leading-6 text-ink/75"
            :class="{ 'mt-1': latestNote.title }"
          >
            {{ notePreview(latestNote) }}
          </p>
        </div>

        <UButtonGroup
          class="absolute top-3 right-3 flex opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
        >
          <slot name="menu-before" />

          <UButton
            variant="outline"
            size="icon-sm"
            type="button"
            :aria-label="`Renommer le dossier ${folder.name}`"
            title="Renommer"
            @click.stop="emit('rename', folder)"
            @keydown.stop
          >
            <UIcon name="lucide:pencil" class="size-4" aria-hidden="true" />
          </UButton>
          <UButton
            variant="outline"
            size="icon-sm"
            class="text-muted hover:bg-red-50 hover:text-red-600"
            type="button"
            :aria-label="`Supprimer le dossier ${folder.name}`"
            title="Supprimer"
            @click.stop="emit('delete', folder)"
            @keydown.stop
          >
            <UIcon name="lucide:trash-2" class="size-4" aria-hidden="true" />
          </UButton>

          <slot name="menu-after" />
        </UButtonGroup>

        <span
          v-if="category"
          class="inline-flex max-w-full items-center gap-1.5 truncate rounded-lg px-2 py-2 text-xs font-medium w-max mt-5"
          :style="{
            backgroundColor: `${category.color}26`,
            color: category.color,
          }"
        >
          <span
            class="size-1.5 shrink-0 rounded-full"
            :style="{ backgroundColor: category.color }"
            aria-hidden="true"
          />
          <span class="truncate">{{ category.name }}</span>
        </span>
      </CardContent>
    </Card>
  </article>
</template>
