<script setup lang="ts">
import type { Note } from "../stores/notes";

defineProps<{ note: Note }>();

const emit = defineEmits<{
  open: [note: Note];
  delete: [note: Note];
}>();

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}
</script>

<template>
  <article
    class="card group relative mb-4 cursor-pointer break-inside-avoid rounded-card border bg-base-100 p-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-float focus-visible:-translate-y-0.5 focus-visible:shadow-float"
    role="button"
    tabindex="0"
    :aria-label="`Modifier la note ${note.title || 'sans titre'}`"
    @click="emit('open', note)"
    @keydown.enter="emit('open', note)"
    @keydown.space.prevent="emit('open', note)"
  >
    <button
      class="btn btn-circle btn-ghost btn-sm absolute top-3 right-3 bg-surface/90 text-muted opacity-0 shadow-sm hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
      type="button"
      :aria-label="`Supprimer la note ${note.title || 'sans titre'}`"
      title="Supprimer"
      @click.stop="emit('delete', note)"
      @keydown.stop
    >
      <UIcon name="lucide:trash-2" class="size-4" aria-hidden="true" />
    </button>
    <h3 v-if="note.title" class="font-semibold leading-6">{{ note.title }}</h3>
    <div
      v-if="note.format === 'rich-text'"
      class="note-content line-clamp-5 text-sm leading-6 text-ink/85"
      :class="{ 'mt-2': note.title }"
      v-html="note.contentHtml"
    />
    <p
      v-else
      class="line-clamp-5 whitespace-pre-wrap text-sm leading-6 text-ink/85"
      :class="{ 'mt-2': note.title }"
    >
      {{ note.content }}
    </p>
    <time class="mt-5 block text-xs text-muted" :datetime="note.createdAt">
      {{ formatDate(note.createdAt) }}
    </time>
  </article>
</template>
